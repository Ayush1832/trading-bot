"""
Precision Swing Bot — multi-timeframe confluence trading loop.

Scan cycle (every 15 minutes):
  1. Skip if trade already opened today (max 1 trade/day)
  2. For each symbol: fetch 1W + 1D + 4H + 1H candles (weekly cached)
  3. Run check_entry_signal() — 5-condition cascade
  4. If any symbol fires: select_best_signal() → grade A+ > A > B → R:R → divergence
  5. Open trade with full position; simultaneously set limit orders at TP1 and TP2

Exit monitoring (every 15 s while trade open):
  - Before TP1: watch for TP1_PARTIAL → execute 50% exit, move SL to breakeven
  - After TP1:  watch for TAKE_PROFIT_2, TRAILING_SL (ATR-based), BREAKEVEN_SL, TIMEOUT
"""

import asyncio
import logging
import time
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import Settings
from backend.core.state import BotState
from backend.core.websocket import ws_manager
from backend.db import crud
from backend.exchange import MexcExchange
from backend.notify import TelegramNotifier
from backend.paper_trading import paper_trader
from backend.risk import calculate_position_qty, check_daily_drawdown
from backend.strategy import (
    check_entry_signal,
    select_best_signal,
    compute_atr_tsl,
    compute_rr_ratio,
    check_exit,
)

logger = logging.getLogger(__name__)

SCAN_INTERVAL = 900    # 15 minutes — one 4H candle is 240 min, 1H candle is 60 min
MONITOR_INTERVAL = 15  # seconds — price check while trade is open

# Minimum 1H candles needed for indicators (EMA200 daily needs 200 daily candles)
MIN_1H_CANDLES = 100
MIN_4H_CANDLES = 100
MIN_1D_CANDLES = 220   # EMA200 needs 200 + buffer
MIN_1W_CANDLES = 210   # weekly EMA200 needs 200 + buffer


def should_abort_after_fill(
    fill_price: float, sl_price: float, tp1_price: float, min_rr: float
) -> tuple[bool, float]:
    """
    After a buy fills, re-check reward:risk using the ACTUAL fill price.

    The signal computes R:R from the planned entry (the 1H close), but a
    marketable limit can fill higher (slippage), which shrinks reward and grows
    risk. Returns (abort, actual_rr) — abort is True when the post-fill R:R has
    dropped below the configured minimum.
    """
    actual_rr = compute_rr_ratio(fill_price, sl_price, tp1_price)
    return (actual_rr < min_rr, actual_rr)


# ------------------------------------------------------------------ #
# Weekly candle cache
# ------------------------------------------------------------------ #

_weekly_cache: dict[str, pd.DataFrame] = {}   # symbol → cached weekly DataFrame
_weekly_cache_ts: dict[str, float] = {}        # symbol → timestamp of last cached weekly candle


def _should_refresh_weekly(symbol: str, new_df: pd.DataFrame) -> bool:
    """Return True if the weekly cache should be updated (new weekly candle appeared)."""
    if symbol not in _weekly_cache or new_df is None or new_df.empty:
        return True
    last_ts = float(new_df.iloc[-2]["ts"].timestamp())
    cached_ts = _weekly_cache_ts.get(symbol, 0.0)
    return last_ts > cached_ts


# ------------------------------------------------------------------ #
# Fetch all four timeframes for one symbol
# ------------------------------------------------------------------ #

async def _fetch_4tf(
    exchange: MexcExchange,
    symbol: str,
    config: Settings,
) -> tuple[pd.DataFrame | None, pd.DataFrame | None, pd.DataFrame | None, pd.DataFrame | None]:
    """
    Fetch 1W, 1D, 4H, 1H candles.
    Weekly data is cached between scans (only refreshes when a new weekly candle closes).
    Returns (weekly_df, daily_df, h4_df, h1_df) — any may be None on fetch error.
    """
    global _weekly_cache, _weekly_cache_ts

    # Fetch non-weekly in parallel
    async def _fetch(tf, limit):
        try:
            return await exchange.fetch_ohlcv(symbol, tf, limit=limit)
        except Exception as e:
            logger.warning(f"[FETCH] {symbol} {tf}: {e}")
            return None

    daily_f = _fetch(config.tf_daily, MIN_1D_CANDLES + 10)
    h4_f    = _fetch(config.tf_4h,    MIN_4H_CANDLES + 10)
    h1_f    = _fetch(config.tf_1h,    MIN_1H_CANDLES + 10)

    daily_df, h4_df, h1_df = await asyncio.gather(daily_f, h4_f, h1_f)

    # Weekly: fetch fresh then decide whether to update cache
    try:
        fresh_weekly = await exchange.fetch_ohlcv(symbol, config.tf_weekly, limit=MIN_1W_CANDLES + 10)
        if fresh_weekly is not None and not fresh_weekly.empty:
            if _should_refresh_weekly(symbol, fresh_weekly):
                _weekly_cache[symbol] = fresh_weekly
                _weekly_cache_ts[symbol] = float(fresh_weekly.iloc[-2]["ts"].timestamp())
        weekly_df = _weekly_cache.get(symbol)
    except Exception as e:
        logger.warning(f"[FETCH] {symbol} 1w: {e}")
        weekly_df = _weekly_cache.get(symbol)

    return weekly_df, daily_df, h4_df, h1_df


