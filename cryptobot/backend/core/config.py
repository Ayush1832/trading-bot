from typing import List
from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Exchange — Bybit
    bybit_api_key: str = ""
    bybit_api_secret: str = ""
    sandbox_mode: bool = False

    # Legacy aliases so existing DB-persisted config keys keep working
    mexc_api_key: str = ""
    mexc_api_secret: str = ""

    # ------------------------------------------------------------------ #
    # Multi-symbol watchlist (BTC/ETH/SOL only — swing needs deep liquidity)
    # ------------------------------------------------------------------ #
    symbols: List[str] = ["ETH/USDT", "SOL/USDT", "AVAX/USDT", "LINK/USDT"]
    symbol: str = "ETH/USDT"       # primary display symbol

    # ------------------------------------------------------------------ #
    # Timeframes
    # ------------------------------------------------------------------ #
    tf_weekly: str = "1w"
    tf_daily: str = "1d"
    tf_4h: str = "4h"
    tf_1h: str = "1h"

    # Scan interval: 15 minutes — one new 1H candle every 60 min, no need to check faster
    scan_interval_seconds: int = 900

    # ------------------------------------------------------------------ #
    # Trade sizing
    # ------------------------------------------------------------------ #
    trade_usdt: float = 1.0         # hard cap enforced in bot.py at $1.00
    max_trade_usdt: float = 1.0    # explicit hard cap (same value)

    # ------------------------------------------------------------------ #
    # Strategy — Weekly EMA
    # ------------------------------------------------------------------ #
    weekly_ema_period: int = 200

    # ------------------------------------------------------------------ #
    # Strategy — Daily EMA + Fibonacci
    # ------------------------------------------------------------------ #
    daily_ema_fast: int = 50
    daily_ema_slow: int = 200
    daily_pullback_tolerance: float = 0.015   # 1.5% — within this % of fib level counts as "in zone"

    # ------------------------------------------------------------------ #
    # Strategy — 4H Divergence
    # ------------------------------------------------------------------ #
    div_max_age_candles: int = 8    # how many 4H candles back to look for divergence
    div_min_rsi_level: float = 50.0  # RSI at 2nd low must be below this (oversold confirmation)

    # ------------------------------------------------------------------ #
    # Strategy — 4H Momentum (MACD + volume)
    # ------------------------------------------------------------------ #
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    volume_weak_seller_ratio: float = 0.85   # volume < 85% of 20-bar avg = weak sellers

    # ------------------------------------------------------------------ #
    # Strategy — R:R gate
    # ------------------------------------------------------------------ #
    min_rr_ratio: float = 3.0       # minimum 3:1 reward-to-risk required for entry

    # ------------------------------------------------------------------ #
    # Strategy — Exit levels
    # ------------------------------------------------------------------ #
    atr_1h_multiplier: float = 1.5  # ATR-based TSL distance = atr_1h × this multiplier
    tp1_position_size: float = 0.5  # 50% of position closed at TP1
    max_hold_hours: int = 72        # maximum trade duration (3 days) before TIMEOUT
    max_hold_minutes: int = 4320   # same expressed in minutes (72h × 60)

    # ------------------------------------------------------------------ #
    # Rate limits
    # ------------------------------------------------------------------ #
    max_trades_per_day: int = 1     # swing strategy: one high-quality trade per day
    cooldown_seconds: int = 0      # no cooldown needed — one-trade-per-day rule replaces it
    max_daily_drawdown_pct: float = 0.05

    # ------------------------------------------------------------------ #
    # Entry order
    # ------------------------------------------------------------------ #
    entry_order_timeout_seconds: int = 1800   # cancel limit buy if not filled within 30 min

    # ------------------------------------------------------------------ #
    # Telegram
    # ------------------------------------------------------------------ #
    telegram_token: str = ""
    telegram_chat_id: str = ""
    telegram_bot_commands: bool = False

    # ------------------------------------------------------------------ #
    # API server
    # ------------------------------------------------------------------ #
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Database
    database_url: str = "sqlite+aiosqlite:///./cryptobot.db"

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
