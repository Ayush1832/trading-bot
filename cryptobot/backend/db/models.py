from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Float, Integer, Boolean, DateTime, Date, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from backend.db.database import Base


class Trade(Base):
    __tablename__ = "trades"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20))
    entry_time: Mapped[datetime] = mapped_column(DateTime)
    exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    entry_price: Mapped[float] = mapped_column(Float)
    exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    peak_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    qty: Mapped[float] = mapped_column(Float)
    trade_usdt: Mapped[float] = mapped_column(Float)
    trailing_sl_final: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    trailing_stop_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # alias for self-test compat
    # SL / TP levels (swing strategy: separate hard SL + two TPs)
    hard_sl_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    take_profit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # TP1 (alias)
    tp1_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)           # TP1 explicit
    tp2_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)           # TP2 runner
    trail_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)           # kept for schema compat
    pnl_usdt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pnl_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exit_reason: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="OPEN")
    entry_order_id: Mapped[str] = mapped_column(String(100))
    exit_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    entry_fee: Mapped[float] = mapped_column(Float, default=0.0)
    exit_fee: Mapped[float] = mapped_column(Float, default=0.0)
    tsl_update_count: Mapped[int] = mapped_column(Integer, default=0)
    tsl_order_updates: Mapped[int] = mapped_column(Integer, default=0)   # alias for self-test compat
    exchange_orders_active: Mapped[bool] = mapped_column(Boolean, default=False)
    # Active exchange order tracking (current live TP and SL order IDs)
    tp_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sl_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_backtest: Mapped[bool] = mapped_column(Boolean, default=False)

    # ------------------------------------------------------------------ #
    # Swing strategy — entry snapshot
    # ------------------------------------------------------------------ #
    rr_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String(3), nullable=True)          # A+ / A / B
    entry_divergence_strength: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_nearest_fib: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    entry_1h_atr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ------------------------------------------------------------------ #
    # Swing strategy — split exit tracking
    # ------------------------------------------------------------------ #
    half_exited: Mapped[bool] = mapped_column(Boolean, default=False)
    tp1_exit_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tp1_exit_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    tp1_pnl_usdt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    tp1_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tp2_order_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    breakeven_sl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Combined P&L (sum of TP1 partial + final exit)
    total_pnl_usdt: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_pnl_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Legacy scalping columns (kept for DB compatibility, NULL for swing trades)
    signal_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    entry_rsi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_ema20: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_ema50: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_adx: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_atr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    entry_volume_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "entry_time": self.entry_time.isoformat() if self.entry_time else None,
            "exit_time": self.exit_time.isoformat() if self.exit_time else None,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "peak_price": self.peak_price,
            "qty": self.qty,
            "trade_usdt": self.trade_usdt,
            "trailing_sl_final": self.trailing_sl_final,
            "hard_sl_price": self.hard_sl_price,
            "take_profit_price": self.take_profit_price,
            "tp2_price": self.tp2_price,
            "trail_pct": self.trail_pct,
            "pnl_usdt": self.pnl_usdt,
            "pnl_pct": self.pnl_pct,
            "exit_reason": self.exit_reason,
            "status": self.status,
            "entry_order_id": self.entry_order_id,
            "exit_order_id": self.exit_order_id,
            "entry_fee": self.entry_fee,
            "exit_fee": self.exit_fee,
            "tsl_update_count": self.tsl_update_count,
            "is_backtest": self.is_backtest,
            # Swing
            "rr_ratio": self.rr_ratio,
            "grade": self.grade,
            "entry_divergence_strength": self.entry_divergence_strength,
            "entry_nearest_fib": self.entry_nearest_fib,
            "entry_1h_atr": self.entry_1h_atr,
            "half_exited": self.half_exited,
            "tp1_exit_price": self.tp1_exit_price,
            "tp1_exit_time": self.tp1_exit_time.isoformat() if self.tp1_exit_time else None,
            "tp1_pnl_usdt": self.tp1_pnl_usdt,
            "tp1_order_id": self.tp1_order_id,
            "tp2_order_id": self.tp2_order_id,
            "breakeven_sl": self.breakeven_sl,
            "total_pnl_usdt": self.total_pnl_usdt,
            "total_pnl_pct": self.total_pnl_pct,
        }


class DailyStats(Base):
    __tablename__ = "daily_stats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[date] = mapped_column(Date, unique=True)
    total_trades: Mapped[int] = mapped_column(Integer, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, default=0)
    pnl_usdt: Mapped[float] = mapped_column(Float, default=0.0)
    pnl_pct: Mapped[float] = mapped_column(Float, default=0.0)
    best_trade_pct: Mapped[float] = mapped_column(Float, default=0.0)
    worst_trade_pct: Mapped[float] = mapped_column(Float, default=0.0)
    avg_hold_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    starting_balance: Mapped[float] = mapped_column(Float, default=10.0)
    ending_balance: Mapped[float] = mapped_column(Float, default=10.0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "total_trades": self.total_trades,
            "winning_trades": self.winning_trades,
            "losing_trades": self.losing_trades,
            "pnl_usdt": self.pnl_usdt,
            "pnl_pct": self.pnl_pct,
            "best_trade_pct": self.best_trade_pct,
            "worst_trade_pct": self.worst_trade_pct,
            "avg_hold_minutes": self.avg_hold_minutes,
            "starting_balance": self.starting_balance,
            "ending_balance": self.ending_balance,
        }


class BotLog(Base):
    __tablename__ = "bot_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    level: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(Text)
    trade_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("trades.id"), nullable=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "level": self.level,
            "message": self.message,
            "trade_id": self.trade_id,
        }


class Config(Base):
    __tablename__ = "config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
