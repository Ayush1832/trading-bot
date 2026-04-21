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
from backend.strategy import compute_indicators, check_entry_signal, compute_tsl, check_exit

logger = logging.getLogger(__name__)


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
    avg_win_pct: float
    avg_loss_pct: float
    max_drawdown_pct: float
    profit_factor: float
    sharpe_ratio: float
    avg_hold_minutes: float
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
            "avg_win_pct": self.avg_win_pct,
            "avg_loss_pct": self.avg_loss_pct,
            "max_drawdown_pct": self.max_drawdown_pct,
            "profit_factor": self.profit_factor,
            "sharpe_ratio": self.sharpe_ratio,
            "avg_hold_minutes": self.avg_hold_minutes,
            "trades": self.trades,
            "equity_curve": self.equity_curve,
        }


async def _fetch_all_ohlcv(
    exchange: MexcExchange,
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Fetch all candles in date range, paginating as needed."""
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    since_ms = int(start_dt.timestamp() * 1000)
    end_ms = int(end_dt.timestamp() * 1000)

    all_dfs = []
    while since_ms < end_ms:
        try:
            df = await exchange.fetch_ohlcv_range(symbol, timeframe, since_ms=since_ms, limit=1000)
        except Exception as e:
            logger.error(f"Backtest OHLCV fetch error: {e}")
            break

        if df.empty:
            break

        all_dfs.append(df)
        last_ts = df["ts"].iloc[-1]
        last_ms = int(last_ts.timestamp() * 1000)
        if last_ms <= since_ms:
            break
        since_ms = last_ms + 1
        await asyncio.sleep(0.5)

    if not all_dfs:
        return pd.DataFrame()

    full_df = pd.concat(all_dfs, ignore_index=True)
    full_df = full_df.drop_duplicates(subset=["ts"]).sort_values("ts").reset_index(drop=True)
    end_filter = end_dt
    full_df = full_df[full_df["ts"] <= pd.Timestamp(end_filter)]
    return full_df


async def run_backtest(
    exchange: MexcExchange,
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str,
    config: Settings,
) -> BacktestResult:
    logger.info(f"Backtest: {symbol} {timeframe} {start_date} to {end_date}")

    full_df = await _fetch_all_ohlcv(exchange, symbol, timeframe, start_date, end_date)
    if full_df.empty or len(full_df) < 60:
        return BacktestResult(
            symbol=symbol, timeframe=timeframe, start_date=start_date, end_date=end_date,
            total_trades=0, winning_trades=0, losing_trades=0, win_rate=0.0,
            total_pnl_pct=0.0, total_pnl_usdt=0.0, avg_win_pct=0.0, avg_loss_pct=0.0,
            max_drawdown_pct=0.0, profit_factor=0.0, sharpe_ratio=0.0, avg_hold_minutes=0.0,
        )

    full_df = compute_indicators(full_df)
    trades = []
    equity = 0.0
    equity_curve = []
    trade_pnls = []

    i = 52  # start after enough candles for indicators
    last_exit_i: Optional[int] = None
    cooldown_candles = config.cooldown_seconds // 60 + 1

    while i < len(full_df) - 1:
        # Cooldown check
        if last_exit_i is not None and (i - last_exit_i) < cooldown_candles:
            i += 1
            continue

        # Check entry on candle i (use slice up to i+1)
        window = full_df.iloc[:i + 1]
        signal = check_entry_signal(window)

        if not signal["signal"]:
            i += 1
            continue

        # Simulate fill at next candle's open
        entry_i = i + 1
        if entry_i >= len(full_df):
            break

        entry_price = float(full_df.iloc[entry_i]["open"])
        qty = config.trade_usdt / entry_price
        tp_price = entry_price * (1 + config.take_profit_pct)
        hard_sl = entry_price * (1 - config.hard_sl_pct)
        peak_price = entry_price
        tsl = compute_tsl(peak_price, config.trail_pct)
        entry_ts = full_df.iloc[entry_i]["ts"]
        entry_time_secs = entry_ts.timestamp()

        exit_price = None
        exit_reason = None
        exit_i = entry_i
        tsl_updates = 0

        # Walk forward candle by candle to simulate exit
        max_candles = config.max_hold_minutes  # 1m candles
        for j in range(entry_i + 1, min(entry_i + max_candles + 1, len(full_df))):
            candle = full_df.iloc[j]
            high = float(candle["high"])
            low = float(candle["low"])

            # Update peak (assume high reached before low in bullish scenario — worst case for SL)
            if high > peak_price:
                peak_price = high
                new_tsl = compute_tsl(peak_price, config.trail_pct)
                if new_tsl > tsl:
                    tsl = new_tsl
                    tsl_updates += 1

            # Check SL first (worst case: SL hits at candle low)
            if low <= hard_sl or low <= tsl:
                exit_price = min(hard_sl, tsl) if low <= hard_sl and low <= tsl else (hard_sl if low <= hard_sl else tsl)
                exit_reason = "HARD_SL" if low <= hard_sl else "TRAILING_SL"
                exit_i = j
                break

            # Check TP (best case: TP hits at candle high)
            if high >= tp_price:
                exit_price = tp_price
                exit_reason = "TAKE_PROFIT"
                exit_i = j
                break

            # Timeout
            elapsed_minutes = (candle["ts"].timestamp() - entry_time_secs) / 60
            if elapsed_minutes >= config.max_hold_minutes:
                exit_price = float(candle["close"])
                exit_reason = "TIMEOUT"
                exit_i = j
                break

        if exit_price is None:
            # No exit found — close at last candle
            exit_i = min(entry_i + max_candles, len(full_df) - 1)
            exit_price = float(full_df.iloc[exit_i]["close"])
            exit_reason = "TIMEOUT"

        pnl_pct = (exit_price - entry_price) / entry_price * 100
        pnl_usdt = (exit_price - entry_price) * qty
        equity += pnl_usdt
        trade_pnls.append(pnl_usdt)

        exit_ts = full_df.iloc[exit_i]["ts"]
        hold_minutes = (exit_ts.timestamp() - entry_ts.timestamp()) / 60

        trade_dict = {
            "entry_time": entry_ts.isoformat(),
            "exit_time": exit_ts.isoformat(),
            "entry_price": entry_price,
            "exit_price": exit_price,
            "peak_price": peak_price,
            "qty": qty,
            "pnl_pct": pnl_pct,
            "pnl_usdt": pnl_usdt,
            "exit_reason": exit_reason,
            "hold_minutes": hold_minutes,
            "tsl_updates": tsl_updates,
        }
        trades.append(trade_dict)
        equity_curve.append({"timestamp": exit_ts.isoformat(), "equity_usdt": round(equity, 6)})

        last_exit_i = exit_i
        i = exit_i + 1

    # Compute stats
    total = len(trades)
    wins = [t for t in trades if t["pnl_usdt"] > 0]
    losses = [t for t in trades if t["pnl_usdt"] <= 0]
    win_rate = len(wins) / total if total > 0 else 0.0
    total_pnl_usdt = sum(t["pnl_usdt"] for t in trades)
    total_pnl_pct = sum(t["pnl_pct"] for t in trades)
    avg_win_pct = sum(t["pnl_pct"] for t in wins) / len(wins) if wins else 0.0
    avg_loss_pct = sum(t["pnl_pct"] for t in losses) / len(losses) if losses else 0.0
    avg_hold = sum(t["hold_minutes"] for t in trades) / total if total > 0 else 0.0

    gross_profit = sum(t["pnl_usdt"] for t in wins)
    gross_loss = abs(sum(t["pnl_usdt"] for t in losses))
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

    # Max drawdown on equity curve
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

    # Sharpe ratio (annualized, assuming 1m candles)
    if len(trade_pnls) > 1:
        pnl_arr = np.array(trade_pnls)
        # Annualize: trades per year ≈ total_trades * (525600 / candles_in_range) — approximate
        std = np.std(pnl_arr)
        mean = np.mean(pnl_arr)
        sharpe = (mean / std * math.sqrt(len(trade_pnls))) if std > 0 else 0.0
    else:
        sharpe = 0.0

    return BacktestResult(
        symbol=symbol,
        timeframe=timeframe,
        start_date=start_date,
        end_date=end_date,
        total_trades=total,
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=win_rate,
        total_pnl_pct=total_pnl_pct,
        total_pnl_usdt=total_pnl_usdt,
        avg_win_pct=avg_win_pct,
        avg_loss_pct=avg_loss_pct,
        max_drawdown_pct=max_dd * 100,
        profit_factor=profit_factor,
        sharpe_ratio=sharpe,
        avg_hold_minutes=avg_hold,
        trades=trades,
        equity_curve=equity_curve,
    )
