import logging
from datetime import datetime, date, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db import crud
from backend.notify import TelegramNotifier

logger = logging.getLogger(__name__)


def setup_scheduler(db_factory, notifier: TelegramNotifier, bot_state=None, config=None) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")

    async def daily_summary_and_reset():
        """Runs at 00:00 UTC: send summary, then reset all daily counters."""
        async with db_factory() as db:
            today = date.today()
            stats = await crud.get_daily_stats(db, today)
            if stats:
                trades_today = bot_state.trades_today if bot_state else 0
                max_trades   = config.max_trades_per_day if config else 10
                daily_halted = bot_state.daily_halted if bot_state else False

                # Build exit reason breakdown from today's closed trades
                from sqlalchemy import select
                from backend.db.models import Trade
                result = await db.execute(
                    select(Trade).where(
                        Trade.status == "CLOSED",
                        Trade.is_backtest.is_(False),
                    )
                )
                today_trades = [t for t in result.scalars().all()
                                if t.exit_time and t.exit_time.date() == today]
                breakdown = {}
                for t in today_trades:
                    if t.exit_reason:
                        breakdown[t.exit_reason] = breakdown.get(t.exit_reason, 0) + 1

                await notifier.send_daily_summary(
                    stats.to_dict(),
                    trades_today=trades_today,
                    max_trades=max_trades,
                    exit_breakdown=breakdown,
                    daily_halted=daily_halted,
                )
            else:
                logger.info("No daily stats to send")

        # Reset all daily state counters
        if bot_state is not None:
            with bot_state._lock:
                bot_state.reset_daily()
            logger.info("Daily state counters reset for new UTC day")

    scheduler.add_job(daily_summary_and_reset, "cron", hour=0, minute=0, id="daily_summary")
    return scheduler
