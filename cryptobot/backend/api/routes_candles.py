import math
from fastapi import APIRouter, Query

from backend.exchange import MexcExchange
from backend.strategy import compute_indicators

router = APIRouter(prefix="/candles", tags=["candles"])

_exchange_instance: MexcExchange = None


def get_exchange() -> MexcExchange:
    return _exchange_instance


def set_exchange(exc: MexcExchange):
    global _exchange_instance
    _exchange_instance = exc


def _safe(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


@router.get("")
async def get_candles(
    symbol: str = Query("BTC/USDT"),
    timeframe: str = Query("1h"),
    limit: int = Query(100),
):
    exc = get_exchange()
    if exc is None:
        return {"candles": [], "ema20": [], "ema50": [], "bb_high": [], "bb_low": [], "indicators": {}}

    df = await exc.fetch_ohlcv(symbol, timeframe, limit=limit)
    df = compute_indicators(df)

    candles = []
    ema20   = []
    ema50   = []
    bb_high = []
    bb_low  = []

    for _, row in df.iterrows():
        t = int(row["ts"].timestamp())
        candles.append({
            "time":   t,
            "open":   row["open"],
            "high":   row["high"],
            "low":    row["low"],
            "close":  row["close"],
            "volume": row["volume"],
        })

        v20 = _safe(row.get("ema20"))
        if v20 is not None:
            ema20.append({"time": t, "value": v20})

        v50 = _safe(row.get("ema50"))
        if v50 is not None:
            ema50.append({"time": t, "value": v50})

        bh = _safe(row.get("bb_high"))
        bl = _safe(row.get("bb_low"))
        if bh is not None:
            bb_high.append({"time": t, "value": bh})
        if bl is not None:
            bb_low.append({"time": t, "value": bl})

    # Last closed candle summary for LiveTradeCard indicator display
    last = df.iloc[-2] if len(df) >= 2 else df.iloc[-1]
    indicators = {
        "ema20":     _safe(last.get("ema20")),
        "ema50":     _safe(last.get("ema50")),
        "rsi14":     _safe(last.get("rsi14")),
        "bb_low":    _safe(last.get("bb_low")),
        "bb_mid":    _safe(last.get("bb_mid")),
        "bb_high":   _safe(last.get("bb_high")),
        "vol_ratio": _safe(last.get("vol_ratio")),
        "adx14":     _safe(last.get("adx14")),
        "atr14":     _safe(last.get("atr14")),
    }

    return {
        "candles":    candles,
        "ema20":      ema20,
        "ema50":      ema50,
        "bb_high":    bb_high,
        "bb_low":     bb_low,
        "indicators": indicators,
    }
