from fastapi import APIRouter
from backend.core.state import bot_state
from backend.core.config import settings

router = APIRouter(prefix="/scanner", tags=["scanner"])


@router.get("")
async def get_scanner():
    """
    Returns live signal scores for all watched symbols.
    Used by the ScannerPanel component.
    """
    return {
        "symbols": settings.symbols,
        "scanner": {sym: s.to_dict() for sym, s in bot_state.scanner.items()},
        "signals_today": bot_state.signals_today,
    }


@router.get("/symbols")
async def get_watched_symbols():
    """Return the current watchlist."""
    return {"symbols": settings.symbols}
