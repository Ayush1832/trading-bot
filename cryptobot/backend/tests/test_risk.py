import time
import pytest

from backend.risk import calculate_position_qty, check_rate_limits, check_daily_drawdown


def test_calculate_position_qty_basic():
    qty = calculate_position_qty(1.0, 50000.0, 0.000001)
    assert qty == pytest.approx(1.0 / 50000.0, rel=1e-6)


def test_calculate_position_qty_min_enforced():
    qty = calculate_position_qty(1.0, 50000.0, min_qty=1.0)
    assert qty == 0.0  # too small


def test_calculate_position_qty_rounds_down():
    qty = calculate_position_qty(1.0, 3.0, 0.0)
    # 1/3 = 0.333... → floor to 8dp = 0.33333333
    assert qty == pytest.approx(0.33333333)


def test_check_rate_limits_ok():
    allowed, reason = check_rate_limits([], 6, 0.0, 120)
    assert allowed is True


def test_check_rate_limits_cooldown():
    allowed, reason = check_rate_limits([], 6, time.time() - 10, 120)
    assert allowed is False
    assert "Cooldown" in reason


def test_check_rate_limits_hourly_cap():
    now = time.time()
    trades = [now - i * 60 for i in range(6)]
    allowed, reason = check_rate_limits(trades, 6, now - 200, 120)
    assert allowed is False
    assert "Rate limit" in reason


def test_check_rate_limits_cleans_old():
    trades = [time.time() - 4000]  # older than 60 min
    allowed, reason = check_rate_limits(trades, 6, 0.0, 0)
    assert allowed is True
    assert len(trades) == 0  # cleaned up


def test_check_daily_drawdown_not_hit():
    assert check_daily_drawdown(-0.3, 10.0, 0.05) is False


def test_check_daily_drawdown_hit():
    assert check_daily_drawdown(-0.6, 10.0, 0.05) is True


def test_check_daily_drawdown_zero_balance():
    assert check_daily_drawdown(-1.0, 0.0, 0.05) is False
