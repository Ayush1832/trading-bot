import asyncio
import logging
import logging.handlers
import os
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import settings
from backend.core.state import bot_state
from backend.core.websocket import ws_manager
from backend.db.database import init_db, AsyncSessionLocal
from backend.db import crud
from backend.exchange import MexcExchange
from backend.notify import TelegramNotifier
from backend.scheduler import setup_scheduler
from backend.api import routes_trades, routes_stats, routes_bot, routes_candles, routes_backtest, routes_config
from backend.api import routes_paper, routes_scanner

_startup_time: float = 0.0


def setup_logging():
    os.makedirs("logs", exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    fh = logging.handlers.RotatingFileHandler(
        "logs/bot.log", maxBytes=10 * 1024 * 1024, backupCount=5
    )
    fh.setFormatter(fmt)
    root.addHandler(fh)

    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    root.addHandler(sh)

    root.addHandler(DbWsLogHandler())


class DbWsLogHandler(logging.Handler):
    """Saves logs to DB and broadcasts to WebSocket clients."""

    LEVEL_MAP = {
        "DEBUG": "INFO",
        "INFO": "INFO",
        "WARNING": "INFO",
        "ERROR": "ERROR",
        "CRITICAL": "ERROR",
    }

    CUSTOM_LEVELS = {"SIGNAL", "OPEN", "CLOSE", "TSL", "ORDER", "TP1"}

    # Store the running event loop at app startup so we can safely schedule from any thread
    _loop: asyncio.AbstractEventLoop = None

    @classmethod
    def set_loop(cls, loop: asyncio.AbstractEventLoop):
        cls._loop = loop

    def emit(self, record: logging.LogRecord):
        level_name = record.levelname
        if any(level_name.startswith(cl) for cl in self.CUSTOM_LEVELS):
            level = level_name
        else:
            level = self.LEVEL_MAP.get(level_name, "INFO")

        loop = self._loop
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(
                self._async_emit(level, record.getMessage()),
                loop,
            )

    async def _async_emit(self, level: str, message: str):
        try:
            async with AsyncSessionLocal() as db:
                await crud.save_log(db, level, message)
            await ws_manager.broadcast({
                "type": "log_entry",
                "data": {
                    "level": level,
                    "message": message,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            })
        except Exception:
            pass


logger = logging.getLogger(__name__)

_scheduler = None
_exchange: MexcExchange = None
_notifier: TelegramNotifier = None


_bot_start_time: float = 0.0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler, _exchange, _notifier, _bot_start_time

    setup_logging()
    # Wire the running event loop into the log handler so it can safely emit from any thread
    DbWsLogHandler.set_loop(asyncio.get_event_loop())

    await init_db()
    logger.info("Database initialized")

    _bot_start_time = asyncio.get_event_loop().time()

    async with AsyncSessionLocal() as _db:
        from backend.api.routes_config import _apply_to_settings
        saved = await crud.get_config(_db)
        if saved:
            _apply_to_settings(saved)
            logger.info(f"Restored {len(saved)} config keys from database")

    _exchange = MexcExchange(
        api_key=settings.bybit_api_key or settings.mexc_api_key,
        api_secret=settings.bybit_api_secret or settings.mexc_api_secret,
        sandbox=settings.sandbox_mode,
    )

    _notifier = TelegramNotifier(
        token=settings.telegram_token,
        chat_id=settings.telegram_chat_id,
    )

    routes_bot.set_exchange(_exchange)
    routes_bot.set_notifier(_notifier)
    routes_candles.set_exchange(_exchange)
    routes_backtest.set_exchange(_exchange)
    routes_config.set_notifier(_notifier)

    api_key = settings.bybit_api_key or settings.mexc_api_key
    if not api_key or api_key in ("your_api_key_here", "your_bybit_api_key_here", "your_real_api_key_here"):
        bot_state.dry_run = True
        logger.warning("No API keys configured — paper trading mode auto-enabled.")

    _scheduler = setup_scheduler(AsyncSessionLocal, _notifier, bot_state=bot_state, config=settings)
    _scheduler.start()
    logger.info("Scheduler started")

    yield

    if _scheduler:
        _scheduler.shutdown()
    if _exchange:
        await _exchange.close()
    logger.info("Shutdown complete")


app = FastAPI(
    title="CryptoBot Pro API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under /api prefix
app.include_router(routes_trades.router, prefix="/api")
app.include_router(routes_stats.router, prefix="/api")
app.include_router(routes_bot.router, prefix="/api")
app.include_router(routes_candles.router, prefix="/api")
app.include_router(routes_backtest.router, prefix="/api")
app.include_router(routes_config.router, prefix="/api")
app.include_router(routes_paper.router, prefix="/api")
app.include_router(routes_scanner.router, prefix="/api")


@app.get("/api/logs")
async def get_logs(limit: int = 200, level: str = None):
    async with AsyncSessionLocal() as db:
        logs = await crud.get_recent_logs(db, limit=limit, level=level)
        return [l.to_dict() for l in logs]


@app.get("/api/health")
async def system_health():
    """System health check — exchange connectivity, WS clients, DB, Telegram, uptime."""
    import time as _time

    # Exchange ping
    exchange_ok = False
    exchange_latency_ms = None
    if _exchange and _exchange.exchange.apiKey:
        try:
            t0 = _time.monotonic()
            await asyncio.wait_for(_exchange.exchange.fetch_time(), timeout=5)
            exchange_latency_ms = round((_time.monotonic() - t0) * 1000)
            exchange_ok = True
        except Exception:
            exchange_ok = False

    # DB ping
    db_ok = False
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    # Telegram
    telegram_ok = bool(_notifier and _notifier._bot and settings.telegram_token and settings.telegram_chat_id)

    # Uptime
    uptime_s = int(asyncio.get_event_loop().time() - _bot_start_time)
    h, m, s = uptime_s // 3600, (uptime_s % 3600) // 60, uptime_s % 60
    uptime_str = f"{h}h {m}m {s}s"

    return {
        "exchange": {"ok": exchange_ok, "latency_ms": exchange_latency_ms, "sandbox": settings.sandbox_mode},
        "database": {"ok": db_ok},
        "websocket": {"ok": True, "clients": len(ws_manager.active_connections)},
        "telegram": {"ok": telegram_ok},
        "bot": {
            "running": bot_state.running,
            "dry_run": bot_state.dry_run,
            "uptime": uptime_str,
            "uptime_seconds": uptime_s,
        },
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    # Send initial state on connect
    await ws_manager.send_personal(websocket, {"type": "bot_state", "data": bot_state.to_dict()})
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await ws_manager.send_personal(websocket, {"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error: {e}")
        ws_manager.disconnect(websocket)
