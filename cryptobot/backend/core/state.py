import threading
import time
from dataclasses import dataclass, field
from typing import Optional, Dict


@dataclass
class SymbolScanState:
    """Live swing scan result for one symbol — shown in the scanner panel."""
    symbol: str
    # Overall signal
    signal: bool = False
    grade: Optional[str] = None    # A+ / A / B / None
    rr_ratio: float = 0.0
    # Condition results (5 conditions)
    weekly_ok: bool = False
    daily_ok: bool = False
    h4_div_ok: bool = False
    h4_mom_ok: bool = False        # always True — grade only
    h1_bos_ok: bool = False
    # Key values for display
    price: Optional[float] = None
    rsi_at_low: Optional[float] = None
    fib_zone: Optional[str] = None
    nearest_fib: Optional[str] = None
    bos_level: Optional[float] = None
    divergence_strength: float = 0.0
    weekly_ema200: Optional[float] = None
    atr_1h: Optional[float] = None
    # Computed levels (only populated when signal=True)
    sl_price: Optional[float] = None
    tp1_price: Optional[float] = None
    tp2_price: Optional[float] = None
    # Raw condition dicts for dashboard drill-down
    conditions: dict = field(default_factory=dict)
    last_updated: float = 0.0

    def to_dict(self) -> dict:
        return {
            "symbol": self.symbol,
            "signal": self.signal,
            "grade": self.grade,
            "rr_ratio": self.rr_ratio,
            "weekly_ok": self.weekly_ok,
            "daily_ok": self.daily_ok,
            "h4_div_ok": self.h4_div_ok,
            "h4_mom_ok": self.h4_mom_ok,
            "h1_bos_ok": self.h1_bos_ok,
            "price": self.price,
            "rsi_at_low": self.rsi_at_low,
            "fib_zone": self.fib_zone,
            "nearest_fib": self.nearest_fib,
            "bos_level": self.bos_level,
            "divergence_strength": self.divergence_strength,
            "weekly_ema200": self.weekly_ema200,
            "atr_1h": self.atr_1h,
            "sl_price": self.sl_price,
            "tp1_price": self.tp1_price,
            "tp2_price": self.tp2_price,
            "conditions": self.conditions,
            "last_updated": self.last_updated,
        }


