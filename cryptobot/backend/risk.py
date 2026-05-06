import time
import math
from typing import Tuple, Optional

MAX_TRADE_USDT = 1.0  # Hard cap — never exceeded regardless of config


def calculate_position_qty(usdt_amount: float, price: float, min_qty: float) -> float:
    """
    Calculate how many units to buy. Never exceeds min(usdt_amount, 1.0) / price.
    Rounds down to 8 decimal places (safe for most crypto pairs).
    """
    capped = min(usdt_amount, MAX_TRADE_USDT)
    raw_qty = capped / price
    qty = math.floor(raw_qty * 1e8) / 1e8
    if qty < min_qty:
        return 0.0
    return qty


def calculate_qty(
    usdt_amount: float,
    price: float,
    min_qty: float,
    qty_precision: int = 8,
) -> float:
    """
    Alias for calculate_position_qty with qty_precision support.
    Hard cap: usdt_amount is clamped to MAX_TRADE_USDT ($1.00).
    """
    capped = min(usdt_amount, MAX_TRADE_USDT)
    raw_qty = capped / price
    factor = 10 ** qty_precision
    qty = math.floor(raw_qty * factor) / factor
    if qty < min_qty:
        return 0.0
    return qty


def check_trade_allowed(state, config) -> Tuple[bool, str]:
    """
    Returns (allowed, reason).
    Checks: no open trade, one-trade-per-day gate, daily drawdown halt.
    """
    if getattr(state, "trade_open", False):
        return False, "trade already open — cannot enter new position"

    if getattr(state, "trade_opened_today", False):
        return False, "one trade already taken today — next entry tomorrow UTC"

    if getattr(state, "daily_halted", False):
        return False, "daily drawdown limit reached — bot halted for today"

    return True, "OK"


def check_rate_limits(
    trades_this_hour: list,
    max_per_hour: int,
    last_trade_time: float,
    cooldown_sec: int,
) -> Tuple[bool, str]:
    """
    Returns (allowed: bool, reason: str).
    Cleans up trades_this_hour in place (removes entries older than 60 min).
    """
    now = time.time()
    cutoff = now - 3600
    trades_this_hour[:] = [t for t in trades_this_hour if t > cutoff]

    if last_trade_time > 0 and (now - last_trade_time) < cooldown_sec:
        remaining = int(cooldown_sec - (now - last_trade_time))
        return False, f"Cooldown active — {remaining}s remaining"

    if len(trades_this_hour) >= max_per_hour:
        return False, f"Rate limit reached — {max_per_hour} trades this hour"

    return True, "OK"


def check_daily_drawdown(state_or_pnl, config_or_balance=None, max_drawdown_pct: float = 0.05) -> bool:
    """
    Return True if today's loss exceeds the drawdown limit.

    Supports two call signatures:
      check_daily_drawdown(state, config)           — new style
      check_daily_drawdown(daily_pnl_usdt, starting_balance, max_drawdown_pct)  — old style
    """
    # New-style: check_daily_drawdown(state, config)
    if hasattr(state_or_pnl, "pnl_today_usdt") or hasattr(state_or_pnl, "day_start_balance"):
        state = state_or_pnl
        config = config_or_balance
        daily_pnl = getattr(state, "pnl_today_usdt", 0.0)
        starting = getattr(state, "day_start_balance", getattr(state, "usdt_balance", 10.0))
        max_dd = getattr(config, "max_daily_drawdown_pct", 0.05)
    else:
        # Old-style: check_daily_drawdown(daily_pnl_usdt, starting_balance, max_drawdown_pct)
        daily_pnl = float(state_or_pnl)
        starting = float(config_or_balance) if config_or_balance is not None else 10.0
        max_dd = max_drawdown_pct

    if starting <= 0:
        return False
    loss_pct = (-daily_pnl) / starting
    return loss_pct >= max_dd