# ------------------------------------------------------------------ #
# Multi-symbol scanner
# ------------------------------------------------------------------ #

async def scan_all_symbols(
    exchange: MexcExchange,
    state: BotState,
    config: Settings,
) -> tuple[str | None, dict | None]:
    """
    Scan all configured symbols in parallel (one async task per symbol).
    Updates state.scanner for dashboard.
    Returns (best_symbol, signal_dict) or (None, None).
    """
    async def _scan_one(symbol: str):
        weekly_df, daily_df, h4_df, h1_df = await _fetch_4tf(exchange, symbol, config)
        result = check_entry_signal(weekly_df, daily_df, h4_df, h1_df, symbol=symbol, config=config)
        return symbol, result

    tasks = [_scan_one(sym) for sym in config.symbols]
    results = await asyncio.gather(*tasks)

    full_signals = []
    for symbol, result in results:
        with state._lock:
            state.update_scanner(symbol, result)
        if result.get("signal"):
            full_signals.append((symbol, result))
            with state._lock:
                state.signals_today += 1

    await ws_manager.broadcast({
        "type": "scanner_update",
        "data": {sym: s.to_dict() for sym, s in state.scanner.items()},
    })

    if not full_signals:
        return None, None

    best_sym, best_sig = select_best_signal(full_signals)
    logger.info(
        f"[SIGNAL] {best_sym} grade={best_sig.get('grade')} "
        f"R:R={best_sig.get('rr_ratio'):.1f} | "
        f"fib={best_sig.get('values', {}).get('fib_zone')}"
    )
    return best_sym, best_sig


# ------------------------------------------------------------------ #
# Crash recovery
# ------------------------------------------------------------------ #

async def recover_open_trade(state: BotState, db: AsyncSession, notifier: TelegramNotifier):
    """Restore bot state from DB if a trade was open when bot last stopped."""
    open_trade = await crud.get_open_trade(db)
    if open_trade is None:
        return

    logger.warning(f"[RECOVERY] Found open trade #{open_trade.id} for {open_trade.symbol} — resuming")
    with state._lock:
        state.trade_open = True
        state.trade_opened_today = True
        state.current_symbol = open_trade.symbol
        state.entry_price = open_trade.entry_price
        state.entry_time = open_trade.entry_time.timestamp()
        state.entry_order_id = open_trade.entry_order_id
        state.peak_price = open_trade.peak_price or open_trade.entry_price
        state.sl_price = open_trade.hard_sl_price
        state.tp1_price = open_trade.take_profit_price
        state.tp2_price = open_trade.tp2_price
        state.atr_1h = open_trade.entry_1h_atr
        state.rr_ratio = open_trade.rr_ratio
        state.grade = open_trade.grade
        state.qty_total = open_trade.qty
        state.half_exited = bool(open_trade.half_exited)
        state.qty_remaining = open_trade.qty * (0.5 if state.half_exited else 1.0)
        state.tp1_exit_price = open_trade.tp1_exit_price
        state.tp1_pnl_usdt = open_trade.tp1_pnl_usdt
        state.open_trade_id = open_trade.id
        state.sl_order_id = open_trade.sl_order_id
        state.exit_in_progress = False
        state.sell_retry_count = 0
        # Reconstruct TSL: ATR-based if we have atr_1h, else conservative fixed %
        if state.atr_1h and state.peak_price:
            from backend.core.config import settings
            state.trailing_sl = compute_atr_tsl(
                state.peak_price, state.sl_price or 0,
                state.atr_1h, settings.atr_1h_multiplier
            )
        else:
            state.trailing_sl = state.sl_price

    await notifier.send_error(
        f"Bot restarted with open trade #{open_trade.id} ({open_trade.symbol}) — monitoring resumed."
    )


# ------------------------------------------------------------------ #
# Exchange-side stop-loss helpers (catastrophe floor)
# ------------------------------------------------------------------ #

