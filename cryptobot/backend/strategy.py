"""
Precision Swing Strategy — multi-timeframe confluence entry system.

Architecture (4 timeframes checked in cascade):
  [1W] Weekly EMA200 macro trend + higher highs
  [1D] Daily Fibonacci retracement zones (38.2% / 50% / 61.8%) + EMA50/200
  [4H] RSI bullish divergence (price lower low, RSI higher low)
  [4H] MACD cross + weak-seller volume (grades A+ / A / B)
  [1H] Break of Structure (BOS) — entry trigger

Entry only when ALL 4 required conditions pass AND R:R >= 3.0.
Grade (from 4H momentum) is used for signal prioritisation only — never blocks entry.
"""

import time
from datetime import datetime, timezone
from typing import Optional
import pandas as pd
import pandas_ta as ta


# ------------------------------------------------------------------ #
# Helpers
# ------------------------------------------------------------------ #

def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Lightweight indicator calculation for chart display (routes_candles.py).
    Adds EMA20, EMA50, RSI14, Bollinger Bands, volume ratio, ADX14, ATR14.
    This is NOT used for entry signals — the swing strategy uses per-timeframe functions.
    """
    df = df.copy()
    df["ema20"] = ta.ema(df["close"], length=20)
    df["ema50"] = ta.ema(df["close"], length=50)
    df["rsi14"] = ta.rsi(df["close"], length=14)
    bbands = ta.bbands(df["close"], length=20, std=2.0)
    if bbands is not None and not bbands.empty:
        df["bb_low"] = bbands.iloc[:, 0]
        df["bb_mid"] = bbands.iloc[:, 1]
        df["bb_high"] = bbands.iloc[:, 2]
    df["vol_avg"] = df["volume"].rolling(20).mean()
    df["vol_ratio"] = df["volume"] / df["vol_avg"]
    adx = ta.adx(df["high"], df["low"], df["close"], length=14)
    if adx is not None and not adx.empty:
        df["adx14"] = adx.iloc[:, 0]
    atr = ta.atr(df["high"], df["low"], df["close"], length=14)
    if atr is not None and not atr.empty:
        df["atr14"] = atr
    return df


def _ok(v) -> bool:
    return v is not None and not (isinstance(v, float) and pd.isna(v))


def find_local_minima(series: pd.Series, lookback: int = 5) -> list:
    """Return indices of local minima (less than both neighbours) in series."""
    minima = []
    for i in range(1, len(series) - 1):
        if float(series.iloc[i]) < float(series.iloc[i - 1]) and float(series.iloc[i]) < float(series.iloc[i + 1]):
            minima.append(i)
    return minima[-lookback:] if len(minima) > lookback else minima


def find_local_maxima(series: pd.Series, lookback: int = 5) -> list:
    """Return indices of local maxima (greater than both neighbours) in series."""
    maxima = []
    for i in range(1, len(series) - 1):
        if float(series.iloc[i]) > float(series.iloc[i - 1]) and float(series.iloc[i]) > float(series.iloc[i + 1]):
            maxima.append(i)
    return maxima[-lookback:] if len(maxima) > lookback else maxima


# ------------------------------------------------------------------ #
# Condition 1 — Weekly EMA200 macro trend
# ------------------------------------------------------------------ #

def check_weekly_trend(weekly_df: pd.DataFrame) -> dict:
    """
    [1W] Price above weekly EMA200 AND last 3 weekly highs are ascending.
    weekly_df must have at least 210 rows of weekly OHLCV.
    """
    empty = {"ok": False, "ema200": None, "higher_highs": False, "above_ema200": False}

    if weekly_df is None or len(weekly_df) < 210:
        return {**empty, "reason": "insufficient_data"}

    df = weekly_df.copy()
    df["ema200"] = ta.ema(df["close"], length=200)

    last = df.iloc[-2]  # last fully closed weekly candle
    price = float(last["close"])
    ema200_val = last.get("ema200")

    if not _ok(ema200_val):
        return {**empty, "reason": "ema200_nan"}

    ema200 = float(ema200_val)
    above_ema200 = price > ema200

    # Higher highs: last 3 closed weekly candles have ascending highs
    h3 = float(df.iloc[-4]["high"])
    h2 = float(df.iloc[-3]["high"])
    h1 = float(df.iloc[-2]["high"])
    higher_highs = h1 > h2 > h3

    ok = above_ema200 and higher_highs
    return {
        "ok": ok,
        "ema200": ema200,
        "higher_highs": higher_highs,
        "above_ema200": above_ema200,
        "reason": "ok" if ok else ("below_ema200" if not above_ema200 else "no_higher_highs"),
    }


# ------------------------------------------------------------------ #
# Condition 2 — Daily Fibonacci retracement structure
# ------------------------------------------------------------------ #

def check_daily_structure(daily_df: pd.DataFrame, tolerance: float = 0.015) -> dict:
    """
    [1D] Daily EMA50 > EMA200 uptrend AND price pulling back to 38.2%/50%/61.8% Fib zone.
    Fib computed from the highest high and lowest low in the last 50 daily candles.
    """
    empty = {
        "ok": False, "fib_zone": None, "nearest_fib": None,
        "ema50": None, "ema200": None, "ema_uptrend": False,
        "swing_high": None, "swing_low": None,
    }

    if daily_df is None or len(daily_df) < 220:
        return {**empty, "reason": "insufficient_data"}

    df = daily_df.copy()
    df["ema50"] = ta.ema(df["close"], length=50)
    df["ema200"] = ta.ema(df["close"], length=200)

    last = df.iloc[-2]
    price = float(last["close"])
    ema50 = float(last["ema50"]) if _ok(last.get("ema50")) else None
    ema200 = float(last["ema200"]) if _ok(last.get("ema200")) else None

    if ema50 is None or ema200 is None:
        return {**empty, "reason": "ema_nan"}

    ema_uptrend = ema50 > ema200

    # Swing high/low from last 50 daily candles (exclude live candle)
    lookback = df.iloc[-52:-2]
    swing_high = float(lookback["high"].max())
    swing_low = float(lookback["low"].min())

    if swing_high <= swing_low or swing_high == 0:
        return {**empty, "reason": "invalid_swing"}

    fib_range = swing_high - swing_low
    fib_levels = {
        "38.2%": swing_high - fib_range * 0.382,
        "50.0%": swing_high - fib_range * 0.500,
        "61.8%": swing_high - fib_range * 0.618,
    }

    fib_zone = None
    nearest_fib = None
    min_dist = float("inf")

    for name, level in fib_levels.items():
        dist = abs(price - level) / level if level > 0 else float("inf")
        if dist < min_dist:
            min_dist = dist
            nearest_fib = name
        if dist <= tolerance:
            fib_zone = name

    in_fib_zone = fib_zone is not None
    ok = ema_uptrend and in_fib_zone

    return {
        "ok": ok,
        "fib_zone": fib_zone,
        "nearest_fib": nearest_fib,
        "ema50": ema50,
        "ema200": ema200,
        "ema_uptrend": ema_uptrend,
        "swing_high": swing_high,
        "swing_low": swing_low,
        "fib_382": fib_levels["38.2%"],
        "fib_500": fib_levels["50.0%"],
        "fib_618": fib_levels["61.8%"],
        "price": price,
        "reason": "ok" if ok else ("no_fib_zone" if not in_fib_zone else "no_ema_uptrend"),
    }


# ------------------------------------------------------------------ #
# Condition 3 — 4H RSI bullish divergence
# ------------------------------------------------------------------ #

def check_4h_divergence(
    h4_df: pd.DataFrame,
    max_age_candles: int = 8,
    min_rsi_level: float = 50.0,
) -> dict:
    """
    [4H] Bullish RSI divergence: price makes lower low while RSI makes higher low.
    The RSI at the second (more recent) low must be below min_rsi_level (50).
    """
    empty = {"ok": False, "divergence_strength": 0.0, "rsi_at_low": None}

    if h4_df is None or len(h4_df) < 30:
        return {**empty, "reason": "insufficient_data"}

    df = h4_df.copy()
    df["rsi14"] = ta.rsi(df["close"], length=14)

    # Look in last max_age_candles * 3 candles (excluding live candle)
    window_size = max_age_candles * 3 + 5
    window = df.iloc[-window_size:-1].reset_index(drop=True)

    if len(window) < 10:
        return {**empty, "reason": "window_too_small"}

    lows_series = window["low"]
    rsi_series = window["rsi14"]

    price_minima = find_local_minima(lows_series, lookback=4)
    rsi_minima = find_local_minima(rsi_series, lookback=4)

    if len(price_minima) < 2 or len(rsi_minima) < 2:
        return {**empty, "reason": "no_minima"}

    p1_idx, p2_idx = price_minima[-2], price_minima[-1]
    r1_idx, r2_idx = rsi_minima[-2], rsi_minima[-1]

    p1 = float(lows_series.iloc[p1_idx])
    p2 = float(lows_series.iloc[p2_idx])
    rsi1_raw = rsi_series.iloc[r1_idx]
    rsi2_raw = rsi_series.iloc[r2_idx]

    if not _ok(rsi1_raw) or not _ok(rsi2_raw):
        return {**empty, "reason": "rsi_nan"}

    rsi1 = float(rsi1_raw)
    rsi2 = float(rsi2_raw)

    price_lower_low = p2 < p1
    rsi_higher_low = rsi2 > rsi1
    rsi_oversold = rsi2 < min_rsi_level

    ok = price_lower_low and rsi_higher_low and rsi_oversold
    divergence_strength = float(rsi2 - rsi1) if ok else 0.0

    return {
        "ok": ok,
        "divergence_strength": divergence_strength,
        "rsi_at_low": rsi2,
        "rsi1": rsi1,
        "rsi2": rsi2,
        "p1": p1,
        "p2": p2,
        "price_lower_low": price_lower_low,
        "rsi_higher_low": rsi_higher_low,
        "rsi_oversold": rsi_oversold,
        "reason": (
            "ok" if ok else
            "no_price_lower_low" if not price_lower_low else
            "no_rsi_higher_low" if not rsi_higher_low else
            "rsi_not_oversold"
        ),
    }


# ------------------------------------------------------------------ #
# Condition 4 — 4H MACD momentum + weak sellers (grade)
# ------------------------------------------------------------------ #

def check_4h_momentum(h4_df: pd.DataFrame, weak_seller_ratio: float = 0.85) -> dict:
    """
    [4H] MACD bullish cross + weak-seller volume pattern.
    Grade: A+ = both; A = MACD cross only; B = neither (acceptable).
    This condition is advisory — grade is used for signal ranking only, never blocks entry.
    """
    if h4_df is None or len(h4_df) < 40:
        return {"ok": True, "grade": "B", "macd_cross": False, "weak_sellers": False, "reason": "insufficient_data"}

    df = h4_df.copy()
    macd_result = ta.macd(df["close"], fast=12, slow=26, signal=9)

    macd_cross = False
    if macd_result is not None and not macd_result.empty:
        macd_cols = [c for c in macd_result.columns if c.startswith("MACD_") and "h" not in c.lower() and "s" not in c.lower()]
        sig_cols = [c for c in macd_result.columns if c.startswith("MACDs_")]

        if macd_cols and sig_cols:
            macd_line = macd_result[macd_cols[0]]
            signal_line = macd_result[sig_cols[0]]

            # Look for bullish cross in last 5 closed candles
            for i in range(2, 7):
                if len(macd_line) < i + 2:
                    break
                prev_m = macd_line.iloc[-i - 1]
                prev_s = signal_line.iloc[-i - 1]
                curr_m = macd_line.iloc[-i]
                curr_s = signal_line.iloc[-i]
                if all(_ok(v) for v in [prev_m, prev_s, curr_m, curr_s]):
                    if float(prev_m) < float(prev_s) and float(curr_m) >= float(curr_s):
                        macd_cross = True
                        break

    # Weak sellers: last closed candle is green but volume is below ratio × 20-bar avg
    weak_sellers = False
    if len(df) >= 22:
        recent = df.iloc[-2]
        vol_avg_20 = float(df["volume"].iloc[-22:-2].mean())
        if vol_avg_20 > 0:
            green = float(recent["close"]) > float(recent["open"])
            low_vol = float(recent["volume"]) < weak_seller_ratio * vol_avg_20
            weak_sellers = green and low_vol

    grade = "A+" if (macd_cross and weak_sellers) else ("A" if macd_cross else "B")

    return {
        "ok": True,
        "grade": grade,
        "macd_cross": macd_cross,
        "weak_sellers": weak_sellers,
        "reason": "ok",
    }


# ------------------------------------------------------------------ #
# Condition 5 — 1H Break of Structure (entry trigger)
# ------------------------------------------------------------------ #

def check_1h_entry_trigger(h1_df: pd.DataFrame, lookback: int = 10) -> dict:
    """
    [1H] Break of Structure: current 1H close > highest high in the previous `lookback` closed candles.
    This confirms buyers have absorbed the pullback and resumed the uptrend.
    """
    empty = {"ok": False, "bos_level": None, "current_close": None}

    if h1_df is None or len(h1_df) < lookback + 5:
        return {**empty, "reason": "insufficient_data"}

    # Swing high from candles before the last closed one
    swing_window = h1_df.iloc[-(lookback + 2):-2]
    bos_level = float(swing_window["high"].max())
    current_close = float(h1_df.iloc[-2]["close"])

    ok = current_close > bos_level

    return {
        "ok": ok,
        "bos_level": bos_level,
        "current_close": current_close,
        "reason": "ok" if ok else "no_bos",
    }


# ------------------------------------------------------------------ #
# R:R computation
# ------------------------------------------------------------------ #

def compute_rr_ratio(entry: float, sl: float, target: float) -> float:
    """R:R = (target - entry) / (entry - sl). Returns 0.0 if parameters are invalid."""
    risk = entry - sl
    reward = target - entry
    if risk <= 0 or reward <= 0:
        return 0.0
    return round(reward / risk, 2)


# ------------------------------------------------------------------ #
# ATR-based trailing stop
# ------------------------------------------------------------------ #

def compute_atr_tsl(peak_price: float, current_tsl: float, atr_1h: float, multiplier: float = 1.5) -> float:
    """
    ATR-based trailing stop = peak_price - (atr_1h × multiplier).
    Structural guarantee: never decreases (max of new computation vs current TSL).
    """
    new_tsl = peak_price - atr_1h * multiplier
    return max(new_tsl, current_tsl)


# ------------------------------------------------------------------ #
# Master entry signal function
# ------------------------------------------------------------------ #

def check_entry_signal(
    weekly_df: pd.DataFrame,
    daily_df: pd.DataFrame,
    h4_df: pd.DataFrame,
    h1_df: pd.DataFrame,
    symbol: str = "",
    config=None,
) -> dict:
    """
    Combines all 5 timeframe conditions into a single signal decision.

    Required: weekly_trend, daily_structure, h4_divergence, h1_bos  (all must pass)
    Advisory: h4_momentum grade — used for ranking only, never blocks entry

    Also computes SL, TP1, TP2 levels and confirms R:R >= min_rr_ratio.

    Returns dict with keys:
      signal, grade, rr_ratio, sl_price, tp1_price, tp2_price,
      atr_1h, conditions, values, symbol
    """
    min_rr = float(getattr(config, "min_rr_ratio", 3.0))
    tolerance = float(getattr(config, "daily_pullback_tolerance", 0.015))
    weak_seller_ratio = float(getattr(config, "volume_weak_seller_ratio", 0.85))
    div_max_age = int(getattr(config, "div_max_age_candles", 8))
    div_min_rsi = float(getattr(config, "div_min_rsi_level", 50.0))
    atr_mult = float(getattr(config, "atr_1h_multiplier", 1.5))

    no_signal = {
        "signal": False, "grade": None, "rr_ratio": 0.0,
        "sl_price": None, "tp1_price": None, "tp2_price": None,
        "atr_1h": None, "conditions": {}, "values": {}, "symbol": symbol,
    }

    # Run all condition checks
    weekly = check_weekly_trend(weekly_df)
    daily = check_daily_structure(daily_df, tolerance=tolerance)
    h4_div = check_4h_divergence(h4_df, max_age_candles=div_max_age, min_rsi_level=div_min_rsi)
    h4_mom = check_4h_momentum(h4_df, weak_seller_ratio=weak_seller_ratio)
    h1_bos = check_1h_entry_trigger(h1_df)

    conditions = {
        "weekly_trend": weekly,
        "daily_structure": daily,
        "h4_divergence": h4_div,
        "h4_momentum": h4_mom,
        "h1_bos": h1_bos,
    }

    # All required conditions must pass
    if not (weekly["ok"] and daily["ok"] and h4_div["ok"] and h1_bos["ok"]):
        return {**no_signal, "conditions": conditions}

    # --- Compute price levels ---
    if h1_df is None or len(h1_df) < 22:
        return {**no_signal, "conditions": conditions}

    # Entry: current 1H close (BOS confirmed candle)
    entry_price = float(h1_df.iloc[-2]["close"])

    # SL: below recent 1H swing low with 0.1% buffer
    h1_window = h1_df.iloc[-22:-2]
    sl_price = float(h1_window["low"].min()) * 0.999

    risk = entry_price - sl_price
    if risk <= 0 or sl_price <= 0:
        return {**no_signal, "conditions": conditions}

    # TP1: 4H structural resistance (90th percentile high), minimum 3:1 R
    tp1_min = entry_price + risk * 3.0
    if h4_df is not None and len(h4_df) >= 54:
        h4_resistance = float(h4_df["high"].iloc[-54:-2].quantile(0.90))
        tp1_price = max(tp1_min, h4_resistance) if h4_resistance > entry_price else tp1_min
    else:
        tp1_price = tp1_min

    # TP2: runner target at 5:1 R
    tp2_price = entry_price + risk * 5.0

    # 1H ATR for TSL sizing
    atr_result = ta.atr(h1_df["high"], h1_df["low"], h1_df["close"], length=14)
    atr_1h = None
    if atr_result is not None and not atr_result.empty:
        raw = atr_result.iloc[-2]
        atr_1h = float(raw) if _ok(raw) else None

    rr_ratio = compute_rr_ratio(entry_price, sl_price, tp1_price)
    if rr_ratio < min_rr:
        return {**no_signal, "conditions": conditions, "rr_ratio": rr_ratio}

    return {
        "signal": True,
        "grade": h4_mom["grade"],
        "rr_ratio": rr_ratio,
        "sl_price": sl_price,
        "tp1_price": tp1_price,
        "tp2_price": tp2_price,
        "atr_1h": atr_1h,
        "conditions": conditions,
        "values": {
            "entry_price": entry_price,
            "sl_price": sl_price,
            "tp1_price": tp1_price,
            "tp2_price": tp2_price,
            "rr_ratio": rr_ratio,
            "atr_1h": atr_1h,
            "grade": h4_mom["grade"],
            "divergence_strength": h4_div["divergence_strength"],
            "rsi_at_low": h4_div["rsi_at_low"],
            "fib_zone": daily.get("fib_zone"),
            "nearest_fib": daily.get("nearest_fib"),
            "weekly_ema200": weekly.get("ema200"),
            "bos_level": h1_bos.get("bos_level"),
            "macd_cross": h4_mom.get("macd_cross"),
            "weak_sellers": h4_mom.get("weak_sellers"),
        },
        "symbol": symbol,
    }


# ------------------------------------------------------------------ #
# Signal selection (pick best from multiple simultaneous signals)
# ------------------------------------------------------------------ #

def select_best_signal(signals: list) -> tuple:
    """
    Pick the highest-quality signal from a list of (symbol, signal_dict) pairs.
    Priority: grade (A+ > A > B) → R:R (higher better) → divergence_strength → alphabetical
    Returns (symbol, signal_dict) or (None, None).
    """
    if not signals:
        return None, None

    grade_rank = {"A+": 0, "A": 1, "B": 2, None: 3}

    signals.sort(key=lambda x: (
        grade_rank.get(x[1].get("grade"), 3),
        -x[1].get("rr_ratio", 0.0),
        -(x[1].get("conditions", {}).get("h4_divergence", {}).get("divergence_strength", 0.0)),
        x[0],
    ))
    return signals[0][0], signals[0][1]


# ------------------------------------------------------------------ #
# Exit logic
# ------------------------------------------------------------------ #

def check_exit(
    current_price: float,
    sl_price: float,
    trailing_sl: float,
    tp1_price: float,
    tp2_price: float,
    half_exited: bool,
    entry_time: float,
    max_hold_hours: int = 72,
) -> Optional[str]:
    """
    Swing-strategy exit checks.

    Before TP1: TP1_PARTIAL | HARD_SL (SL or TSL hit)
    After TP1:  TAKE_PROFIT_2 | TRAILING_SL | BREAKEVEN_SL | TIMEOUT

    SL after TP1 is moved to breakeven (entry_price) — caller updates sl_price.
    """
    if half_exited:
        if current_price >= tp2_price:
            return "TAKE_PROFIT_2"
        if current_price <= trailing_sl:
            return "TRAILING_SL"
        if current_price <= sl_price:
            return "BREAKEVEN_SL"
    else:
        if current_price >= tp1_price:
            return "TP1_PARTIAL"
        if current_price <= trailing_sl or current_price <= sl_price:
            return "HARD_SL"

    elapsed_hours = (time.time() - entry_time) / 3600
    if elapsed_hours >= max_hold_hours:
        return "TIMEOUT"

    return None
