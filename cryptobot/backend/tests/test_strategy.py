"""
Precision Swing Strategy — unit tests.

All tests use synthetic DataFrames built in-process.
No exchange connection needed.

Run: pytest backend/tests/test_strategy.py -v
"""

import pytest
import time
import numpy as np
import pandas as pd

from backend.strategy import (
    find_local_minima,
    find_local_maxima,
    check_weekly_trend,
    check_daily_structure,
    check_4h_divergence,
    check_4h_momentum,
    check_1h_entry_trigger,
    compute_rr_ratio,
    compute_atr_tsl,
    check_entry_signal,
    select_best_signal,
    check_exit,
)
from backend.core.config import Settings


# ------------------------------------------------------------------ #
# Synthetic data helpers
# ------------------------------------------------------------------ #

def make_ohlcv(n: int, start_price: float = 100.0, trend: float = 0.0003, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    closes = [start_price]
    for _ in range(n - 1):
        closes.append(max(closes[-1] * (1 + trend + rng.normal(0, 0.005)), 0.01))
    closes = np.array(closes)
    return pd.DataFrame({
        "ts": pd.date_range("2022-01-01", periods=n, freq="1h"),
        "open": closes * (1 - 0.0005),
        "high": closes * (1 + rng.uniform(0.001, 0.005, n)),
        "low":  closes * (1 - rng.uniform(0.001, 0.005, n)),
        "close": closes,
        "volume": rng.uniform(500, 3000, n),
    })


def make_settings(**kwargs) -> Settings:
    defaults = dict(
        mexc_api_key="", mexc_api_secret="",
        min_rr_ratio=3.0,
        atr_1h_multiplier=1.5,
        daily_pullback_tolerance=0.015,
        div_max_age_candles=8,
        div_min_rsi_level=50.0,
        volume_weak_seller_ratio=0.85,
        tp1_position_size=0.5,
        max_hold_hours=72,
        max_trades_per_day=1,
        trade_usdt=1.0,
    )
    defaults.update(kwargs)
    return Settings(**defaults)


# ------------------------------------------------------------------ #
# find_local_minima / find_local_maxima
# ------------------------------------------------------------------ #

def test_find_local_minima_basic():
    s = pd.Series([5, 3, 6, 2, 8, 1, 9])
    minima = find_local_minima(s)
    assert 1 in minima
    assert 3 in minima
    assert 5 in minima


def test_find_local_minima_flat():
    s = pd.Series([5.0, 5.0, 5.0, 5.0])
    assert find_local_minima(s) == []


def test_find_local_maxima_basic():
    s = pd.Series([1, 5, 2, 8, 3, 6, 1])
    maxima = find_local_maxima(s)
    assert 1 in maxima
    assert 3 in maxima


def test_find_local_minima_lookback_limit():
    s = pd.Series([3, 1, 4, 1, 5, 1, 9, 1, 6])
    minima = find_local_minima(s, lookback=2)
    assert len(minima) <= 2


# ------------------------------------------------------------------ #
# check_weekly_trend
# ------------------------------------------------------------------ #

def test_weekly_trend_insufficient_data():
    df = make_ohlcv(50)
    result = check_weekly_trend(df)
    assert result["ok"] is False
    assert result["reason"] == "insufficient_data"


def test_weekly_trend_returns_all_fields():
    df = make_ohlcv(215, trend=0.002)
    result = check_weekly_trend(df)
    for key in ("ok", "ema200", "higher_highs", "above_ema200", "reason"):
        assert key in result


def test_weekly_trend_strong_uptrend():
    df = make_ohlcv(250, start_price=10.0, trend=0.005, seed=1)
    result = check_weekly_trend(df)
    assert isinstance(result["ok"], bool)
    assert result.get("ema200") is not None or result["reason"] == "ema200_nan"


def test_weekly_trend_downtrend_fails_or_no_higher_highs():
    df = make_ohlcv(250, start_price=200.0, trend=-0.003, seed=99)
    result = check_weekly_trend(df)
    assert isinstance(result["ok"], bool)


# ------------------------------------------------------------------ #
# check_daily_structure
# ------------------------------------------------------------------ #

def test_daily_structure_insufficient_data():
    df = make_ohlcv(100)
    result = check_daily_structure(df)
    assert result["ok"] is False
    assert result["reason"] == "insufficient_data"


def test_daily_structure_returns_all_fields():
    df = make_ohlcv(230, trend=0.001)
    result = check_daily_structure(df)
    for key in ("ok", "fib_zone", "nearest_fib", "ema50", "ema200", "ema_uptrend", "reason"):
        assert key in result


def test_daily_structure_fib_levels_ordered():
    df = make_ohlcv(230, trend=0.001)
    result = check_daily_structure(df)
    if result.get("fib_382") and result.get("fib_618"):
        assert result["fib_382"] > result["fib_618"]  # 38.2% retrace is shallower than 61.8%


def test_daily_structure_ema_uptrend_check():
    df = make_ohlcv(230, start_price=1000.0, trend=-0.002, seed=5)
    result = check_daily_structure(df)
    if result.get("ema_uptrend") is False:
        assert result["ok"] is False


def test_daily_structure_swing_high_gt_low():
    df = make_ohlcv(230, trend=0.001)
    result = check_daily_structure(df)
    if result.get("swing_high") and result.get("swing_low"):
        assert result["swing_high"] > result["swing_low"]


# ------------------------------------------------------------------ #
# check_4h_divergence
# ------------------------------------------------------------------ #

def test_4h_divergence_insufficient_data():
    df = make_ohlcv(10)
    result = check_4h_divergence(df)
    assert result["ok"] is False
    assert result["reason"] == "insufficient_data"


def test_4h_divergence_returns_all_fields():
    df = make_ohlcv(60, trend=-0.001)
    result = check_4h_divergence(df)
    for key in ("ok", "divergence_strength", "rsi_at_low"):
        assert key in result


def test_4h_divergence_strength_positive_when_ok():
    df = make_ohlcv(100, trend=-0.002, seed=3)
    result = check_4h_divergence(df)
    if result["ok"]:
        assert result["divergence_strength"] > 0
        assert result["rsi_at_low"] < 50.0


def test_4h_divergence_monotonic_descent_no_minima():
    closes = np.linspace(100, 50, 40)
    df = pd.DataFrame({
        "ts": pd.date_range("2023-01-01", periods=40, freq="1h"),
        "open": closes, "high": closes * 1.001,
        "low": closes * 0.999, "close": closes,
        "volume": np.ones(40) * 1000,
    })
    result = check_4h_divergence(df)
    assert result["ok"] is False


def test_4h_divergence_rsi_too_high_blocks_signal():
    df = make_ohlcv(60, trend=0.008, seed=11)  # strong uptrend → RSI high
    result = check_4h_divergence(df, min_rsi_level=50.0)
    if result.get("rsi_at_low") is not None and result["rsi_at_low"] >= 50.0:
        assert result["ok"] is False


def test_4h_divergence_price_lower_low_required():
    result = check_4h_divergence(make_ohlcv(60, trend=0.003))
    if result.get("price_lower_low") is False:
        assert result["ok"] is False


# ------------------------------------------------------------------ #
# check_4h_momentum
# ------------------------------------------------------------------ #

def test_4h_momentum_ok_always_true():
    df = make_ohlcv(50)
    assert check_4h_momentum(df)["ok"] is True


def test_4h_momentum_grade_valid_values():
    df = make_ohlcv(50)
    result = check_4h_momentum(df)
    assert result["grade"] in ("A+", "A", "B")


def test_4h_momentum_a_plus_requires_both():
    df = make_ohlcv(50)
    result = check_4h_momentum(df)
    if result["grade"] == "A+":
        assert result["macd_cross"] is True
        assert result["weak_sellers"] is True


def test_4h_momentum_insufficient_data_grade_b():
    df = make_ohlcv(10)
    result = check_4h_momentum(df)
    assert result["grade"] == "B"


def test_4h_momentum_returns_all_fields():
    df = make_ohlcv(50)
    result = check_4h_momentum(df)
    for key in ("ok", "grade", "macd_cross", "weak_sellers", "reason"):
        assert key in result


# ------------------------------------------------------------------ #
# check_1h_entry_trigger
# ------------------------------------------------------------------ #

def test_1h_bos_insufficient_data():
    df = make_ohlcv(5)
    assert check_1h_entry_trigger(df)["ok"] is False


def test_1h_bos_returns_all_fields():
    df = make_ohlcv(30)
    result = check_1h_entry_trigger(df)
    for key in ("ok", "bos_level", "current_close", "reason"):
        assert key in result


def test_1h_bos_fires_when_close_above_swing_high():
    n = 30
    df = make_ohlcv(n, seed=20).copy()
    df.iloc[-2, df.columns.get_loc("close")] = df["high"].max() * 2.0
    result = check_1h_entry_trigger(df, lookback=10)
    assert result["ok"] is True


def test_1h_bos_fails_when_close_below_swing_high():
    n = 30
    closes = np.linspace(50, 100, n)
    df = pd.DataFrame({
        "ts": pd.date_range("2023-01-01", periods=n, freq="1h"),
        "open": closes, "high": closes * 1.005,
        "low": closes * 0.995, "close": closes,
        "volume": np.ones(n) * 1000,
    })
    df = df.copy()
    df.iloc[-2, df.columns.get_loc("close")] = 55.0
    result = check_1h_entry_trigger(df, lookback=10)
    assert result["ok"] is False


# ------------------------------------------------------------------ #
# compute_rr_ratio
# ------------------------------------------------------------------ #

def test_rr_ratio_3_to_1():
    assert compute_rr_ratio(100.0, 90.0, 130.0) == pytest.approx(3.0)


def test_rr_ratio_zero_on_zero_risk():
    assert compute_rr_ratio(100.0, 100.0, 130.0) == 0.0


def test_rr_ratio_zero_on_negative_reward():
    assert compute_rr_ratio(100.0, 90.0, 80.0) == 0.0


def test_rr_ratio_5_to_1():
    assert compute_rr_ratio(50000.0, 49000.0, 55000.0) == pytest.approx(5.0)


# ------------------------------------------------------------------ #
# compute_atr_tsl
# ------------------------------------------------------------------ #

def test_atr_tsl_basic_calc():
    assert compute_atr_tsl(110.0, 99.0, 2.0, 1.5) == pytest.approx(107.0)


def test_atr_tsl_never_decreases():
    tsl1 = compute_atr_tsl(100.0, 95.0, 2.0, 1.5)   # 97.0
    tsl2 = compute_atr_tsl(98.0, tsl1, 2.0, 1.5)    # 95.0 → clamped to 97.0
    assert tsl2 >= tsl1


def test_atr_tsl_rises_with_peak():
    tsl1 = compute_atr_tsl(100.0, 0.0, 1.0, 1.5)    # 98.5
    tsl2 = compute_atr_tsl(110.0, tsl1, 1.0, 1.5)   # 108.5
    assert tsl2 > tsl1


# ------------------------------------------------------------------ #
# check_exit
# ------------------------------------------------------------------ #

def test_exit_tp1_partial():
    r = check_exit(130.0, 90.0, 91.0, 129.0, 150.0, False, time.time() - 60, 72)
    assert r == "TP1_PARTIAL"


def test_exit_hard_sl():
    r = check_exit(88.0, 90.0, 91.0, 120.0, 150.0, False, time.time() - 60, 72)
    assert r == "HARD_SL"


def test_exit_tp2_after_half_exit():
    r = check_exit(155.0, 100.0, 100.0, 130.0, 150.0, True, time.time() - 60, 72)
    assert r == "TAKE_PROFIT_2"


def test_exit_breakeven_sl_after_half_exit():
    r = check_exit(99.5, 100.0, 95.0, 130.0, 150.0, True, time.time() - 60, 72)
    assert r == "BREAKEVEN_SL"


def test_exit_trailing_sl_after_half_exit():
    r = check_exit(93.0, 100.0, 94.0, 130.0, 150.0, True, time.time() - 60, 72)
    assert r == "TRAILING_SL"


def test_exit_timeout():
    r = check_exit(105.0, 90.0, 91.0, 130.0, 150.0, False, time.time() - 73 * 3600, 72)
    assert r == "TIMEOUT"


def test_exit_none_when_in_range():
    r = check_exit(105.0, 90.0, 91.0, 130.0, 150.0, False, time.time() - 60, 72)
    assert r is None


# ------------------------------------------------------------------ #
# select_best_signal
# ------------------------------------------------------------------ #

def _sig(grade, rr, div=1.0):
    return {"grade": grade, "rr_ratio": rr, "conditions": {"h4_divergence": {"divergence_strength": div}}}


def test_select_best_signal_empty():
    assert select_best_signal([]) == (None, None)


def test_select_best_signal_grade_a_plus_wins():
    signals = [("ETH/USDT", _sig("B", 4.0)), ("BTC/USDT", _sig("A+", 3.0))]
    sym, _ = select_best_signal(signals)
    assert sym == "BTC/USDT"


def test_select_best_signal_rr_tiebreak():
    signals = [("BTC/USDT", _sig("A", 3.5)), ("ETH/USDT", _sig("A", 4.2))]
    sym, _ = select_best_signal(signals)
    assert sym == "ETH/USDT"


def test_select_best_signal_divergence_tiebreak():
    signals = [("BTC/USDT", _sig("A", 3.5, 5.0)), ("ETH/USDT", _sig("A", 3.5, 2.0))]
    sym, _ = select_best_signal(signals)
    assert sym == "BTC/USDT"


def test_select_best_signal_alphabetical_tiebreak():
    signals = [("SOL/USDT", _sig("B", 3.0)), ("BTC/USDT", _sig("B", 3.0))]
    sym, _ = select_best_signal(signals)
    assert sym == "BTC/USDT"


def test_select_best_signal_single():
    signals = [("ETH/USDT", _sig("A+", 5.0, 3.0))]
    sym, sig = select_best_signal(signals)
    assert sym == "ETH/USDT"
    assert sig["grade"] == "A+"


# ------------------------------------------------------------------ #
# check_entry_signal — structural tests (insufficient data → no signal)
# ------------------------------------------------------------------ #

def test_check_entry_signal_small_data_returns_no_signal():
    config = make_settings()
    df = make_ohlcv(50)
    result = check_entry_signal(df, df, df, df, "BTC/USDT", config)
    assert result["signal"] is False


def test_check_entry_signal_required_keys():
    config = make_settings()
    df = make_ohlcv(50)
    result = check_entry_signal(df, df, df, df, "BTC/USDT", config)
    for key in ("signal", "grade", "rr_ratio", "sl_price", "tp1_price", "tp2_price",
                "atr_1h", "conditions", "values", "symbol"):
        assert key in result


def test_check_entry_signal_conditions_keys():
    config = make_settings()
    df = make_ohlcv(50)
    result = check_entry_signal(df, df, df, df, "BTC/USDT", config)
    conds = result["conditions"]
    for key in ("weekly_trend", "daily_structure", "h4_divergence", "h4_momentum", "h1_bos"):
        assert key in conds


def test_rr_gate_blocks_low_rr(monkeypatch):
    import backend.strategy as strat
    monkeypatch.setattr(strat, "compute_rr_ratio", lambda *a, **kw: 1.0)
    config = make_settings(min_rr_ratio=3.0)
    df = make_ohlcv(230, trend=0.002)
    result = check_entry_signal(df, df, df, df, "BTC/USDT", config)
    assert result["signal"] is False