async def _place_exchange_stop(
    state: BotState, exchange: MexcExchange, db: AsyncSession,
    notifier: TelegramNotifier, config: Settings,
    symbol: str, qty: float, trigger_price: float, trade_id,
):
    """
    Best-effort: place a resting stop-loss on the exchange. Never raises.
    Stores the order id in state + DB. On failure, alerts but lets the bot
    continue (the in-process stop still runs as long as the bot is up).
    """
    if state.dry_run or not config.use_exchange_stop_loss or not trigger_price:
        return None
    try:
        order = await exchange.place_stop_loss(symbol, qty, trigger_price)
        sl_id = order.get("id")
        with state._lock:
            state.sl_order_id = sl_id
        if trade_id:
            await crud.update_trade(db, trade_id, {"sl_order_id": sl_id})
        await crud.save_log(db, "ORDER", f"{symbol} exchange stop-loss @ {trigger_price:.4f} id={sl_id}", trade_id=trade_id)
        return sl_id
    except Exception as e:
        logger.error(f"[STOP] Failed to place exchange stop-loss for {symbol}: {e}")
        await notifier.send_error(
            f"⚠ Exchange stop-loss FAILED for {symbol}: {e}. "
            f"In-process stop is still active — keep the bot RUNNING until this trade closes."
        )
        with state._lock:
            state.sl_order_id = None
        return None


async def _cancel_resting_stop(state: BotState, exchange: MexcExchange) -> bool:
    """Cancel the resting exchange stop so its reserved asset is freed for a
    bot-driven sell. Returns True if there is no stop or it was cancelled."""
    if state.dry_run:
        return True
    with state._lock:
        sl_id = state.sl_order_id
        symbol = state.current_symbol
    if not sl_id:
        return True
    ok = await exchange.cancel_order(symbol, sl_id)
    with state._lock:
        state.sl_order_id = None
    return ok


# ------------------------------------------------------------------ #
# TP1 partial exit helper
# ------------------------------------------------------------------ #

async def execute_tp1_partial(
    state: BotState,
    exchange: MexcExchange,
    db: AsyncSession,
    notifier: TelegramNotifier,
    config: Settings,
    tp1_fill_price: float,
):
    """
    Execute the 50% partial exit at TP1.
    - Guards against double-execution (sets half_exited before the async sell)
    - Cancels the resting full-size stop, sells half at market, moves SL to
      breakeven, then re-arms a resting stop on the remaining half
    - Records TP1 P&L to DB and updates state for second-half monitoring
    """
    with state._lock:
        # Re-entrancy guard: if a sell is already in flight or TP1 is already
        # done, do nothing. Set half_exited NOW (before the await) so a slow
        # or ambiguous fill cannot trigger a second partial sell next tick.
        if state.exit_in_progress or state.half_exited:
            return
        state.exit_in_progress = True
        symbol = state.current_symbol
        entry_price = state.entry_price
        qty_total = state.qty_total
        trade_id = state.open_trade_id
        dry_run = state.dry_run
        hard_sl = state.sl_price

    qty_tp1 = qty_total * 0.5
    tp1_order_id = ""
    actual_fill = tp1_fill_price

    try:
        if dry_run:
            order = paper_trader.simulate_market_sell(symbol, qty_tp1, tp1_fill_price)
            tp1_order_id = order["id"]
        else:
            # Free the asset reserved by the resting stop before selling.
            await _cancel_resting_stop(state, exchange)
            try:
                sell = await exchange.place_market_sell(symbol, qty_tp1)
                actual_fill = sell.get("average") or sell.get("price") or tp1_fill_price
                tp1_order_id = sell.get("id", "")
            except Exception as e:
                logger.error(f"TP1 sell error ({symbol}): {e}")
                await notifier.send_error(f"TP1 sell failed ({symbol}): {e} — re-arming full stop, will retry next tick.")
                # Re-arm full-size protection and abort this attempt.
                with state._lock:
                    state.exit_in_progress = False
                await _place_exchange_stop(state, exchange, db, notifier, config, symbol, qty_total, hard_sl, trade_id)
                return

        tp1_fee = qty_tp1 * actual_fill * config.taker_fee_rate
        tp1_pnl = (actual_fill - entry_price) * qty_tp1 - tp1_fee
        breakeven_sl = entry_price

        with state._lock:
            state.half_exited = True
            state.qty_remaining = qty_total * 0.5
            state.sl_price = breakeven_sl
            state.tp1_exit_price = actual_fill
            state.tp1_pnl_usdt = tp1_pnl
            state.tp1_order_id = tp1_order_id
            if state.atr_1h:
                state.trailing_sl = compute_atr_tsl(
                    state.peak_price or actual_fill,
                    state.trailing_sl or breakeven_sl,
                    state.atr_1h,
                    config.atr_1h_multiplier,
                )
            state.exit_in_progress = False

        if trade_id:
            await crud.update_trade(db, trade_id, {
                "half_exited": True,
                "tp1_exit_price": actual_fill,
                "tp1_exit_time": datetime.utcnow(),
                "tp1_pnl_usdt": tp1_pnl,
                "tp1_order_id": tp1_order_id,
                "breakeven_sl": breakeven_sl,
            })

        # Re-arm a resting stop on the remaining half, now at breakeven.
        await _place_exchange_stop(state, exchange, db, notifier, config, symbol, qty_tp1, breakeven_sl, trade_id)

        logger.info(f"[TP1] {symbol} 50%% exited @ {actual_fill:.4f} pnl={tp1_pnl:+.4f} USDT | SL → breakeven")
        await crud.save_log(db, "TP1", f"{symbol} TP1 partial @ {actual_fill:.4f} pnl={tp1_pnl:+.4f}", trade_id=trade_id)

        trade_dict = {"symbol": symbol, "entry_price": entry_price,
                      "tp2_price": state.tp2_price, "grade": state.grade}
        await notifier.send_tp1_partial(trade_dict, actual_fill, tp1_pnl, qty_tp1)
        await ws_manager.broadcast({"type": "tp1_hit", "data": {
            "symbol": symbol, "tp1_price": actual_fill, "tp1_pnl_usdt": tp1_pnl,
        }})
    finally:
        # Never leave the guard stuck on an unexpected error.
        with state._lock:
            state.exit_in_progress = False


