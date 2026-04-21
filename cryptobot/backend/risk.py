import time
import math
from typing import Tuple


def calculate_position_qty(usdt_amount: float, price: float, min_qty: float) -> float:
    """
    Calculate how many units to buy. Never exceeds usdt_amount / price.
    Rounds down to 8 decimal places (safe for most crypto pairs).
    """
    raw_qty = usdt_amount / price
    # Round down to 8 decimal places
    qty = math.floor(raw_qty * 1e8) / 1e8
    if qty < min_qty:
        return 0.0
    return qty


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


def check_daily_drawdown(
    daily_pnl_usdt: float, starting_balance: float, max_drawdown_pct: float
) -> bool:
    """
    Return True if today's loss exceeds max_drawdown_pct of starting_balance.
    If True, bot should halt for the day.
    """
    if starting_balance <= 0:
        return False
    loss_pct = (-daily_pnl_usdt) / starting_balance
    return loss_pct >= max_drawdown_pct
