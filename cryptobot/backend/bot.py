import asyncio
import logging
import math
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
from backend.risk import calculate_position_qty, check_rate_limits, check_daily_drawdown
from backend.strategy import compute_indicators, check_entry_signal, compute_tsl, check_exit

logger = logging.getLogger(__name__)

POLL_INTERVAL = 5  # seconds


async def bot_loop(
    state: BotState,
    exchange: MexcExchange,
    db: AsyncSession,
    notifier: TelegramNotifier,
    config: Settings,
):
    """
    Main bot loop. Runs until state.running = False.
    Safety rules are hardcoded and cannot be bypassed.
    """
    logger.info("Bot loop started")
    await notifier.send_bot_started()

    # Safety check: validate min order size on startup
    min_amount = await exchange.get_min_order_amount(config.symbol)
    test_qty = calculate_position_qty(min(config.trade_usdt, 1.0), 50000.0, min_amount)
    if test_qty < min_amount and min_amount > 0:
        msg = f"Trade qty {test_qty} below exchange minimum {min_amount} for {config.symbol}"
        logger.error(msg)
        await notifier.send_error(msg)

    # Session starting balance for drawdown checks
    try:
        balance_info = await exchange.get_balance()
        starting_balance = balance_info["USDT"]["free"]
    except Exception:
        starting_balance = 10.0

    daily_pnl = 0.0

    while state.running:
        try:
            with state._lock:
                trade_open = state.trade_open
                dry_run = state.dry_run

            if not trade_open:
                # --- Check rate limits and daily drawdown ---
                with state._lock:
                    allowed, reason = check_rate_limits(
                        state.trades_this_hour,
                        config.max_trades_per_hour,
                        state.last_trade_time,
                        config.cooldown_seconds,
                    )

                if not allowed:
                    logger.info(f"Rate limit: {reason}")
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                if check_daily_drawdown(daily_pnl, starting_balance, config.max_daily_drawdown_pct):
                    msg = f"Daily drawdown limit hit ({daily_pnl:.4f} USDT). Stopping for the day."
                    logger.warning(msg)
                    await notifier.send_error(msg)
                    with state._lock:
                        state.running = False
                    break

                # --- Fetch candles and compute indicators ---
                try:
                    df = await exchange.fetch_ohlcv(config.symbol, config.timeframe, limit=100)
                except Exception as e:
                    logger.error(f"OHLCV fetch error: {e}")
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                df = compute_indicators(df)
                signal_data = check_entry_signal(df)

                last = df.iloc[-2] if len(df) >= 2 else df.iloc[-1]
                with state._lock:
                    state.last_ema50 = float(last["ema50"]) if not pd.isna(last["ema50"]) else None
                    state.last_rsi = float(last["rsi14"]) if not pd.isna(last["rsi14"]) else None
                    state.last_bb_low = float(last["bb_low"]) if not pd.isna(last["bb_low"]) else None
                    state.last_bb_high = float(last["bb_high"]) if not pd.isna(last["bb_high"]) else None
                    state.last_volume_ratio = float(last["vol_ratio"]) if not pd.isna(last["vol_ratio"]) else None

                await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})

                if not signal_data["signal"]:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                logger.info(f"[SIGNAL] Entry signal! {signal_data['reasons']} | Values: {signal_data['values']}")
                await crud.save_log(db, "SIGNAL", f"Entry signal detected: {signal_data['reasons']}")

                # --- Calculate qty and place order ---
                try:
                    ticker = await exchange.fetch_ticker(config.symbol)
                except Exception as e:
                    logger.error(f"Ticker fetch error: {e}")
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                ask_price = ticker.get("ask") or ticker.get("last")
                if not ask_price:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                # SAFETY: never exceed $1 per trade
                trade_size = min(config.trade_usdt, 1.0)
                qty = calculate_position_qty(trade_size, ask_price, min_amount)
                if qty <= 0:
                    logger.warning(f"Calculated qty={qty} too small, skipping")
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                logger.info(f"[OPEN] Placing limit buy: qty={qty} @ {ask_price}")
                filled_price = None

                if not dry_run:
                    try:
                        order = await exchange.place_limit_buy(config.symbol, qty, ask_price)
                        order_id = order["id"]
                        await crud.save_log(db, "ORDER", f"Limit buy placed: {order}")
                        filled_price = await exchange.check_order_filled(config.symbol, order_id)
                    except Exception as e:
                        logger.error(f"Order placement error: {e}")
                        await notifier.send_error(f"Order placement failed: {e}")
                        await asyncio.sleep(POLL_INTERVAL)
                        continue
                else:
                    order_id = f"DRYRUN-{int(time.time())}"
                    filled_price = ask_price
                    logger.info(f"[DRY RUN] Simulated fill at {filled_price}")

                if filled_price is None:
                    logger.warning("Order not filled in time, skipping")
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                # --- Open trade ---
                tp_price = filled_price * (1 + config.take_profit_pct)
                hard_sl = filled_price * (1 - config.hard_sl_pct)
                tsl = compute_tsl(filled_price, config.trail_pct)
                now = time.time()

                trade_record = await crud.create_trade(db, {
                    "symbol": config.symbol,
                    "entry_time": datetime.utcnow(),
                    "entry_price": filled_price,
                    "qty": qty,
                    "trade_usdt": trade_size,
                    "take_profit_price": tp_price,
                    "hard_sl_price": hard_sl,
                    "trail_pct": config.trail_pct,
                    "status": "OPEN",
                    "entry_order_id": order_id,
                    "entry_fee": trade_size * 0.001,
                    "tsl_update_count": 0,
                    "is_backtest": False,
                })

                with state._lock:
                    state.trade_open = True
                    state.entry_price = filled_price
                    state.entry_time = now
                    state.entry_order_id = order_id
                    state.peak_price = filled_price
                    state.trailing_sl = tsl
                    state.take_profit_price = tp_price
                    state.hard_sl_price = hard_sl
                    state.trade_qty = qty
                    state.trades_this_hour.append(now)
                    state.last_trade_time = now
                    state.open_trade_id = trade_record.id

                logger.info(f"[OPEN] Trade opened: entry={filled_price} TP={tp_price:.2f} SL={hard_sl:.2f} TSL={tsl:.2f}")
                await crud.save_log(db, "OPEN", f"Trade opened: entry={filled_price:.2f}, qty={qty}", trade_id=trade_record.id)
                await notifier.send_trade_opened(trade_record.to_dict())
                await ws_manager.broadcast({"type": "trade_opened", "data": trade_record.to_dict()})

            else:
                # --- Trade is open — monitor for exit ---
                with state._lock:
                    entry_price = state.entry_price
                    entry_time = state.entry_time
                    peak_price = state.peak_price
                    trailing_sl = state.trailing_sl
                    trade_qty = state.trade_qty
                    trade_id = state.open_trade_id
                    dry_run = state.dry_run

                try:
                    ticker = await exchange.fetch_ticker(config.symbol)
                    current_price = ticker.get("last") or ticker.get("bid")
                except Exception as e:
                    logger.error(f"Ticker fetch error during trade: {e}")
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                if not current_price:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue

                unrealized_pnl_pct = (current_price - entry_price) / entry_price * 100
                with state._lock:
                    state.current_price = current_price
                    state.unrealized_pnl_pct = unrealized_pnl_pct

                # Update TSL if new high
                old_tsl = trailing_sl
                if current_price > peak_price:
                    new_peak = current_price
                    new_tsl = compute_tsl(new_peak, config.trail_pct)
                    with state._lock:
                        state.peak_price = new_peak
                        state.trailing_sl = new_tsl
                    peak_price = new_peak
                    trailing_sl = new_tsl

                    # Broadcast TSL update if it moved > 0.1%
                    tsl_move_pct = abs((new_tsl - old_tsl) / old_tsl) if old_tsl else 0
                    if tsl_move_pct > 0.001:
                        trade_dict = {
                            "symbol": config.symbol,
                            "entry_price": entry_price,
                            "peak_price": new_peak,
                            "trail_pct": config.trail_pct,
                        }
                        await notifier.send_tsl_updated(trade_dict, old_tsl, new_tsl)
                        if trade_id:
                            existing = await crud.get_trade(db, trade_id)
                            if existing:
                                await crud.update_trade(db, trade_id, {"tsl_update_count": existing.tsl_update_count + 1, "peak_price": new_peak})
                        await ws_manager.broadcast({"type": "tsl_updated", "data": {"old_tsl": old_tsl, "new_tsl": new_tsl, "peak": new_peak}})
                        logger.info(f"[TSL] Updated: {old_tsl:.2f} → {new_tsl:.2f} (peak={new_peak:.2f})")
                        await crud.save_log(db, "TSL", f"TSL updated: {old_tsl:.2f} → {new_tsl:.2f}", trade_id=trade_id)

                # Check exit conditions
                exit_reason = check_exit(
                    current_price=current_price,
                    entry_price=entry_price,
                    peak_price=peak_price,
                    trailing_sl=trailing_sl,
                    take_profit_pct=config.take_profit_pct,
                    hard_sl_pct=config.hard_sl_pct,
                    entry_time=entry_time,
                    max_hold_minutes=config.max_hold_minutes,
                )

                await ws_manager.broadcast({"type": "bot_state", "data": state.to_dict()})
                await ws_manager.broadcast({"type": "price_update", "data": {"price": current_price, "timestamp": datetime.utcnow().isoformat()}})

                if exit_reason:
                    logger.info(f"[CLOSE] Exit triggered: {exit_reason} @ {current_price}")

                    exit_price = current_price
                    if not dry_run:
                        try:
                            sell_order = await exchange.place_market_sell(config.symbol, trade_qty)
                            exit_price = sell_order.get("average") or sell_order.get("price") or current_price
                            exit_order_id = sell_order.get("id", "")
                            exit_fee = (trade_qty * exit_price) * 0.001
                            await crud.save_log(db, "ORDER", f"Market sell placed: {sell_order}", trade_id=trade_id)
                        except Exception as e:
                            logger.error(f"Sell order error: {e}")
                            await notifier.send_error(f"Sell order failed: {e}")
                            await asyncio.sleep(POLL_INTERVAL)
                            continue
                    else:
                        exit_order_id = f"DRYRUN-EXIT-{int(time.time())}"
                        exit_fee = (trade_qty * exit_price) * 0.001
                        logger.info(f"[DRY RUN] Simulated sell at {exit_price}")

                    pnl_usdt = (exit_price - entry_price) * trade_qty - exit_fee
                    pnl_pct = (exit_price - entry_price) / entry_price * 100

                    now_dt = datetime.utcnow()
                    update_data = {
                        "exit_time": now_dt,
                        "exit_price": exit_price,
                        "peak_price": peak_price,
                        "trailing_sl_final": trailing_sl,
                        "pnl_usdt": pnl_usdt,
                        "pnl_pct": pnl_pct,
                        "exit_reason": exit_reason,
                        "status": "CLOSED",
                        "exit_order_id": exit_order_id,
                        "exit_fee": exit_fee,
                    }
                    closed_trade = await crud.update_trade(db, trade_id, update_data)

                    daily_pnl += pnl_usdt
                    with state._lock:
                        state.trade_open = False
                        state.entry_price = None
                        state.entry_time = None
                        state.entry_order_id = None
                        state.peak_price = None
                        state.trailing_sl = None
                        state.take_profit_price = None
                        state.hard_sl_price = None
                        state.trade_qty = None
                        state.current_price = None
                        state.unrealized_pnl_pct = None
                        state.open_trade_id = None
                        state.last_trade_time = time.time()
                        state.session_trades += 1
                        if pnl_usdt > 0:
                            state.session_wins += 1
                        state.session_pnl_usdt += pnl_usdt

                    logger.info(f"[CLOSE] Trade closed: exit={exit_price:.2f} PnL={pnl_usdt:+.4f} USDT ({pnl_pct:+.2f}%) reason={exit_reason}")
                    await crud.save_log(db, "CLOSE", f"Trade closed: {exit_reason} exit={exit_price:.2f} pnl={pnl_usdt:+.4f}", trade_id=trade_id)

                    if closed_trade:
                        await notifier.send_trade_closed(closed_trade.to_dict())
                        await ws_manager.broadcast({"type": "trade_closed", "data": closed_trade.to_dict()})

        except Exception as e:
            logger.exception(f"Bot loop error: {e}")
            await notifier.send_error(str(e))
            await asyncio.sleep(10)
            continue

        await asyncio.sleep(POLL_INTERVAL)

    logger.info("Bot loop exited")
    await notifier.send_bot_stopped("Manual stop or drawdown limit")
