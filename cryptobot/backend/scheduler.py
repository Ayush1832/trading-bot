import logging
from datetime import datetime, date, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import crud
from backend.notify import TelegramNotifier

logger = logging.getLogger(__name__)


def setup_scheduler(db_factory, notifier: TelegramNotifier) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def daily_summary():
        async with db_factory() as db:
            today = date.today()
            stats = await crud.get_daily_stats(db, today)
            if stats:
                await notifier.send_daily_summary(stats.to_dict())
            else:
                logger.info("No daily stats to send")

    scheduler.add_job(daily_summary, "cron", hour=0, minute=0, id="daily_summary")
    return scheduler
