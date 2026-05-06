"""
Swing backtesting engine.

Approach:
  - Fetch 1H data as the simulation base timeframe.
  - Resample in-process to 4H, 1D, 1W using pandas.
  - Walk forward through 1H candles, checking all conditions at each bar.
  - Split exit: 50% at TP1, remainder with ATR TSL until TP2 / TIMEOUT.

Signal check is performed once per 4H bar (every 4 1H candles) to match
the live bot's 15-minute scan interval on the entry timeframe.
"""

import asyncio
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from backend.exchange import MexcExchange
from backend.core.config import Settings
from backend.strategy import (
    check_entry_signal,
    select_best_signal,
    compute_atr_tsl,
    check_exit,
)

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ #
# Result dataclass
# ------------------------------------------------------------------ #

@dataclass
class BacktestResult:
    symbol: str
    timeframe: str
    start_date: str
    end_date: str
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_pnl_pct: float
    total_pnl_usdt: float
    total_fees_usdt: float
    avg_win_pct: float
    avg_loss_pct: float
    max_drawdown_pct: float
    profit_factor: float
    sharpe_ratio: float
    avg_hold_minutes: float
    # Swing-specific stats
    tp1_hit_count: int = 0
    tp2_hit_count: int = 0
    avg_rr_achieved: float = 0.0
    grade_breakdown: dict = field(default_factory=dict)
    exit_reason_breakdown: dict = field(default_factory=dict)
    trades: list = field(default_factory=list)
    equity_curve: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "win_rate": self.win_rate,
            "total_pnl_pct": self.total_pnl_pct,
            "total_pnl_usdt": self.total_pnl_usdt,
            "total_fees_usdt": self.total_fees_usdt,
            "avg_win_pct": self.avg_win_pct,
            "avg_loss_pct": self.avg_loss_pct,
            "max_drawdown_pct": self.max_drawdown_pct,
            "profit_factor": self.profit_factor,
            "sharpe_ratio": self.sharpe_ratio,
            "avg_hold_minutes": self.avg_hold_minutes,
            "tp1_hit_count": self.tp1_hit_count,
            "tp2_hit_count": self.tp2_hit_count,
            "avg_rr_achieved": self.avg_rr_achieved,
            "grade_breakdown": self.grade_breakdown,
            "exit_reason_breakdown": self.exit_reason_breakdown,
            "trades": self.trades,
            "equity_curve": self.equity_curve,
        }


# ------------------------------------------------------------------ #
# OHLCV fetching
# ------------------------------------------------------------------ #