@dataclass
class BotState:
    running: bool = False
    dry_run: bool = False
    trade_open: bool = False
    last_trade_time: float = 0.0

    # ------------------------------------------------------------------ #
    # 1-trade-per-day gate
    # ------------------------------------------------------------------ #
    trade_opened_today: bool = False

    # ------------------------------------------------------------------ #
    # Weekly candle cache (avoids re-fetching 200+ weekly candles every 15 min)
    # {symbol: last_weekly_close_timestamp}
    # ------------------------------------------------------------------ #
    weekly_cache_ts: Dict[str, float] = field(default_factory=dict)

    # ------------------------------------------------------------------ #
    # Open trade info — standard fields
    # ------------------------------------------------------------------ #
    current_symbol: Optional[str] = None
    entry_price: Optional[float] = None
    entry_time: Optional[float] = None
    entry_order_id: Optional[str] = None
    current_price: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None
    open_trade_id: Optional[int] = None

    # ------------------------------------------------------------------ #
    # Open trade info — swing-specific fields
    # ------------------------------------------------------------------ #
    qty_total: Optional[float] = None        # total quantity entered
    qty_remaining: Optional[float] = None   # after TP1 partial exit, reduced by 50%
    half_exited: bool = False               # True after TP1_PARTIAL fires
    peak_price: Optional[float] = None
    trailing_sl: Optional[float] = None
    sl_price: Optional[float] = None        # hard SL (moves to breakeven after TP1)
    tp1_price: Optional[float] = None
    tp2_price: Optional[float] = None
    atr_1h: Optional[float] = None          # 1H ATR at entry — used for TSL sizing
    rr_ratio: Optional[float] = None
    grade: Optional[str] = None             # A+ / A / B
    tp1_order_id: Optional[str] = None
    tp2_order_id: Optional[str] = None
    tp1_exit_price: Optional[float] = None  # filled after TP1 partial
    tp1_pnl_usdt: Optional[float] = None

    # ------------------------------------------------------------------ #
    # Balance tracking
    # ------------------------------------------------------------------ #
    usdt_balance: float = 0.0
    day_start_balance: float = 0.0      # balance at start of day (for drawdown calc)
    trailing_stop_price: Optional[float] = None  # alias for trailing_sl (self-test compat)
    current_trade: Optional[dict] = None         # snapshot of open trade dict

    # ------------------------------------------------------------------ #
    # Multi-symbol scanner state
    # ------------------------------------------------------------------ #
    scanner: Dict[str, SymbolScanState] = field(default_factory=dict)

    # ------------------------------------------------------------------ #
    # Session stats
    # ------------------------------------------------------------------ #
    session_trades: int = 0
    session_wins: int = 0
    session_pnl_usdt: float = 0.0

    # ------------------------------------------------------------------ #
    # Daily counters (reset at 00:00 UTC by scheduler)
    # ------------------------------------------------------------------ #
    trades_today: int = 0
    wins_today: int = 0
    losses_today: int = 0
    pnl_today_usdt: float = 0.0
    signals_today: int = 0           # full signals found
    daily_halted: bool = False        # True when max daily drawdown hit

    _lock: threading.Lock = field(default_factory=threading.Lock)

    def update_scanner(self, symbol: str, signal_result: dict):
        """Update scanner state for a single symbol from check_entry_signal result."""
        if symbol not in self.scanner:
            self.scanner[symbol] = SymbolScanState(symbol=symbol)
        s = self.scanner[symbol]
        s.signal = signal_result.get("signal", False)
        s.grade = signal_result.get("grade")
        s.rr_ratio = signal_result.get("rr_ratio", 0.0)

        conds = signal_result.get("conditions", {})
        s.weekly_ok = conds.get("weekly_trend", {}).get("ok", False)
        s.daily_ok = conds.get("daily_structure", {}).get("ok", False)
        s.h4_div_ok = conds.get("h4_divergence", {}).get("ok", False)
        s.h4_mom_ok = True  # momentum is advisory only
        s.h1_bos_ok = conds.get("h1_bos", {}).get("ok", False)

        vals = signal_result.get("values", {})
        s.price = vals.get("entry_price")
        s.rsi_at_low = vals.get("rsi_at_low")
        s.fib_zone = vals.get("fib_zone")
        s.nearest_fib = vals.get("nearest_fib")
        s.bos_level = vals.get("bos_level")
        s.divergence_strength = vals.get("divergence_strength", 0.0)
        s.weekly_ema200 = vals.get("weekly_ema200")
        s.atr_1h = vals.get("atr_1h")
        s.sl_price = signal_result.get("sl_price")
        s.tp1_price = signal_result.get("tp1_price")
        s.tp2_price = signal_result.get("tp2_price")
        s.conditions = conds
        s.last_updated = time.time()

    def reset_daily(self):
        """Reset all daily counters. Called by scheduler at 00:00 UTC."""
        self.trades_today = 0
        self.wins_today = 0
        self.losses_today = 0
        self.pnl_today_usdt = 0.0
        self.signals_today = 0
        self.daily_halted = False
        self.trade_opened_today = False

    def to_dict(self) -> dict:
        from backend.core.config import settings
        return {
            "running": self.running,
            "dry_run": self.dry_run,
            "sandbox_mode": settings.sandbox_mode,
            "trade_open": self.trade_open,
            "trade_opened_today": self.trade_opened_today,
            "current_symbol": self.current_symbol,
            "entry_price": self.entry_price,
            "entry_time": self.entry_time,
            "current_price": self.current_price,
            "unrealized_pnl_pct": self.unrealized_pnl_pct,
            "peak_price": self.peak_price,
            "trailing_sl": self.trailing_sl,
            "sl_price": self.sl_price,
            "tp1_price": self.tp1_price,
            "tp2_price": self.tp2_price,
            "atr_1h": self.atr_1h,
            "rr_ratio": self.rr_ratio,
            "grade": self.grade,
            "qty_total": self.qty_total,
            "qty_remaining": self.qty_remaining,
            "half_exited": self.half_exited,
            "tp1_exit_price": self.tp1_exit_price,
            "tp1_pnl_usdt": self.tp1_pnl_usdt,
            "usdt_balance": self.usdt_balance,
            "session_trades": self.session_trades,
            "session_wins": self.session_wins,
            "session_pnl_usdt": self.session_pnl_usdt,
            "trades_today": self.trades_today,
            "wins_today": self.wins_today,
            "losses_today": self.losses_today,
            "pnl_today_usdt": self.pnl_today_usdt,
            "signals_today": self.signals_today,
            "daily_halted": self.daily_halted,
            "scanner": {sym: s.to_dict() for sym, s in self.scanner.items()},
        }


# Singleton
bot_state = BotState()
