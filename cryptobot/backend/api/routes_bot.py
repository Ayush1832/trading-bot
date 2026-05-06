import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.core.state import bot_state
from backend.core.config import settings
from backend.db.database import AsyncSessionLocal
from backend.exchange import MexcExchange
from backend.notify import TelegramNotifier
from backend.bot import bot_loop

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bot", tags=["bot"])

_exchange: MexcExchange = None
_notifier: TelegramNotifier = None
_bot_task: asyncio.Task = None


def set_exchange(exc: MexcExchange):
    global _exchange
    _exchange = exc


def set_notifier(notifier: TelegramNotifier):
    global _notifier
    _notifier = notifier


async def _run_bot():
    async with AsyncSessionLocal() as db:
        await bot_loop(bot_state, _exchange, db, _notifier, settings)


@router.get("/status")
async def bot_status():
    return bot_state.to_dict()


@router.post("/start")
async def start_bot(background_tasks: BackgroundTasks):
    global _bot_task
    if bot_state.running:
        return {"message": "Bot already running"}
    if _exchange is None:
        raise HTTPException(status_code=400, detail="Exchange not initialized — check API keys in Settings")

    bot_state.running = True
    _bot_task = asyncio.create_task(_run_bot())
    logger.info("Bot started via API")
    return {"message": "Bot started"}


@router.post("/stop")
async def stop_bot():
    bot_state.running = False
    logger.info("Bot stop requested via API")
    return {"message": "Bot stopping"}


@router.get("/balance")
async def get_balance():
    if _exchange is None:
        raise HTTPException(status_code=400, detail="Exchange not initialized")
    try:
        balance = await _exchange.get_balance()
        return balance
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/dry-run")
async def toggle_dry_run(enabled: bool = True):
    bot_state.dry_run = enabled
    logger.info(f"Dry-run mode {'enabled' if enabled else 'disabled'}")
    return {"dry_run": bot_state.dry_run, "message": f"Paper trading {'ON' if enabled else 'OFF'}"}
