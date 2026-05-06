from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from backend.db.database import get_db
from backend.db import crud
from backend.notify import TelegramNotifier

router = APIRouter(prefix="/config", tags=["config"])

_notifier: TelegramNotifier = None


def set_notifier(n: TelegramNotifier):
    global _notifier
    _notifier = n


class ConfigUpdate(BaseModel):
    # Exchange — Bybit
    bybit_api_key: Optional[str] = None
    bybit_api_secret: Optional[str] = None
    sandbox_mode: Optional[bool] = None

    # Watchlist
    symbols: Optional[str] = None
    symbol: Optional[str] = None

    # Trade sizing
    trade_usdt: Optional[float] = None

    # Swing — R:R and TSL
    min_rr_ratio: Optional[float] = None
    atr_1h_multiplier: Optional[float] = None
    tp1_position_size: Optional[float] = None

    # Swing — divergence detection
    div_max_age_candles: Optional[int] = None
    div_min_rsi_level: Optional[float] = None

    # Swing — volume / MACD
    volume_weak_seller_ratio: Optional[float] = None

    # Swing — Fibonacci zone tolerance
    daily_pullback_tolerance: Optional[float] = None

    # Hold time
    max_hold_hours: Optional[int] = None

    # Limits
    max_trades_per_day: Optional[int] = None

    # Telegram
    telegram_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None


def _db_bool(val, default: bool) -> bool:
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ("true", "1", "yes")
    return default


def _db_float(val, default: float) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _db_int(val, default: int) -> int:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return default


def _apply_to_settings(data: dict):
    """Push saved config values back into the in-memory settings singleton."""
    from backend.core.config import settings
    for key, value in data.items():
        if hasattr(settings, key):
            if key == "symbols" and isinstance(value, str):
                setattr(settings, key, [s.strip() for s in value.split(",") if s.strip()])
            else:
                try:
                    setattr(settings, key, value)
                except Exception:
                    pass


@router.get("")
async def get_config(db: AsyncSession = Depends(get_db)):
    from backend.core.config import settings

    overrides = await crud.get_config(db)
    symbols = overrides.get("symbols", ",".join(settings.symbols))

    return {
        # Exchange — Bybit
        "bybit_api_key": "***" if (settings.bybit_api_key or settings.mexc_api_key) else "",
        "bybit_api_secret": "***" if (settings.bybit_api_secret or settings.mexc_api_secret) else "",
        "sandbox_mode": _db_bool(overrides.get("sandbox_mode"), settings.sandbox_mode),

        # Watchlist
        "symbols": symbols,
        "symbol": settings.symbol,

        # Trade sizing
        "trade_usdt": _db_float(overrides.get("trade_usdt"), settings.trade_usdt),

        # Swing — R:R and TSL
        "min_rr_ratio":       _db_float(overrides.get("min_rr_ratio"),       settings.min_rr_ratio),
        "atr_1h_multiplier":  _db_float(overrides.get("atr_1h_multiplier"),  settings.atr_1h_multiplier),
        "tp1_position_size":  _db_float(overrides.get("tp1_position_size"),  settings.tp1_position_size),

        # Swing — divergence
        "div_max_age_candles": _db_int(overrides.get("div_max_age_candles"), settings.div_max_age_candles),
        "div_min_rsi_level":   _db_float(overrides.get("div_min_rsi_level"), settings.div_min_rsi_level),

        # Swing — volume
        "volume_weak_seller_ratio": _db_float(overrides.get("volume_weak_seller_ratio"), settings.volume_weak_seller_ratio),

        # Swing — Fibonacci
        "daily_pullback_tolerance": _db_float(overrides.get("daily_pullback_tolerance"), settings.daily_pullback_tolerance),

        # Hold + limits
        "max_hold_hours":    _db_int(overrides.get("max_hold_hours"),    settings.max_hold_hours),
        "max_trades_per_day": _db_int(overrides.get("max_trades_per_day"), settings.max_trades_per_day),

        # Telegram
        "telegram_token": "***" if settings.telegram_token else "",
        "telegram_chat_id": overrides.get("telegram_chat_id") or settings.telegram_chat_id,

        # Timeframes (read-only display)
        "tf_weekly": settings.tf_weekly,
        "tf_daily": settings.tf_daily,
        "tf_4h": settings.tf_4h,
        "tf_1h": settings.tf_1h,
        "scan_interval_seconds": settings.scan_interval_seconds,
    }


@router.post("")
async def update_config(update: ConfigUpdate, db: AsyncSession = Depends(get_db)):
    raw = update.model_dump()

    data = {}
    for k, v in raw.items():
        if v is None:
            continue
        if isinstance(v, str) and v == "***":
            continue
        data[k] = v

    if not data:
        return {"message": "Nothing to update", "updated": []}

    await crud.bulk_set_config(db, {k: str(v) for k, v in data.items()})
    _apply_to_settings(data)

    return {"message": "Config updated", "updated": list(data.keys())}


@router.post("/test-telegram")
async def test_telegram():
    if _notifier is None:
        return {"success": False, "error": "Notifier not initialized"}
    try:
        await _notifier.send_test_message()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}
