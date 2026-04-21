from fastapi import APIRouter, Depends, Query
import pandas as pd

from backend.core.config import settings
from backend.exchange import MexcExchange
from backend.strategy import compute_indicators

router = APIRouter(prefix="/candles", tags=["candles"])

_exchange_instance: MexcExchange = None


def get_exchange() -> MexcExchange:
    return _exchange_instance


def set_exchange(exc: MexcExchange):
    global _exchange_instance
    _exchange_instance = exc


@router.get("")
async def get_candles(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1m"),
):
    exc = get_exchange()
    if exc is None:
        return {"candles": [], "indicators": {}}

    df = await exc.fetch_ohlcv(symbol, timeframe, limit=100)
    df = compute_indicators(df)

    def safe(v):
        if v is None or (hasattr(v, "__class__") and v.__class__.__name__ == "float" and str(v) == "nan"):
            return None
        try:
            import math
            if math.isnan(float(v)):
                return None
        except Exception:
            pass
        return float(v)

    candles = []
    for _, row in df.iterrows():
        candles.append({
            "time": int(row["ts"].timestamp()),
            "open": row["open"],
            "high": row["high"],
            "low": row["low"],
            "close": row["close"],
            "volume": row["volume"],
        })

    last = df.iloc[-2] if len(df) >= 2 else df.iloc[-1]
    indicators = {
        "ema50": safe(last.get("ema50")),
        "rsi14": safe(last.get("rsi14")),
        "bb_low": safe(last.get("bb_low")),
        "bb_mid": safe(last.get("bb_mid")),
        "bb_high": safe(last.get("bb_high")),
        "vol_ratio": safe(last.get("vol_ratio")),
    }

    return {"candles": candles, "indicators": indicators}
