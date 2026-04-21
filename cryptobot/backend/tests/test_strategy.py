import numpy as np
import pandas as pd
import pytest

from backend.strategy import compute_indicators, check_entry_signal, compute_tsl, check_exit


def make_df(n=100, base_price=100.0, trend="up"):
    """Build synthetic OHLCV DataFrame."""
    prices = []
    for i in range(n):
        if trend == "up":
            close = base_price + i * 0.1
        else:
            close = base_price - i * 0.1
        prices.append(close)

    data = {
        "ts": pd.date_range("2024-01-01", periods=n, freq="1min"),
        "open": [p - 0.05 for p in prices],
        "high": [p + 0.1 for p in prices],
        "low": [p - 0.1 for p in prices],
        "close": prices,
        "volume": [1000.0] * n,
    }
    return pd.DataFrame(data)


def test_compute_indicators_columns():
    df = make_df(100)
    result = compute_indicators(df)
    assert "ema50" in result.columns
    assert "rsi14" in result.columns
    assert "bb_low" in result.columns
    assert "bb_high" in result.columns
    assert "vol_ratio" in result.columns


def test_compute_indicators_length_preserved():
    df = make_df(80)
    result = compute_indicators(df)
    assert len(result) == 80


def test_check_entry_signal_no_signal_insufficient_data():
    df = make_df(30)
    df = compute_indicators(df)
    result = check_entry_signal(df)
    assert result["signal"] is False


def test_check_entry_signal_structure():
    df = make_df(100)
    df = compute_indicators(df)
    result = check_entry_signal(df)
    assert "signal" in result
    assert "reasons" in result
    assert "values" in result
    assert "trend_ok" in result["reasons"]
    assert "rsi_ok" in result["reasons"]
    assert "bb_ok" in result["reasons"]
    assert "volume_ok" in result["reasons"]


def test_compute_tsl():
    assert compute_tsl(100.0, 0.008) == pytest.approx(99.2)
    assert compute_tsl(50000.0, 0.008) == pytest.approx(49600.0)


def test_check_exit_take_profit():
    import time
    result = check_exit(
        current_price=101.3,
        entry_price=100.0,
        peak_price=101.3,
        trailing_sl=99.2,
        take_profit_pct=0.012,
        hard_sl_pct=0.008,
        entry_time=time.time() - 60,
        max_hold_minutes=30,
    )
    assert result == "TAKE_PROFIT"


def test_check_exit_trailing_sl():
    import time
    result = check_exit(
        current_price=98.0,
        entry_price=100.0,
        peak_price=101.0,
        trailing_sl=99.192,
        take_profit_pct=0.012,
        hard_sl_pct=0.008,
        entry_time=time.time() - 60,
        max_hold_minutes=30,
    )
    assert result == "TRAILING_SL"


def test_check_exit_hard_sl():
    import time
    result = check_exit(
        current_price=99.1,
        entry_price=100.0,
        peak_price=100.0,
        trailing_sl=99.2,
        take_profit_pct=0.012,
        hard_sl_pct=0.008,
        entry_time=time.time() - 60,
        max_hold_minutes=30,
    )
    assert result in ("HARD_SL", "TRAILING_SL")


def test_check_exit_timeout():
    import time
    result = check_exit(
        current_price=100.5,
        entry_price=100.0,
        peak_price=100.5,
        trailing_sl=99.2,
        take_profit_pct=0.012,
        hard_sl_pct=0.008,
        entry_time=time.time() - 1900,
        max_hold_minutes=30,
    )
    assert result == "TIMEOUT"


def test_check_exit_none():
    import time
    result = check_exit(
        current_price=100.5,
        entry_price=100.0,
        peak_price=100.5,
        trailing_sl=99.2,
        take_profit_pct=0.012,
        hard_sl_pct=0.008,
        entry_time=time.time() - 60,
        max_hold_minutes=30,
    )
    assert result is None
