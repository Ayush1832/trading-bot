from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Exchange
    mexc_api_key: str = ""
    mexc_api_secret: str = ""
    sandbox_mode: bool = False

    # Trading
    symbol: str = "BTC/USDT"
    timeframe: str = "1m"
    trade_usdt: float = 1.0

    # Strategy
    ema_period: int = 50
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    bb_period: int = 20
    bb_std: float = 2.0
    volume_multiplier: float = 1.5

    # Risk / exits
    trail_pct: float = 0.008
    take_profit_pct: float = 0.012
    hard_sl_pct: float = 0.008
    max_hold_minutes: int = 30

    # Rate limits
    cooldown_seconds: int = 120
    max_trades_per_hour: int = 6
    max_daily_drawdown_pct: float = 0.05

    # Telegram
    telegram_token: str = ""
    telegram_chat_id: str = ""
    telegram_bot_commands: bool = False

    # API server
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Database
    database_url: str = "sqlite+aiosqlite:///./cryptobot.db"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
