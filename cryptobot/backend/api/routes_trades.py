from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import io

from backend.db.database import get_db
from backend.db import crud

router = APIRouter(prefix="/trades", tags=["trades"])


@router.get("")
async def list_trades(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    symbol: str = Query(None),
    status: str = Query(None),
    exit_reason: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    sort_by: str = Query("entry_time"),
    sort_dir: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
):
    trades, total = await crud.get_trades_with_count(
        db, limit=limit, offset=offset, symbol=symbol,
        status=status, exit_reason=exit_reason,
        date_from=date_from, date_to=date_to,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    return {"trades": [t.to_dict() for t in trades], "total": total}


@router.get("/export")
async def export_trades_csv(db: AsyncSession = Depends(get_db)):
    csv_data = await crud.get_trades_csv(db)
    return StreamingResponse(
        io.StringIO(csv_data),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=trades.csv"},
    )


@router.get("/{trade_id}")
async def get_trade(trade_id: int, db: AsyncSession = Depends(get_db)):
    trade = await crud.get_trade(db, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade.to_dict()