async def _fetch_all_1h(
    exchange: MexcExchange,
    symbol: str,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Fetch all 1H candles in the date range, paginating as needed."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt   = datetime.strptime(end_date,   "%Y-%m-%d").replace(tzinfo=timezone.utc)
    since_ms = int(start_dt.timestamp() * 1000)
    end_ms   = int(end_dt.timestamp() * 1000)

    all_dfs = []
    while since_ms < end_ms:
        try:
            df = await exchange.fetch_ohlcv_range(symbol, "1h", since_ms=since_ms, limit=1000)
        except Exception as e:
            logger.error(f"Backtest OHLCV error: {e}")
            break
        if df.empty:
            break
        all_dfs.append(df)
        last_ms = int(df["ts"].iloc[-1].timestamp() * 1000)
        if last_ms <= since_ms:
            break
        since_ms = last_ms + 1
        await asyncio.sleep(0.3)

    if not all_dfs:
        return pd.DataFrame()

    full = pd.concat(all_dfs, ignore_index=True)
    full = full.drop_duplicates(subset=["ts"]).sort_values("ts").reset_index(drop=True)
    full = full[full["ts"] <= pd.Timestamp(end_dt)]
    return full


def _resample_ohlcv(h1_df: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Resample 1H OHLCV to a coarser timeframe using pandas."""
    df = h1_df.set_index("ts")
    resampled = df.resample(rule).agg({
        "open":   "first",
        "high":   "max",
        "low":    "min",
        "close":  "last",
        "volume": "sum",
    }).dropna().reset_index()
    resampled = resampled.rename(columns={"ts": "ts"})
    return resampled


# ------------------------------------------------------------------ #
# Main backtest function
# ------------------------------------------------------------------ #

async def run_backtest(
    exchange: MexcExchange,
    symbol: str,
    timeframe: str,      # ignored — swing always uses 1H as base
    start_date: str,
    end_date: str,
    config: Settings,
) -> BacktestResult:
    logger.info(f"Swing backtest: {symbol} {start_date} → {end_date}")

    # Need extra historical data before start_date for indicator warm-up
    # Fetch 1H data; resample to daily/weekly inside
    # We need at least 220 daily candles → ~220 trading days ≈ 11 months of extra lookback
    import datetime as dt_mod
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    fetch_from = (start_dt - dt_mod.timedelta(days=365)).strftime("%Y-%m-%d")

    h1_df = await _fetch_all_1h(exchange, symbol, fetch_from, end_date)

    _empty = BacktestResult(
        symbol=symbol, timeframe="1h", start_date=start_date, end_date=end_date,
        total_trades=0, winning_trades=0, losing_trades=0, win_rate=0.0,
        total_pnl_pct=0.0, total_pnl_usdt=0.0, total_fees_usdt=0.0,
        avg_win_pct=0.0, avg_loss_pct=0.0, max_drawdown_pct=0.0,
        profit_factor=0.0, sharpe_ratio=0.0, avg_hold_minutes=0.0,
    )

    if h1_df.empty or len(h1_df) < 500:
        return _empty

    # Resample to multi-timeframe
    h4_df    = _resample_ohlcv(h1_df, "4h")
    daily_df = _resample_ohlcv(h1_df, "1D")
    weekly_df = _resample_ohlcv(h1_df, "1W")

    # Find start index in h1_df corresponding to start_date
    start_ts = pd.Timestamp(datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc))
    start_idx = h1_df[h1_df["ts"] >= start_ts].index[0] if not h1_df[h1_df["ts"] >= start_ts].empty else 0
    # Clamp to ensure we have enough warm-up bars
    start_idx = max(start_idx, 220 * 24)  # 220 days × 24 h

    trades = []
    equity = 0.0
    total_fees = 0.0
    equity_curve = []
    trade_pnls = []
    grade_breakdown: dict = {}
    exit_reason_breakdown: dict = {}
    tp1_hit_count = 0
    tp2_hit_count = 0
    rr_achieved_list = []

    i = start_idx
    trade_in_progress = False
    one_trade_per_day_date = None  # date of last trade entry

    while i < len(h1_df) - 1:
        h1_ts = h1_df.iloc[i]["ts"]

        # -------------------------------------------------------- #
        # No trade open — check for entry signal
        # -------------------------------------------------------- #
        if not trade_in_progress:
            # 1 trade per day
            current_date = h1_ts.date()
            if one_trade_per_day_date == current_date:
                i += 1
                continue

            # Only check signal once per 4H (every 4 h1 bars)
            if i % 4 != 0:
                i += 1
                continue

            # Slice multi-TF data up to current bar (avoid lookahead)
            h1_window    = h1_df.iloc[:i + 1]
            h4_window    = h4_df[h4_df["ts"] <= h1_ts]
            daily_window = daily_df[daily_df["ts"] <= h1_ts]
            weekly_window = weekly_df[weekly_df["ts"] <= h1_ts]

            if len(h4_window) < 50 or len(daily_window) < 220 or len(weekly_window) < 210:
                i += 1
                continue

            result = check_entry_signal(
                weekly_df=weekly_window,
                daily_df=daily_window,
                h4_df=h4_window,
                h1_df=h1_window,
                symbol=symbol,
                config=config,
            )

            if not result.get("signal"):
                i += 1
                continue

            # Fill at next 1H bar open
            entry_i = i + 1
            if entry_i >= len(h1_df):
                break

            entry_price = float(h1_df.iloc[entry_i]["open"])
            sl_price    = result.get("sl_price") or entry_price * 0.97
            tp1_price   = result.get("tp1_price") or entry_price * 1.03 * config.min_rr_ratio
            tp2_price   = result.get("tp2_price") or entry_price + (entry_price - sl_price) * 5
            atr_1h      = result.get("atr_1h") or entry_price * 0.01
            grade       = result.get("grade", "B")
            rr_ratio    = result.get("rr_ratio", 0.0)

            qty = config.trade_usdt / entry_price
            entry_ts = h1_df.iloc[entry_i]["ts"]
            entry_secs = entry_ts.timestamp()

            peak_price = entry_price
            trailing_sl = max(
                compute_atr_tsl(peak_price, sl_price, atr_1h, config.atr_1h_multiplier),
                sl_price,
            )
            half_exited = False
            qty_remaining = qty
            tp1_pnl = 0.0
            tp1_exit_price = None

            max_hold_bars = config.max_hold_hours * 1   # 1 bar per hour for 1H data

            exit_price = None
            exit_reason = None
            exit_i = entry_i
            tsl_updates = 0

            for j in range(entry_i + 1, min(entry_i + max_hold_bars + 1, len(h1_df))):
                candle = h1_df.iloc[j]
                high = float(candle["high"])
                low  = float(candle["low"])

                # Update peak + ATR TSL
                if high > peak_price:
                    peak_price = high
                    new_tsl = compute_atr_tsl(peak_price, trailing_sl, atr_1h, config.atr_1h_multiplier)
                    if new_tsl > trailing_sl:
                        trailing_sl = new_tsl
                        tsl_updates += 1

                current_mid = (high + low) / 2

                # TP1 partial exit check
                if not half_exited and high >= tp1_price:
                    tp1_exit_price = tp1_price
                    tp1_fee = (qty * 0.5) * tp1_price * 0.0005
                    tp1_pnl = (tp1_price - entry_price) * (qty * 0.5) - tp1_fee
                    half_exited = True
                    qty_remaining = qty * 0.5
                    # SL moves to breakeven
                    sl_price = entry_price
                    tp1_hit_count += 1
                    continue

                # Exit checks (using candle low/high for simulation realism)
                if half_exited:
                    if high >= tp2_price:
                        exit_price = tp2_price
                        exit_reason = "TAKE_PROFIT_2"
                        exit_i = j
                        tp2_hit_count += 1
                        break
                    if low <= trailing_sl:
                        exit_price = trailing_sl
                        exit_reason = "TRAILING_SL"
                        exit_i = j
                        break
                    if low <= sl_price:
                        exit_price = sl_price
                        exit_reason = "BREAKEVEN_SL"
                        exit_i = j
                        break
                else:
                    if low <= trailing_sl or low <= sl_price:
                        exit_price = min(trailing_sl, sl_price)
                        exit_reason = "HARD_SL"
                        exit_i = j
                        break

                elapsed_h = (candle["ts"].timestamp() - entry_secs) / 3600
                if elapsed_h >= config.max_hold_hours:
                    exit_price = float(candle["close"])
                    exit_reason = "TIMEOUT"
                    exit_i = j
                    break

            if exit_price is None:
                exit_i = min(entry_i + max_hold_bars, len(h1_df) - 1)
                exit_price = float(h1_df.iloc[exit_i]["close"])
                exit_reason = "TIMEOUT"

            exit_ts = h1_df.iloc[exit_i]["ts"]
            exit_fee = qty_remaining * exit_price * 0.0005
            final_pnl = (exit_price - entry_price) * qty_remaining - exit_fee
            final_pct = (exit_price - entry_price) / entry_price * 100
            total_pnl = tp1_pnl + final_pnl
            total_pct = (total_pnl / config.trade_usdt * 100) if config.trade_usdt > 0 else final_pct
            hold_minutes = (exit_ts.timestamp() - entry_secs) / 60

            equity += total_pnl
            total_fees += exit_fee + (qty * 0.5 * (tp1_exit_price or 0) * 0.0005 if half_exited else 0)
            trade_pnls.append(total_pnl)

            exit_reason_breakdown[exit_reason] = exit_reason_breakdown.get(exit_reason, 0) + 1
            grade_breakdown[grade] = grade_breakdown.get(grade, 0) + 1
            rr_achieved = ((exit_price - entry_price) / (entry_price - (result.get("sl_price") or entry_price))) if (entry_price - (result.get("sl_price") or entry_price)) > 0 else 0
            rr_achieved_list.append(rr_achieved)

            trade_dict = {
                "entry_time": entry_ts.isoformat(),
                "exit_time": exit_ts.isoformat(),
                "entry_price": entry_price,
                "exit_price": exit_price,
                "peak_price": peak_price,
                "qty": qty,
                "pnl_usdt": total_pnl,
                "pnl_pct": total_pct,
                "exit_fee": exit_fee,
                "exit_reason": exit_reason,
                "hold_minutes": hold_minutes,
                "grade": grade,
                "rr_ratio": rr_ratio,
                "half_exited": half_exited,
                "tp1_pnl_usdt": tp1_pnl if half_exited else 0.0,
                "tp1_exit_price": tp1_exit_price,
                "tsl_updates": tsl_updates,
            }
            trades.append(trade_dict)
            equity_curve.append({"timestamp": exit_ts.isoformat(), "equity_usdt": round(equity, 6)})

            one_trade_per_day_date = entry_ts.date()
            trade_in_progress = False
            i = exit_i + 1

        else:
            i += 1

    # ------------------------------------------------------------------ #
    # Statistics
    # ------------------------------------------------------------------ #
    total = len(trades)
    wins = [t for t in trades if t["pnl_usdt"] > 0]
    losses = [t for t in trades if t["pnl_usdt"] <= 0]
    win_rate = len(wins) / total if total > 0 else 0.0
    total_pnl_usdt = sum(t["pnl_usdt"] for t in trades)
    total_pnl_pct = sum(t["pnl_pct"] for t in trades)
    avg_win_pct = sum(t["pnl_pct"] for t in wins) / len(wins) if wins else 0.0
    avg_loss_pct = sum(t["pnl_pct"] for t in losses) / len(losses) if losses else 0.0
    avg_hold = sum(t["hold_minutes"] for t in trades) / total if total > 0 else 0.0
    avg_rr = sum(rr_achieved_list) / len(rr_achieved_list) if rr_achieved_list else 0.0

    gross_profit = sum(t["pnl_usdt"] for t in wins)
    gross_loss = abs(sum(t["pnl_usdt"] for t in losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    eq_values = [e["equity_usdt"] for e in equity_curve]
    max_dd = 0.0
    if eq_values:
        peak = eq_values[0]
        for v in eq_values:
            if v > peak:
                peak = v
            dd = (peak - v) / abs(peak) if peak != 0 else 0
            if dd > max_dd:
                max_dd = dd

    if len(trade_pnls) > 1:
        arr = np.array(trade_pnls)
        std = np.std(arr)
        mean = np.mean(arr)
        sharpe = (mean / std * math.sqrt(len(arr))) if std > 0 else 0.0
    else:
        sharpe = 0.0

    return BacktestResult(
        symbol=symbol,
        timeframe="1h",
        start_date=start_date,
        end_date=end_date,
        total_trades=total,
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=win_rate,
        total_pnl_pct=total_pnl_pct,
        total_pnl_usdt=total_pnl_usdt,
        total_fees_usdt=total_fees,
        avg_win_pct=avg_win_pct,
        avg_loss_pct=avg_loss_pct,
        max_drawdown_pct=max_dd * 100,
        profit_factor=profit_factor,
        sharpe_ratio=sharpe,
        avg_hold_minutes=avg_hold,
        tp1_hit_count=tp1_hit_count,
        tp2_hit_count=tp2_hit_count,
        avg_rr_achieved=avg_rr,
        grade_breakdown=grade_breakdown,
        exit_reason_breakdown=exit_reason_breakdown,
        trades=trades,
        equity_curve=equity_curve,
    )
