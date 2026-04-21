import time
from typing import Optional
import pandas as pd
import pandas_ta as ta


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Input: DataFrame with [ts, open, high, low, close, volume], at least 60 rows.
    Output: same DataFrame with ema50, rsi14, bb_low, bb_mid, bb_high, vol_avg, vol_ratio added.
    """
    df = df.copy()
    df["ema50"] = ta.ema(df["close"], length=50)

    rsi = ta.rsi(df["close"], length=14)
    df["rsi14"] = rsi

    bbands = ta.bbands(df["close"], length=20, std=2.0)
    if bbands is not None:
        df["bb_low"] = bbands.iloc[:, 0]
        df["bb_mid"] = bbands.iloc[:, 1]
        df["bb_high"] = bbands.iloc[:, 2]
    else:
        df["bb_low"] = None
        df["bb_mid"] = None
        df["bb_high"] = None

    df["vol_avg"] = df["volume"].rolling(20).mean()
    df["vol_ratio"] = df["volume"] / df["vol_avg"]

    return df


def check_entry_signal(df: pd.DataFrame) -> dict:
    """
    Uses second-to-last candle (iloc[-2]) — last fully closed candle.
    Returns signal dict with reasons and values.
    """
    if len(df) < 52:
        return {
            "signal": False,
            "reasons": {},
            "values": {},
        }

    candle = df.iloc[-2]
    price = candle["close"]

    trend_ok = bool(price > candle["ema50"]) if pd.notna(candle["ema50"]) else False
    rsi_ok = bool(candle["rsi14"] < 30) if pd.notna(candle["rsi14"]) else False
    bb_ok = bool(price <= candle["bb_low"]) if pd.notna(candle["bb_low"]) else False
    volume_ok = bool(candle["vol_ratio"] > 1.5) if pd.notna(candle["vol_ratio"]) else False

    signal = trend_ok and rsi_ok and bb_ok and volume_ok

    return {
        "signal": signal,
        "reasons": {
            "trend_ok": trend_ok,
            "rsi_ok": rsi_ok,
            "bb_ok": bb_ok,
            "volume_ok": volume_ok,
        },
        "values": {
            "price": float(price) if pd.notna(price) else None,
            "ema50": float(candle["ema50"]) if pd.notna(candle["ema50"]) else None,
            "rsi": float(candle["rsi14"]) if pd.notna(candle["rsi14"]) else None,
            "bb_low": float(candle["bb_low"]) if pd.notna(candle["bb_low"]) else None,
            "vol_ratio": float(candle["vol_ratio"]) if pd.notna(candle["vol_ratio"]) else None,
        },
    }


def compute_tsl(peak_price: float, trail_pct: float) -> float:
    """Returns trailing_sl = peak_price * (1 - trail_pct)"""
    return peak_price * (1 - trail_pct)


def check_exit(
    current_price: float,
    entry_price: float,
    peak_price: float,
    trailing_sl: float,
    take_profit_pct: float,
    hard_sl_pct: float,
    entry_time: float,
    max_hold_minutes: int,
) -> Optional[str]:
    """
    Returns exit reason string or None.
    - "TAKE_PROFIT"
    - "TRAILING_SL"
    - "HARD_SL"
    - "TIMEOUT"
    - None (no exit)
    """
    if current_price >= entry_price * (1 + take_profit_pct):
        return "TAKE_PROFIT"

    if current_price <= trailing_sl:
        return "TRAILING_SL"

    if current_price <= entry_price * (1 - hard_sl_pct):
        return "HARD_SL"

    elapsed_minutes = (time.time() - entry_time) / 60
    if elapsed_minutes >= max_hold_minutes:
        return "TIMEOUT"

    return None