# ------------------------------------------------------------------ #
# Full-close finalizer (shared by loop exit + stop-fill reconciliation)
# ------------------------------------------------------------------ #

async def _finalize_full_close(
    state: BotState,
    db: AsyncSession,
    notifier: TelegramNotifier,
    config: Settings,
    *,
    exit_price: float,
    exit_reason: str,
    exit_order_id: str,
    exit_fee: float,
    mode: str = "",
) -> float:
    """
    Record a completed full close to DB + in-memory state, update counters,
    send notifications. The actual sell (or stop fill) must already have happened.
    Returns total_pnl so the caller can update its daily_pnl accumulator.
    """
    with state._lock:
        active_sym = state.current_symbol
        entry_price = state.entry_price
        qty_remaining = state.qty_remaining
        trade_id = state.open_trade_id
        peak_price = state.peak_price
        trailing_sl = state.trailing_sl
        tp1_pnl = state.tp1_pnl_usdt or 0.0

    final_pnl = (exit_price - entry_price) * (qty_remaining or 0.0) - exit_fee
    final_pct = (exit_price - entry_price) / entry_price * 100 if entry_price else 0.0
    total_pnl = tp1_pnl + final_pnl
    total_pct = (total_pnl / config.trade_usdt * 100) if config.trade_usdt > 0 else final_pct

    closed_trade = await crud.update_trade(db, trade_id, {
        "exit_time": datetime.utcnow(),
        "exit_price": exit_price,
        "peak_price": peak_price,
        "trailing_sl_final": trailing_sl,
        "pnl_usdt": final_pnl,
        "pnl_pct": final_pct,
        "exit_reason": exit_reason,
        "status": "CLOSED",
        "exit_order_id": exit_order_id,
        "exit_fee": exit_fee,
        "total_pnl_usdt": total_pnl,
        "total_pnl_pct": total_pct,
        "sl_order_id": None,
    })

    win = total_pnl > 0
    with state._lock:
        state.trade_open = False
        state.current_symbol = None
        state.entry_price = None
        state.entry_time = None
        state.entry_order_id = None
        state.peak_price = None
        state.trailing_sl = None
        state.sl_price = None
        state.tp1_price = None
        state.tp2_price = None
        state.atr_1h = None
        state.rr_ratio = None
        state.grade = None
        state.qty_total = None
        state.qty_remaining = None
        state.half_exited = False
        state.tp1_exit_price = None
        state.tp1_pnl_usdt = None
        state.tp1_order_id = None
        state.sl_order_id = None
        state.exit_in_progress = False
        state.sell_retry_count = 0
        state.current_price = None
        state.unrealized_pnl_pct = None
        state.open_trade_id = None
        state.last_trade_time = time.time()
        state.session_trades += 1
        state.trades_today += 1
        if win:
            state.session_wins += 1
            state.wins_today += 1
        else:
            state.losses_today += 1
        state.session_pnl_usdt += total_pnl
        state.pnl_today_usdt += total_pnl

    logger.info(f"{mode}[CLOSE] {active_sym} total_pnl={total_pnl:+.4f} USDT ({total_pct:+.2f}%) reason={exit_reason}")
    await crud.save_log(db, "CLOSE", f"{mode}{active_sym} closed: {exit_reason} @ {exit_price:.4f} total_pnl={total_pnl:+.4f}", trade_id=trade_id)
    if closed_trade:
        await notifier.send_trade_closed(closed_trade.to_dict())
        await ws_manager.broadcast({"type": "trade_closed", "data": closed_trade.to_dict()})
    await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
    return total_pnl


# ------------------------------------------------------------------ #
# Main bot loop
# ------------------------------------------------------------------ #

