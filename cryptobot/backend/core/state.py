import threading
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class BotState:
    running: bool = False
    dry_run: bool = False
    trade_open: bool = False
    last_trade_time: float = 0.0
    trades_this_hour: list = field(default_factory=list)

    # Open trade info
    entry_price: Optional[float] = None
    entry_time: Optional[float] = None
    entry_order_id: Optional[str] = None
    peak_price: Optional[float] = None
    trailing_sl: Optional[float] = None
    take_profit_price: Optional[float] = None
    hard_sl_price: Optional[float] = None
    trade_qty: Optional[float] = None
    current_price: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None
    open_trade_id: Optional[int] = None

    # Last candle indicators
    last_ema50: Optional[float] = None
    last_rsi: Optional[float] = None
    last_bb_low: Optional[float] = None
    last_bb_high: Optional[float] = None
    last_volume_ratio: Optional[float] = None

    # Session stats
    session_trades: int = 0
    session_wins: int = 0
    session_pnl_usdt: float = 0.0

    _lock: threading.Lock = field(default_factory=threading.Lock)

    def to_dict(self) -> dict:
        return {
            "running": self.running,
            "dry_run": self.dry_run,
            "trade_open": self.trade_open,
            "entry_price": self.entry_price,
            "entry_time": self.entry_time,
            "peak_price": self.peak_price,
            "trailing_sl": self.trailing_sl,
            "take_profit_price": self.take_profit_price,
            "hard_sl_price": self.hard_sl_price,
            "trade_qty": self.trade_qty,
            "current_price": self.current_price,
            "unrealized_pnl_pct": self.unrealized_pnl_pct,
            "last_ema50": self.last_ema50,
            "last_rsi": self.last_rsi,
            "last_bb_low": self.last_bb_low,
            "last_bb_high": self.last_bb_high,
            "last_volume_ratio": self.last_volume_ratio,
            "session_trades": self.session_trades,
            "session_wins": self.session_wins,
            "session_pnl_usdt": self.session_pnl_usdt,
        }


# Singleton bot state
bot_state = BotState()
