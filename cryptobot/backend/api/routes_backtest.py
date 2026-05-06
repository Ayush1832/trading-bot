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
    start_date: str
    end_date: str
    # Optional overrides for swing parameters
    min_rr_ratio: Optional[float] = None
    atr_1h_multiplier: Optional[float] = None
    max_hold_hours: Optional[int] = None
    daily_pullback_tolerance: Optional[float] = None


@router.post("")
async def run_backtest_endpoint(req: BacktestRequest):
    if _exchange is None:
        return {"error": "Exchange not initialized"}

    # Build backtest config inheriting live settings, overriding only what request specifies
    bt_config = Settings(
        bybit_api_key=settings.bybit_api_key,
        bybit_api_secret=settings.bybit_api_secret,
        symbol=req.symbol,
        symbols=[req.symbol],
        # Timeframes
        tf_weekly=settings.tf_weekly,
        tf_daily=settings.tf_daily,
        tf_4h=settings.tf_4h,
        tf_1h=settings.tf_1h,
        # Swing params — allow per-run override
        min_rr_ratio=req.min_rr_ratio if req.min_rr_ratio is not None else settings.min_rr_ratio,
        atr_1h_multiplier=req.atr_1h_multiplier if req.atr_1h_multiplier is not None else settings.atr_1h_multiplier,
        max_hold_hours=req.max_hold_hours if req.max_hold_hours is not None else settings.max_hold_hours,
        daily_pullback_tolerance=req.daily_pullback_tolerance if req.daily_pullback_tolerance is not None else settings.daily_pullback_tolerance,
        # Carry all detection params from live config
        div_max_age_candles=settings.div_max_age_candles,
        div_min_rsi_level=settings.div_min_rsi_level,
        volume_weak_seller_ratio=settings.volume_weak_seller_ratio,
        tp1_position_size=settings.tp1_position_size,
        trade_usdt=settings.trade_usdt,
        max_trades_per_day=1,
    )

    result = await run_backtest(
        exchange=_exchange,
        symbol=req.symbol,
        timeframe="1h",
        start_date=req.start_date,
        end_date=req.end_date,
        config=bt_config,
    )
    return result.to_dict()
