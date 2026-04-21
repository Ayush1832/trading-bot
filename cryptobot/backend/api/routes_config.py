from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from backend.db.database import get_db
from backend.db import crud
from backend.notify import TelegramNotifier

router = APIRouter(prefix="/config", tags=["config"])

_notifier: TelegramNotifier = None


def set_notifier(n: TelegramNotifier):
    global _notifier
    _notifier = n


class ConfigUpdate(BaseModel):
    symbol: Optional[str] = None
    trade_usdt: Optional[float] = None
    trail_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    hard_sl_pct: Optional[float] = None
    max_hold_minutes: Optional[int] = None
    cooldown_seconds: Optional[int] = None
    max_trades_per_hour: Optional[int] = None
    telegram_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    sandbox_mode: Optional[bool] = None


@router.get("")
async def get_config(db: AsyncSession = Depends(get_db)):
    from backend.core.config import settings
    return {
        "symbol": settings.symbol,
        "timeframe": settings.timeframe,
        "trade_usdt": settings.trade_usdt,
        "trail_pct": settings.trail_pct,
        "take_profit_pct": settings.take_profit_pct,
        "hard_sl_pct": settings.hard_sl_pct,
        "max_hold_minutes": settings.max_hold_minutes,
        "cooldown_seconds": settings.cooldown_seconds,
        "max_trades_per_hour": settings.max_trades_per_hour,
        "sandbox_mode": settings.sandbox_mode,
        "telegram_chat_id": settings.telegram_chat_id,
        "telegram_token": "***" if settings.telegram_token else "",
        "mexc_api_key": "***" if settings.mexc_api_key else "",
        "mexc_api_secret": "***" if settings.mexc_api_secret else "",
    }


@router.post("")
async def update_config(update: ConfigUpdate, db: AsyncSession = Depends(get_db)):
    data = {k: v for k, v in update.model_dump().items() if v is not None}
    await crud.bulk_set_config(db, data)
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
