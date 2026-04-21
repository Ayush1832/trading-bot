from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

from backend.backtest import run_backtest
from backend.core.config import settings, Settings
from backend.exchange import MexcExchange

router = APIRouter(prefix="/backtest", tags=["backtest"])

_exchange: MexcExchange = None


def set_exchange(exc: MexcExchange):
    global _exchange
    _exchange = exc


class BacktestRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1m"
    start_date: str
    end_date: str
    trail_pct: Optional[float] = None
    take_profit_pct: Optional[float] = None
    hard_sl_pct: Optional[float] = None
    max_hold_minutes: Optional[int] = None


@router.post("")
async def run_backtest_endpoint(req: BacktestRequest):
    if _exchange is None:
        return {"error": "Exchange not initialized"}

    bt_config = Settings(
        mexc_api_key=settings.mexc_api_key,
        mexc_api_secret=settings.mexc_api_secret,
        symbol=req.symbol,
        timeframe=req.timeframe,
        trail_pct=req.trail_pct if req.trail_pct is not None else settings.trail_pct,
        take_profit_pct=req.take_profit_pct if req.take_profit_pct is not None else settings.take_profit_pct,
        hard_sl_pct=req.hard_sl_pct if req.hard_sl_pct is not None else settings.hard_sl_pct,
        max_hold_minutes=req.max_hold_minutes if req.max_hold_minutes is not None else settings.max_hold_minutes,
        trade_usdt=settings.trade_usdt,
        cooldown_seconds=settings.cooldown_seconds,
    )

    result = await run_backtest(
        exchange=_exchange,
        symbol=req.symbol,
        timeframe=req.timeframe,
        start_date=req.start_date,
        end_date=req.end_date,
        config=bt_config,
    )
    return result.to_dict()
