from fastapi import APIRouter

from backend.core.state import bot_state
from backend.paper_trading import paper_trader

router = APIRouter(prefix="/paper", tags=["paper-trading"])


@router.get("/stats")
async def get_paper_stats():
    return paper_trader.get_stats()


@router.get("/trades")
async def get_paper_trades(limit: int = 50):
    return paper_trader.get_recent_trades(limit=limit)


@router.post("/reset")
async def reset_paper_account():
    if bot_state.trade_open and bot_state.dry_run:
        return {"error": "Cannot reset while a paper trade is open"}
    paper_trader.reset()
    return {"message": "Paper account reset", "balance": paper_trader.balance}


@router.post("/enable")
async def enable_paper_mode():
    bot_state.dry_run = True
    return {"dry_run": True, "balance": paper_trader.balance, "message": "Paper trading enabled — no real orders will be placed"}


@router.post("/disable")
async def disable_paper_mode():
    if bot_state.trade_open and bot_state.dry_run:
        return {"error": "Close open paper trade before switching to live mode"}
    bot_state.dry_run = False
    return {"dry_run": False, "message": "Live trading mode enabled"}
