import csv
import io
from datetime import date, datetime
from typing import Optional
from sqlalchemy import select, update, func, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.models import Trade, DailyStats, BotLog, Config


async def create_trade(db: AsyncSession, trade_data: dict) -> Trade:
    trade = Trade(**trade_data)
    db.add(trade)
    await db.commit()
    await db.refresh(trade)
    return trade


async def update_trade(db: AsyncSession, trade_id: int, update_data: dict) -> Optional[Trade]:
    await db.execute(update(Trade).where(Trade.id == trade_id).values(**update_data))
    await db.commit()
    return await get_trade(db, trade_id)


async def get_trade(db: AsyncSession, trade_id: int) -> Optional[Trade]:
    result = await db.execute(select(Trade).where(Trade.id == trade_id))
    return result.scalar_one_or_none()


async def get_trades(
    db: AsyncSession,
    limit: int = 20,
    offset: int = 0,
    symbol: Optional[str] = None,
    status: Optional[str] = None,
    exit_reason: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: str = "entry_time",
    sort_dir: str = "desc",
    is_backtest: bool = False,
) -> list[Trade]:
    q = select(Trade).where(Trade.is_backtest == is_backtest)
    if symbol:
        q = q.where(Trade.symbol == symbol)
    if status:
        q = q.where(Trade.status == status)
    if exit_reason:
        q = q.where(Trade.exit_reason == exit_reason)
    if date_from:
        q = q.where(Trade.entry_time >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.where(Trade.entry_time <= datetime.fromisoformat(date_to))

    col = getattr(Trade, sort_by, Trade.entry_time)
    q = q.order_by(desc(col) if sort_dir == "desc" else asc(col))
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_open_trade(db: AsyncSession) -> Optional[Trade]:
    result = await db.execute(
        select(Trade).where(Trade.status == "OPEN", Trade.is_backtest == False)
    )
    return result.scalar_one_or_none()


async def get_trades_csv(db: AsyncSession) -> str:
    trades = await get_trades(db, limit=100000)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        "id", "symbol", "entry_time", "exit_time", "entry_price", "exit_price",
        "peak_price", "qty", "trade_usdt", "pnl_usdt", "pnl_pct",
        "exit_reason", "status", "tsl_update_count",
    ])
    writer.writeheader()
    for t in trades:
        writer.writerow({
            "id": t.id,
            "symbol": t.symbol,
            "entry_time": t.entry_time,
            "exit_time": t.exit_time,
            "entry_price": t.entry_price,
            "exit_price": t.exit_price,
            "peak_price": t.peak_price,
            "qty": t.qty,
            "trade_usdt": t.trade_usdt,
            "pnl_usdt": t.pnl_usdt,
            "pnl_pct": t.pnl_pct,
            "exit_reason": t.exit_reason,
            "status": t.status,
            "tsl_update_count": t.tsl_update_count,
        })
    return output.getvalue()


async def get_session_stats(db: AsyncSession) -> dict:
    result = await db.execute(
        select(
            func.count(Trade.id).label("total_trades"),
            func.sum(Trade.pnl_usdt).label("total_pnl_usdt"),
        ).where(Trade.status == "CLOSED", Trade.is_backtest == False)
    )
    row = result.one()
    total = row.total_trades or 0
    pnl = row.total_pnl_usdt or 0.0

    wins_result = await db.execute(
        select(func.count(Trade.id)).where(
            Trade.status == "CLOSED", Trade.pnl_usdt > 0, Trade.is_backtest == False
        )
    )
    wins = wins_result.scalar() or 0

    return {
        "total_trades": total,
        "winning_trades": wins,
        "losing_trades": total - wins,
        "win_rate": wins / total if total > 0 else 0.0,
        "total_pnl_usdt": pnl,
    }


async def get_daily_stats(db: AsyncSession, target_date: date) -> Optional[DailyStats]:
    result = await db.execute(select(DailyStats).where(DailyStats.date == target_date))
    return result.scalar_one_or_none()


async def upsert_daily_stats(db: AsyncSession, target_date: date, stats: dict) -> DailyStats:
    existing = await get_daily_stats(db, target_date)
    if existing:
        for k, v in stats.items():
            setattr(existing, k, v)
        existing.date = target_date
        await db.commit()
        await db.refresh(existing)
        return existing
    obj = DailyStats(date=target_date, **stats)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


async def get_all_daily_stats(db: AsyncSession) -> list[DailyStats]:
    result = await db.execute(select(DailyStats).order_by(desc(DailyStats.date)))
    return list(result.scalars().all())


async def get_equity_curve(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Trade).where(
            Trade.status == "CLOSED",
            Trade.is_backtest == False,
        ).order_by(asc(Trade.exit_time))
    )
    trades = result.scalars().all()
    curve = []
    cumulative = 0.0
    for t in trades:
        cumulative += t.pnl_usdt or 0.0
        curve.append({
            "timestamp": t.exit_time.isoformat() if t.exit_time else None,
            "equity_usdt": round(cumulative, 6),
            "trade_id": t.id,
            "win": (t.pnl_usdt or 0) > 0,
        })
    return curve


async def save_log(
    db: AsyncSession, level: str, message: str, trade_id: Optional[int] = None
):
    log = BotLog(
        timestamp=datetime.utcnow(),
        level=level,
        message=message,
        trade_id=trade_id,
    )
    db.add(log)
    await db.commit()


async def get_recent_logs(db: AsyncSession, limit: int = 200, level: Optional[str] = None) -> list[BotLog]:
    q = select(BotLog)
    if level:
        q = q.where(BotLog.level == level)
    q = q.order_by(desc(BotLog.id)).limit(limit)
    result = await db.execute(q)
    return list(reversed(result.scalars().all()))


async def get_config(db: AsyncSession) -> dict:
    result = await db.execute(select(Config))
    rows = result.scalars().all()
    return {r.key: r.value for r in rows}


async def set_config(db: AsyncSession, key: str, value: str):
    existing = await db.execute(select(Config).where(Config.key == key))
    obj = existing.scalar_one_or_none()
    if obj:
        obj.value = value
        obj.updated_at = datetime.utcnow()
    else:
        obj = Config(key=key, value=value, updated_at=datetime.utcnow())
        db.add(obj)
    await db.commit()


async def bulk_set_config(db: AsyncSession, config: dict):
    for key, value in config.items():
        await set_config(db, key, str(value))
