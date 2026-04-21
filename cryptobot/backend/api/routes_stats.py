from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.db import crud

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
async def get_stats(db: AsyncSession = Depends(get_db)):
    session_stats = await crud.get_session_stats(db)
    return session_stats


@router.get("/daily")
async def get_daily_stats(db: AsyncSession = Depends(get_db)):
    rows = await crud.get_all_daily_stats(db)
    return [r.to_dict() for r in rows]


@router.get("/equity-curve")
async def get_equity_curve(db: AsyncSession = Depends(get_db)):
    return await crud.get_equity_curve(db)
