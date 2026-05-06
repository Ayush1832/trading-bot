"""
Paper Trading Simulator
-----------------------
When DRY_RUN mode is active, this module replaces all real exchange
order calls with simulated fills. It maintains its own balance,
trade history, and P&L — completely isolated from real funds.

Starting paper balance: $10 USDT (configurable via PAPER_BALANCE env var).
"""

import time
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

PAPER_FEE_RATE = 0.001  # 0.1% per trade (MEXC standard)


@dataclass
class PaperTrade:
    id: int
    symbol: str
    entry_price: float
    qty: float
    trade_usdt: float
    take_profit_price: float
    hard_sl_price: float
    trail_pct: float
    entry_time: float
    peak_price: float
    trailing_sl: float
    entry_fee: float

    exit_price: Optional[float] = None
    exit_time: Optional[float] = None
    exit_reason: Optional[str] = None
    pnl_usdt: Optional[float] = None
    pnl_pct: Optional[float] = None
    tsl_update_count: int = 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "peak_price": self.peak_price,
            "qty": self.qty,
            "trade_usdt": self.trade_usdt,
            "pnl_usdt": self.pnl_usdt,
            "pnl_pct": self.pnl_pct,
            "exit_reason": self.exit_reason,
            "entry_time": datetime.fromtimestamp(self.entry_time, tz=timezone.utc).isoformat() if self.entry_time else None,
            "exit_time": datetime.fromtimestamp(self.exit_time, tz=timezone.utc).isoformat() if self.exit_time else None,
            "tsl_update_count": self.tsl_update_count,
            "trailing_sl": self.trailing_sl,
            "take_profit_price": self.take_profit_price,
            "hard_sl_price": self.hard_sl_price,
        }


class PaperTrader:
    """
    Simulates exchange order execution for risk-free strategy testing.
    All data is in-memory and reset on restart.
    """

    def __init__(self, starting_balance: float = 10.0):
        self.starting_balance = starting_balance
        self.balance = starting_balance
        self.trades: list[PaperTrade] = []
        self._next_id = 1
        logger.info(f"[PAPER] Paper trader initialized. Balance: ${starting_balance:.2f}")

    # ------------------------------------------------------------------ #
    # Order simulation
    # ------------------------------------------------------------------ #

    def simulate_limit_buy(self, symbol: str, qty: float, price: float) -> dict:
        """Simulate instant fill at requested price (best-case for paper trading)."""
        cost = qty * price
        fee = cost * PAPER_FEE_RATE
        if cost + fee > self.balance:
            raise ValueError(f"Insufficient paper balance (${self.balance:.4f}) for order (${cost:.4f})")
        self.balance -= fee
        order_id = f"PAPER-BUY-{self._next_id}"
        self._next_id += 1
        logger.info(f"[PAPER] Simulated buy: {qty:.8f} {symbol} @ ${price:.2f} | fee=${fee:.4f} | balance=${self.balance:.4f}")
        return {"id": order_id, "status": "closed", "average": price, "price": price, "amount": qty, "filled": qty}

    def simulate_market_sell(self, symbol: str, qty: float, current_price: float) -> dict:
        """Simulate market sell at current price."""
        proceeds = qty * current_price
        fee = proceeds * PAPER_FEE_RATE
        self.balance += proceeds - fee
        order_id = f"PAPER-SELL-{self._next_id}"
        self._next_id += 1
        logger.info(f"[PAPER] Simulated sell: {qty:.8f} {symbol} @ ${current_price:.2f} | proceeds=${proceeds:.4f} | fee=${fee:.4f} | balance=${self.balance:.4f}")
        return {"id": order_id, "status": "closed", "average": current_price, "price": current_price, "amount": qty, "filled": qty}

    # ------------------------------------------------------------------ #
    # Trade tracking
    # ------------------------------------------------------------------ #

    def open_trade(
        self,
        symbol: str,
        qty: float,
        entry_price: float,
        trade_usdt: float,
        take_profit_price: float,
        hard_sl_price: float,
        trail_pct: float,
        trailing_sl: float,
    ) -> PaperTrade:
        fee = trade_usdt * PAPER_FEE_RATE
        trade = PaperTrade(
            id=self._next_id,
            symbol=symbol,
            entry_price=entry_price,
            qty=qty,
            trade_usdt=trade_usdt,
            take_profit_price=take_profit_price,
            hard_sl_price=hard_sl_price,
            trail_pct=trail_pct,
            entry_time=time.time(),
            peak_price=entry_price,
            trailing_sl=trailing_sl,
            entry_fee=fee,
        )
        self._next_id += 1
        self.trades.append(trade)
        return trade

    def close_trade(self, trade: PaperTrade, exit_price: float, exit_reason: str) -> PaperTrade:
        exit_fee = trade.qty * exit_price * PAPER_FEE_RATE
        pnl_usdt = (exit_price - trade.entry_price) * trade.qty - exit_fee - trade.entry_fee
        pnl_pct = (exit_price - trade.entry_price) / trade.entry_price * 100

        trade.exit_price = exit_price
        trade.exit_time = time.time()
        trade.exit_reason = exit_reason
        trade.pnl_usdt = pnl_usdt
        trade.pnl_pct = pnl_pct
        self.balance += trade.trade_usdt + pnl_usdt  # return principal + profit

        logger.info(
            f"[PAPER] Trade closed: {exit_reason} | exit=${exit_price:.2f} | "
            f"pnl={pnl_usdt:+.4f} USDT ({pnl_pct:+.2f}%) | balance=${self.balance:.4f}"
        )
        return trade

    # ------------------------------------------------------------------ #
    # Stats helpers
    # ------------------------------------------------------------------ #

    def get_stats(self) -> dict:
        closed = [t for t in self.trades if t.pnl_usdt is not None]
        wins = [t for t in closed if t.pnl_usdt > 0]
        total_pnl = sum(t.pnl_usdt for t in closed)
        return {
            "mode": "PAPER",
            "starting_balance": self.starting_balance,
            "current_balance": round(self.balance, 6),
            "total_pnl_usdt": round(total_pnl, 6),
            "total_pnl_pct": round(total_pnl / self.starting_balance * 100, 3),
            "total_trades": len(closed),
            "winning_trades": len(wins),
            "win_rate": round(len(wins) / len(closed), 3) if closed else 0.0,
        }

    def get_recent_trades(self, limit: int = 50) -> list[dict]:
        closed = [t for t in self.trades if t.pnl_usdt is not None]
        return [t.to_dict() for t in reversed(closed[-limit:])]

    def reset(self):
        self.balance = self.starting_balance
        self.trades.clear()
        self._next_id = 1
        logger.info(f"[PAPER] Paper trader reset. Balance: ${self.starting_balance:.2f}")


# Singleton used by the bot loop and API routes
paper_trader = PaperTrader(starting_balance=10.0)