async def bot_loop(
    state: BotState,
    exchange: MexcExchange,
    db: AsyncSession,
    notifier: TelegramNotifier,
    config: Settings,
):
    """Main loop. Runs until state.running = False."""

    logger.info("[STARTUP] Precision Swing Strategy — multi-timeframe confluence")
    logger.info(f"[STARTUP] Symbols: {config.symbols} | Scan: {config.scan_interval_seconds}s")
    logger.info(f"[STARTUP] Timeframes: {config.tf_weekly} / {config.tf_daily} / {config.tf_4h} / {config.tf_1h}")
    logger.info(f"[STARTUP] Min R:R: {config.min_rr_ratio} | ATR mult: {config.atr_1h_multiplier} | Max trades/day: {config.max_trades_per_day}")
    logger.info(f"[STARTUP] Trade size: ${config.trade_usdt} | TP1 at 50%% | TP2 at 5:1 R | Max hold: {config.max_hold_hours}h")

    await notifier.send_bot_started(config)
    await recover_open_trade(state, db, notifier)

    # Fetch min order amounts per symbol
    min_amounts: dict[str, float] = {}
    for sym in config.symbols:
        if exchange.exchange.apiKey:
            min_amounts[sym] = await exchange.get_min_order_amount(sym)
        else:
            min_amounts[sym] = 0.0

    # Starting balance
    try:
        if not state.dry_run:
            bal = await exchange.get_balance()
            starting_balance = bal["USDT"]["free"]
            with state._lock:
                state.usdt_balance = starting_balance
        else:
            starting_balance = paper_trader.starting_balance
            with state._lock:
                state.usdt_balance = paper_trader.balance
    except Exception as e:
        logger.error(f"[STARTUP] Balance fetch failed: {e}. Defaulting to $10 for session.")
        starting_balance = 10.0
        with state._lock:
            state.usdt_balance = starting_balance

    if not state.dry_run and starting_balance < config.trade_usdt * 1.1:
        await notifier.send_error(
            f"Balance too low: ${starting_balance:.2f} (need ${config.trade_usdt * 1.1:.2f})"
        )

    daily_pnl = 0.0
    last_scan_time = 0.0   # track when we last did a full 4-TF scan

    while state.running:
        try:
            with state._lock:
                trade_open = state.trade_open
                dry_run = state.dry_run
                daily_halted = state.daily_halted
                trade_opened_today = state.trade_opened_today

            # -------------------------------------------------------- #
            # NO OPEN TRADE — scan for entry (every SCAN_INTERVAL s)
            # -------------------------------------------------------- #
            if not trade_open:
                now = time.time()
                time_since_scan = now - last_scan_time

                # Daily cap: only 1 trade per day
                if trade_opened_today or daily_halted:
                    reason = "daily trade taken" if trade_opened_today else "daily halt"
                    if time_since_scan >= SCAN_INTERVAL:
                        logger.info(f"Skipping entry scan — {reason}")
                        # Still update scanner display even when blocked
                        await scan_all_symbols(exchange, state, config)
                        last_scan_time = now
                    await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # Balance guard
                if not dry_run:
                    with state._lock:
                        bal = state.usdt_balance
                    if bal < config.trade_usdt * 1.1:
                        logger.warning(f"Insufficient balance (${bal:.2f}) — skipping entry")
                        await asyncio.sleep(MONITOR_INTERVAL)
                        continue

                # Daily drawdown guard
                if not dry_run and check_daily_drawdown(daily_pnl, starting_balance, config.max_daily_drawdown_pct):
                    msg = f"Daily drawdown limit hit ({daily_pnl:.4f} USDT). Halting."
                    logger.warning(msg)
                    await notifier.send_error(msg)
                    with state._lock:
                        state.daily_halted = True
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # Only run full 4-TF scan every SCAN_INTERVAL seconds
                if time_since_scan < SCAN_INTERVAL:
                    await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                last_scan_time = now
                best_sym, best_sig = await scan_all_symbols(exchange, state, config)
                await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})

                if best_sym is None:
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # --- Place entry order ---
                vals = best_sig.get("values", {})
                entry_price_est = vals.get("entry_price") or 0
                sl_price = best_sig.get("sl_price")
                tp1_price = best_sig.get("tp1_price")
                tp2_price = best_sig.get("tp2_price")
                atr_1h = best_sig.get("atr_1h")
                rr_ratio = best_sig.get("rr_ratio", 0.0)
                grade = best_sig.get("grade", "B")

                # Fetch live ask price
                try:
                    ticker = await exchange.fetch_ticker(best_sym)
                except Exception as e:
                    logger.error(f"Ticker error ({best_sym}): {e}")
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                ask_price = ticker.get("ask") or ticker.get("last")
                if not ask_price:
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # SAFETY: hard cap at $1.00
                trade_size = min(config.trade_usdt, 1.0)
                min_amt = min_amounts.get(best_sym, 0.0)
                qty = calculate_position_qty(trade_size, ask_price, min_amt, config.taker_fee_rate)
                if qty <= 0:
                    logger.warning(f"Qty too small for {best_sym} @ {ask_price}")
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # Place order
                filled_price = None
                order_id = ""

                if dry_run:
                    try:
                        order = paper_trader.simulate_limit_buy(best_sym, qty, ask_price)
                        order_id = order["id"]
                        filled_price = ask_price
                        logger.info(f"[PAPER] Buy {qty:.6f} {best_sym} @ {ask_price:.4f}")
                    except ValueError as e:
                        logger.warning(f"[PAPER] Cannot open trade: {e}")
                        await asyncio.sleep(MONITOR_INTERVAL)
                        continue
                else:
                    try:
                        order = await exchange.place_limit_buy(best_sym, qty, ask_price)
                        order_id = order["id"]
                        await crud.save_log(db, "ORDER", f"Limit buy placed: {order}")
                        filled_price = await exchange.check_order_filled(
                            best_sym, order_id,
                            timeout=config.entry_order_timeout_seconds,
                        )
                    except Exception as e:
                        logger.error(f"Order error ({best_sym}): {e}")
                        await notifier.send_error(f"Order failed ({best_sym}): {e}")
                        await asyncio.sleep(MONITOR_INTERVAL)
                        continue

                if filled_price is None:
                    logger.warning(f"Order not filled for {best_sym}")
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # Post-fill R:R guard — the real fill may differ from the planned
                # entry (slippage on the marketable limit). Re-check R:R against the
                # ACTUAL fill; if it no longer clears the minimum, flatten immediately
                # and do NOT persist the trade.
                abort, actual_rr = should_abort_after_fill(
                    filled_price, sl_price, tp1_price, config.min_rr_ratio
                )
                if abort:
                    logger.warning(
                        f"[ABORT] {best_sym} R:R degraded after fill — planned "
                        f"{rr_ratio:.2f} vs actual {actual_rr:.2f} (min {config.min_rr_ratio}). "
                        f"Exiting position immediately."
                    )
                    try:
                        if dry_run:
                            paper_trader.simulate_market_sell(best_sym, qty, filled_price)
                            # paper buy only deducted the entry fee (no principal moved),
                            # so account just the exit fee here to avoid inflating balance.
                            paper_trader.balance -= qty * filled_price * config.taker_fee_rate
                            with state._lock:
                                state.usdt_balance = paper_trader.balance
                        else:
                            await exchange.place_market_sell(best_sym, qty)
                    except Exception as e:
                        logger.error(f"[ABORT] Failed to flatten {best_sym} after R:R abort: {e}")
                        await notifier.send_error(
                            f"⚠ Post-fill R:R abort SELL FAILED for {best_sym}: {e}. "
                            f"You may be holding an unintended position — check the exchange."
                        )
                    await crud.save_log(
                        db, "ORDER",
                        f"{best_sym} entry aborted post-fill: R:R {actual_rr:.2f} < {config.min_rr_ratio} (planned {rr_ratio:.2f})",
                    )
                    await notifier.send_error(
                        f"{best_sym} entry aborted: post-fill R:R {actual_rr:.2f} below "
                        f"minimum {config.min_rr_ratio} (planned {rr_ratio:.2f}). Position flattened."
                    )
                    await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # Initial ATR-based TSL: peak = filled_price initially
                initial_tsl = sl_price  # start at hard SL; ATR will push it up as price rises
                if atr_1h:
                    initial_tsl = max(
                        compute_atr_tsl(filled_price, sl_price or 0, atr_1h, config.atr_1h_multiplier),
                        sl_price or 0,
                    )

                now_ts = time.time()
                trade_record = await crud.create_trade(db, {
                    "symbol": best_sym,
                    "entry_time": datetime.utcnow(),
                    "entry_price": filled_price,
                    "qty": qty,
                    "trade_usdt": trade_size,
                    "take_profit_price": tp1_price,
                    "tp2_price": tp2_price,
                    "hard_sl_price": sl_price,
                    "trail_pct": None,
                    "status": "OPEN",
                    "entry_order_id": order_id,
                    "entry_fee": 0.0,
                    "tsl_update_count": 0,
                    "is_backtest": False,
                    # Swing snapshot
                    "rr_ratio": rr_ratio,
                    "grade": grade,
                    "entry_divergence_strength": vals.get("divergence_strength"),
                    "entry_nearest_fib": vals.get("fib_zone") or vals.get("nearest_fib"),
                    "entry_1h_atr": atr_1h,
                })

                if dry_run:
                    paper_trader.open_trade(
                        symbol=best_sym, qty=qty, entry_price=filled_price,
                        trade_usdt=trade_size,
                        take_profit_price=tp1_price,
                        hard_sl_price=sl_price,
                        trail_pct=0.0,
                        trailing_sl=initial_tsl,
                    )

                with state._lock:
                    state.trade_open = True
                    state.trade_opened_today = True
                    state.current_symbol = best_sym
                    state.entry_price = filled_price
                    state.entry_time = now_ts
                    state.entry_order_id = order_id
                    state.peak_price = filled_price
                    state.trailing_sl = initial_tsl
                    state.sl_price = sl_price
                    state.tp1_price = tp1_price
                    state.tp2_price = tp2_price
                    state.atr_1h = atr_1h
                    state.rr_ratio = rr_ratio
                    state.grade = grade
                    state.qty_total = qty
                    state.qty_remaining = qty
                    state.half_exited = False
                    state.tp1_exit_price = None
                    state.tp1_pnl_usdt = None
                    state.last_trade_time = now_ts
                    state.open_trade_id = trade_record.id

                logger.info(
                    f"[OPEN] {best_sym} grade={grade} entry={filled_price:.4f} "
                    f"SL={sl_price:.4f} TP1={tp1_price:.4f} TP2={tp2_price:.4f} R:R={rr_ratio:.1f}"
                )
                await crud.save_log(db, "OPEN", f"{best_sym} opened @ {filled_price:.4f} grade={grade} R:R={rr_ratio:.1f}", trade_id=trade_record.id)
                await notifier.send_trade_opened(trade_record.to_dict(), vals)
                await ws_manager.broadcast({"type": "trade_opened", "data": trade_record.to_dict()})
                await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})

                # Catastrophe floor: rest a stop-loss on the exchange for the full
                # position at the hard SL. Protects the trade even if this process
                # stops, sleeps, or crashes. (best-effort; in-process stop still runs)
                await _place_exchange_stop(
                    state, exchange, db, notifier, config,
                    best_sym, qty, sl_price, trade_record.id,
                )

            # -------------------------------------------------------- #
            # TRADE OPEN — monitor exit conditions (every 15 s)
            # -------------------------------------------------------- #
            else:
                with state._lock:
                    active_sym = state.current_symbol
                    entry_price = state.entry_price
                    entry_time = state.entry_time
                    peak_price = state.peak_price
                    trailing_sl = state.trailing_sl
                    sl_price = state.sl_price
                    tp1_price = state.tp1_price
                    tp2_price = state.tp2_price
                    atr_1h = state.atr_1h
                    half_exited = state.half_exited
                    qty_remaining = state.qty_remaining
                    trade_id = state.open_trade_id
                    sl_order_id = state.sl_order_id

                # -------------------------------------------------- #
                # Reconcile: did the resting exchange stop fill while
                # we weren't actively selling (e.g. bot was down, or a
                # gap blew through it)? If so, the exchange already
                # closed the position — record it and move on.
                # -------------------------------------------------- #
                if not dry_run and sl_order_id:
                    o = await exchange.get_order_status(active_sym, sl_order_id)
                    if o:
                        filled = o.get("filled") or 0
                        amount = o.get("amount") or 0
                        if o.get("status") == "closed" or (amount and filled >= amount):
                            stop_fill = o.get("average") or o.get("price") or trailing_sl or sl_price
                            stop_fee = (filled or qty_remaining or 0.0) * stop_fill * config.taker_fee_rate
                            reason = "BREAKEVEN_SL" if half_exited else "HARD_SL"
                            with state._lock:
                                state.sl_order_id = None
                            logger.warning(f"[RECONCILE] Exchange stop filled for {active_sym} @ {stop_fill:.4f} — closing out")
                            await notifier.send_error(f"Exchange stop-loss filled for {active_sym} @ {stop_fill:.4f} ({reason}).")
                            total = await _finalize_full_close(
                                state, db, notifier, config,
                                exit_price=float(stop_fill), exit_reason=reason,
                                exit_order_id=o.get("id", ""), exit_fee=stop_fee,
                            )
                            daily_pnl += total
                            await asyncio.sleep(MONITOR_INTERVAL)
                            continue

                # Fetch current price
                try:
                    ticker = await exchange.fetch_ticker(active_sym)
                    current_price = ticker.get("last") or ticker.get("bid")
                except Exception as e:
                    logger.error(f"Ticker error ({active_sym}): {e}")
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                if not current_price:
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                unrealized_pct = (current_price - entry_price) / entry_price * 100
                with state._lock:
                    state.current_price = current_price
                    state.unrealized_pnl_pct = unrealized_pct

                # Update peak + ATR-based TSL (only moves up)
                if current_price > peak_price:
                    new_peak = current_price
                    old_tsl = trailing_sl
                    new_tsl = compute_atr_tsl(
                        new_peak,
                        trailing_sl,
                        atr_1h or (entry_price * 0.01),   # fallback: 1% of price if ATR missing
                        config.atr_1h_multiplier,
                    )
                    with state._lock:
                        state.peak_price = new_peak
                        state.trailing_sl = new_tsl
                    peak_price = new_peak
                    trailing_sl = new_tsl

                    if abs((new_tsl - old_tsl) / max(old_tsl, 1e-9)) > 0.001:
                        trade_dict = {
                            "symbol": active_sym,
                            "entry_price": entry_price,
                            "peak_price": new_peak,
                        }
                        await notifier.send_tsl_updated(trade_dict, old_tsl, new_tsl)
                        if trade_id:
                            existing = await crud.get_trade(db, trade_id)
                            if existing:
                                await crud.update_trade(db, trade_id, {
                                    "tsl_update_count": existing.tsl_update_count + 1,
                                    "peak_price": new_peak,
                                })
                        await ws_manager.broadcast({"type": "tsl_updated", "data": {
                            "old_tsl": old_tsl, "new_tsl": new_tsl, "peak": new_peak,
                        }})
                        logger.info(f"[TSL] {active_sym}: {old_tsl:.4f} → {new_tsl:.4f}")
                        await crud.save_log(db, "TSL", f"TSL: {old_tsl:.4f} → {new_tsl:.4f}", trade_id=trade_id)

                # Check exit
                exit_reason = check_exit(
                    current_price=current_price,
                    sl_price=sl_price,
                    trailing_sl=trailing_sl,
                    tp1_price=tp1_price,
                    tp2_price=tp2_price,
                    half_exited=half_exited,
                    entry_time=entry_time,
                    max_hold_hours=config.max_hold_hours,
                )

                await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
                await ws_manager.broadcast({"type": "price_update", "data": {
                    "symbol": active_sym,
                    "price": current_price,
                    "timestamp": datetime.utcnow().isoformat(),
                }})

                # TP1 partial exit (not a full close)
                if exit_reason == "TP1_PARTIAL":
                    await execute_tp1_partial(
                        state, exchange, db, notifier, config,
                        tp1_fill_price=current_price,
                    )
                    await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue

                # Full exit
                if exit_reason and exit_reason != "TP1_PARTIAL":
                    mode = "[PAPER] " if dry_run else ""
                    logger.info(f"{mode}[CLOSE] {active_sym} {exit_reason} @ {current_price:.4f}")

                    exit_price = current_price
                    exit_order_id = ""

                    if dry_run:
                        order = paper_trader.simulate_market_sell(active_sym, qty_remaining, current_price)
                        exit_order_id = order["id"]
                        exit_fee = qty_remaining * exit_price * config.taker_fee_rate
                        open_pt = next((t for t in paper_trader.trades if t.exit_price is None), None)
                        if open_pt:
                            paper_trader.close_trade(open_pt, exit_price, exit_reason)
                        with state._lock:
                            state.usdt_balance = paper_trader.balance
                    else:
                        with state._lock:
                            state.exit_in_progress = True
                        # Free the asset reserved by the resting stop before selling.
                        await _cancel_resting_stop(state, exchange)
                        try:
                            sell_order = await exchange.place_market_sell(active_sym, qty_remaining)
                            exit_price = sell_order.get("average") or sell_order.get("price") or current_price
                            exit_order_id = sell_order.get("id", "")
                            exit_fee = qty_remaining * exit_price * config.taker_fee_rate
                            with state._lock:
                                state.sell_retry_count = 0
                            await crud.save_log(db, "ORDER", f"Market sell: {sell_order}", trade_id=trade_id)
                        except Exception as e:
                            # The position is still open and still owned. Re-arm a
                            # protective stop (we just cancelled it), escalate after
                            # repeated failures, and retry on the next tick — never
                            # abandon the position or strand it as silently OPEN.
                            with state._lock:
                                state.sell_retry_count += 1
                                retries = state.sell_retry_count
                                state.exit_in_progress = False
                            logger.error(f"Sell error ({active_sym}) attempt {retries}: {e}")
                            await _place_exchange_stop(
                                state, exchange, db, notifier, config,
                                active_sym, qty_remaining, trailing_sl or sl_price, trade_id,
                            )
                            if retries == config.max_sell_retries:
                                await notifier.send_error(
                                    f"🚨 CRITICAL: market sell for {active_sym} has failed {retries}× "
                                    f"({exit_reason}). Position still open; exchange stop-loss re-armed. "
                                    f"Check the exchange manually. Will keep retrying."
                                )
                            else:
                                await notifier.send_error(f"Sell failed ({active_sym}) [{retries}]: {e} — retrying next tick.")
                            await asyncio.sleep(MONITOR_INTERVAL)
                            continue

                    # Single source of truth for close bookkeeping (paper + live).
                    # _finalize_full_close performs no exchange calls — the sell
                    # (or paper sell) above already happened.
                    total_pnl = await _finalize_full_close(
                        state, db, notifier, config,
                        exit_price=exit_price, exit_reason=exit_reason,
                        exit_order_id=exit_order_id, exit_fee=exit_fee, mode=mode,
                    )

                    if not dry_run:
                        daily_pnl += total_pnl
                        try:
                            bal = await exchange.get_balance()
                            with state._lock:
                                state.usdt_balance = bal["USDT"]["free"]
                        except Exception:
                            pass

        except Exception as e:
            logger.exception(f"Bot loop error: {e}")
            await notifier.send_error(str(e))
            await asyncio.sleep(10)
            continue

        await asyncio.sleep(MONITOR_INTERVAL)

    logger.info("Bot loop exited")
    await notifier.send_bot_stopped("Manual stop")
