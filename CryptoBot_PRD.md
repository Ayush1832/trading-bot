# Product Requirements Document
## CryptoBot Pro — Automated Crypto Trading System
**Version:** 1.0  
**Target Exchange:** MEXC  
**Capital:** $10 starting, $1 max per trade  
**Author:** PRD generated for Claude Code  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Module 1 — Core Trading Engine](#5-module-1--core-trading-engine)
6. [Module 2 — Backtesting Engine](#6-module-2--backtesting-engine)
7. [Module 3 — Web Dashboard](#7-module-3--web-dashboard)
8. [Module 4 — Telegram Bot](#8-module-4--telegram-bot)
9. [Module 5 — Database Layer](#9-module-5--database-layer)
10. [Module 6 — Configuration System](#10-module-6--configuration-system)
11. [Module 7 — Logging & Alerting](#11-module-7--logging--alerting)
12. [API Reference](#12-api-reference)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Guide](#14-deployment-guide)
15. [Testing Requirements](#15-testing-requirements)
16. [Risk & Safety Rules](#16-risk--safety-rules)

---

## 1. Project Overview

### 1.1 What is CryptoBot Pro?

CryptoBot Pro is a fully automated cryptocurrency trading system that:

- Executes a **mean reversion scalping strategy** with EMA trend filter on MEXC exchange
- Uses a **software-managed trailing stop loss** (TSL) to lock in profits as price moves in favor
- Enforces strict **single-trade-at-a-time** discipline — only one trade open at any moment
- Limits **maximum trade size to $1 USDT** with a $10 starting balance
- Provides a **real-time web dashboard** (FastAPI + React) showing live P&L, open trade, charts, and logs
- Sends **Telegram notifications** for every trade event (entry, TSL update, exit, daily summary)
- Includes a **backtesting engine** with visual results to validate strategy before going live
- Persists all trade history, logs, and performance stats in **SQLite**

### 1.2 Core Strategy (build exactly this)

**Entry conditions (ALL must be true simultaneously):**
1. Price is above EMA 50 (only long trades — no shorting)
2. RSI(14) < 30 (oversold)
3. Price ≤ lower Bollinger Band (BB 20, std 2)
4. Current candle volume > 1.5 × 20-bar average volume (volume spike)
5. No trade currently open (`trade_open == False`)
6. At least 120 seconds since last trade closed (cooldown)
7. Fewer than 6 trades in the last 60 minutes (rate limit)

**Exit conditions (checked every 5 seconds during open trade):**
- Take profit: price ≥ entry × 1.012 (+1.2%)
- Trailing stop loss fires: price ≤ trailing_sl (starts at entry × 0.992, moves up with price)
- Hard stop loss: price ≤ entry × 0.992 (-0.8%) — safety net
- Timeout: trade open for more than 30 minutes → market exit

**Trailing stop loss logic:**
- `peak_price` = highest price seen since entry (starts at entry, only increases)
- `trailing_sl` = `peak_price × (1 - 0.008)` — recalculated every poll
- When price makes a new high → `peak_price` updates → `trailing_sl` rises automatically
- TSL never moves downward

**Trade parameters:**
- Trade size: exactly $1.00 USDT per trade
- Order type: limit buy on entry, market sell on exit
- Pair: BTC/USDT (primary), configurable
- Timeframe: 1-minute candles

---

## 2. Tech Stack

### 2.1 Backend

| Component | Technology | Version | Reason |
|---|---|---|---|
| Language | Python | 3.11+ | Async support, ccxt compatibility |
| Exchange API | ccxt | latest | Universal exchange library, MEXC support |
| Web framework | FastAPI | latest | Async, auto OpenAPI docs, WebSocket support |
| ASGI server | Uvicorn | latest | High performance, production ready |
| Database ORM | SQLAlchemy | 2.x | Async support, type safety |
| Database | SQLite | built-in | Zero-config, sufficient for single-user |
| Task scheduling | APScheduler | latest | Cron + interval jobs, async compatible |
| Telegram | python-telegram-bot | 20.x | async, modern API |
| Technical indicators | pandas-ta | latest | RSI, BB, EMA, ATR all in one |
| Data manipulation | pandas + numpy | latest | Candle data processing |
| Environment config | python-dotenv | latest | .env file support |
| Process management | systemd / PM2 | — | Keep bot running on VPS |

### 2.2 Frontend

| Component | Technology | Reason |
|---|---|---|
| Framework | React 18 | Component-based, large ecosystem |
| Build tool | Vite | Fast HMR, modern bundler |
| Charts | Recharts | React-native charting, lightweight |
| Candlestick chart | lightweight-charts (TradingView) | Professional-grade OHLCV charts |
| Styling | Tailwind CSS | Utility-first, fast to build |
| Real-time | WebSocket (native) | Live price and trade updates |
| HTTP client | Axios | Promise-based, interceptors |
| State management | Zustand | Lightweight, no boilerplate |

### 2.3 Infrastructure

- **VPS**: Ubuntu 22.04 LTS (DigitalOcean / Hetzner / Linode)
- **Reverse proxy**: Nginx (routes `/api` to FastAPI, `/` to React build)
- **Process manager**: systemd service for bot + API
- **Database backups**: daily SQLite copy to local `/backups/` folder

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CryptoBot Pro                        │
│                                                         │
│  ┌─────────────┐    ┌──────────────┐   ┌────────────┐  │
│  │   Trading   │    │   FastAPI    │   │  Telegram  │  │
│  │   Engine    │───▶│  REST + WS   │   │    Bot     │  │
│  │  (bot.py)   │    │  (api.py)    │   │ (notify.py)│  │
│  └──────┬──────┘    └──────┬───────┘   └────────────┘  │
│         │                  │                  ▲          │
│         ▼                  ▼                  │          │
│  ┌─────────────────────────────────────────┐  │          │
│  │           SQLite Database               │  │          │
│  │  (trades, candles, logs, config)        │──┘          │
│  └─────────────────────────────────────────┘             │
│         │                                                │
│         ▼                                                │
│  ┌─────────────┐                                         │
│  │    MEXC     │                                         │
│  │ Exchange API│                                         │
│  │ REST + WS   │                                         │
│  └─────────────┘                                         │
└─────────────────────────────────────────────────────────┘

React Dashboard (browser)
  └── connects to FastAPI via HTTP + WebSocket
```

### 3.1 Data flow

1. Trading engine polls MEXC for 1m candles every 5 seconds
2. Computes EMA50, RSI14, Bollinger Bands, volume ratio
3. If all entry conditions met → places limit buy order on MEXC
4. While trade open → polls ticker every 5s, updates TSL, checks exits
5. On exit → logs trade to SQLite, triggers Telegram notification
6. FastAPI reads from SQLite + holds live state in memory
7. React dashboard polls FastAPI REST endpoints + subscribes to WebSocket for live updates
8. APScheduler fires daily summary at midnight → sends Telegram digest

---

## 4. Directory Structure

Build **exactly** this directory structure:

```
cryptobot/
├── backend/
│   ├── main.py                  # FastAPI app entry point + lifespan
│   ├── bot.py                   # Core trading engine (the bot loop)
│   ├── strategy.py              # Entry/exit signal logic (pure functions)
│   ├── risk.py                  # Risk management: TSL, position sizing
│   ├── exchange.py              # ccxt MEXC wrapper (all exchange calls here)
│   ├── backtest.py              # Backtesting engine
│   ├── notify.py                # Telegram notification sender
│   ├── scheduler.py             # APScheduler jobs (daily summary, etc.)
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes_trades.py     # GET /trades, GET /trades/{id}
│   │   ├── routes_stats.py      # GET /stats, GET /stats/daily
│   │   ├── routes_bot.py        # GET /bot/status, POST /bot/start, POST /bot/stop
│   │   ├── routes_candles.py    # GET /candles (for chart)
│   │   ├── routes_backtest.py   # POST /backtest
│   │   └── routes_config.py     # GET /config, POST /config
│   ├── db/
│   │   ├── __init__.py
│   │   ├── database.py          # SQLAlchemy engine, session, Base
│   │   ├── models.py            # All ORM models
│   │   └── crud.py              # All DB read/write functions
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py            # Settings (pydantic BaseSettings, reads .env)
│   │   ├── state.py             # Global bot state (dataclass, thread-safe)
│   │   └── websocket.py         # WebSocket manager (broadcast to all clients)
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── store/
│       │   └── useStore.js       # Zustand global state
│       ├── hooks/
│       │   ├── useWebSocket.js   # WS connection + auto-reconnect
│       │   └── useApi.js         # Axios wrapper with error handling
│       ├── pages/
│       │   ├── Dashboard.jsx     # Main page (live trade + chart)
│       │   ├── Trades.jsx        # Trade history table
│       │   ├── Backtest.jsx      # Backtest runner + results
│       │   └── Settings.jsx      # Bot config editor
│       └── components/
│           ├── NavBar.jsx
│           ├── BotStatusBadge.jsx
│           ├── LiveTradeCard.jsx
│           ├── PnLChart.jsx       # Cumulative P&L line chart
│           ├── CandleChart.jsx    # TradingView lightweight-charts
│           ├── StatsGrid.jsx      # Win rate, total trades, best/worst
│           ├── TradeTable.jsx     # Paginated trade log
│           ├── BacktestForm.jsx
│           ├── BacktestResults.jsx
│           └── LogFeed.jsx        # Live log stream
│
├── .env                           # Secrets (never commit)
├── .env.example                   # Template (safe to commit)
├── docker-compose.yml             # Optional: run everything in Docker
├── nginx.conf                     # Nginx reverse proxy config
├── cryptobot.service              # systemd service file
└── README.md
```

---

## 5. Module 1 — Core Trading Engine

### 5.1 `core/state.py` — Global Bot State

```python
# Build a thread-safe dataclass holding all runtime state.
# This is the single source of truth read by the API and websocket.

@dataclass
class BotState:
    running: bool = False
    trade_open: bool = False
    last_trade_time: float = 0.0
    trades_this_hour: list = field(default_factory=list)
    
    # Open trade info (None when no trade open)
    entry_price: Optional[float] = None
    entry_time: Optional[float] = None
    entry_order_id: Optional[str] = None
    peak_price: Optional[float] = None
    trailing_sl: Optional[float] = None
    take_profit_price: Optional[float] = None
    hard_sl_price: Optional[float] = None
    trade_qty: Optional[float] = None
    current_price: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None
    
    # Last candle indicators (for dashboard)
    last_ema50: Optional[float] = None
    last_rsi: Optional[float] = None
    last_bb_low: Optional[float] = None
    last_bb_high: Optional[float] = None
    last_volume_ratio: Optional[float] = None
    
    # Session stats
    session_trades: int = 0
    session_wins: int = 0
    session_pnl_usdt: float = 0.0
    
    # Lock for thread safety
    _lock: threading.Lock = field(default_factory=threading.Lock)
```

### 5.2 `strategy.py` — Signal Logic

Build all signal logic as **pure functions** that take a DataFrame and return a result. No side effects. This makes backtesting and live trading use the exact same code.

```python
def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Input: DataFrame with columns [ts, open, high, low, close, volume]
            at least 60 rows (for EMA50 to be meaningful)
    Output: same DataFrame with added columns:
            ema50, rsi14, bb_low, bb_mid, bb_high, vol_avg, vol_ratio
    """

def check_entry_signal(df: pd.DataFrame) -> dict:
    """
    Input: DataFrame with indicators already computed (from compute_indicators)
    Output: {
        "signal": True/False,
        "reasons": {
            "trend_ok": bool,     # price > ema50
            "rsi_ok": bool,       # rsi < 30
            "bb_ok": bool,        # price <= bb_low
            "volume_ok": bool,    # vol_ratio > 1.5
        },
        "values": {
            "price": float,
            "ema50": float,
            "rsi": float,
            "bb_low": float,
            "vol_ratio": float,
        }
    }
    Uses second-to-last candle (iloc[-2]) — last closed candle, not live.
    """

def compute_tsl(peak_price: float, trail_pct: float) -> float:
    """Returns trailing_sl = peak_price * (1 - trail_pct)"""

def check_exit(
    current_price: float,
    entry_price: float,
    peak_price: float,
    trailing_sl: float,
    take_profit_pct: float,
    hard_sl_pct: float,
    entry_time: float,
    max_hold_minutes: int
) -> Optional[str]:
    """
    Returns exit reason string or None:
    - "TAKE_PROFIT"
    - "TRAILING_SL"
    - "HARD_SL"
    - "TIMEOUT"
    - None (no exit)
    """
```

### 5.3 `exchange.py` — MEXC Wrapper

Wrap all ccxt calls here. Every function handles its own exceptions and logs clearly.

```python
class MexcExchange:
    def __init__(self, api_key: str, api_secret: str, sandbox: bool = False):
        # Initialize ccxt.mexc with rate limiting enabled
        # If sandbox=True, set exchange.set_sandbox_mode(True)
        pass

    async def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 60) -> pd.DataFrame:
        """Fetch candles, return DataFrame with [ts, open, high, low, close, volume]"""

    async def fetch_ticker(self, symbol: str) -> dict:
        """Return {bid, ask, last, volume}"""

    async def get_balance(self) -> dict:
        """Return {USDT: {free, used, total}}"""

    async def place_limit_buy(self, symbol: str, qty: float, price: float) -> dict:
        """Place limit buy order. Return order dict with id, status, filled_price"""

    async def place_market_sell(self, symbol: str, qty: float) -> dict:
        """Place market sell. Return order dict."""

    async def get_order(self, symbol: str, order_id: str) -> dict:
        """Fetch order status by ID."""

    async def cancel_order(self, symbol: str, order_id: str) -> bool:
        """Cancel an open order. Return True if successful."""

    async def check_order_filled(self, symbol: str, order_id: str) -> Optional[float]:
        """
        Poll order status. Return filled_price if fully filled, None if still open.
        Cancel and return None if order not filled after 30 seconds.
        """
```

### 5.4 `risk.py` — Risk Manager

```python
def calculate_position_qty(usdt_amount: float, price: float, min_qty: float) -> float:
    """
    Calculate how many units to buy.
    Round down to exchange's minimum quantity precision.
    Never buy more than usdt_amount / price.
    """

def check_rate_limits(trades_this_hour: list, max_per_hour: int, 
                       last_trade_time: float, cooldown_sec: int) -> tuple[bool, str]:
    """
    Returns (allowed: bool, reason: str).
    Cleans up trades_this_hour list in place (removes entries older than 60 min).
    """

def check_daily_drawdown(daily_pnl_usdt: float, starting_balance: float, 
                          max_drawdown_pct: float) -> bool:
    """
    Return True if today's loss exceeds max_drawdown_pct of starting_balance.
    If True, bot should halt for the day.
    """
```

### 5.5 `bot.py` — Main Bot Loop

This is the core async loop. Build it exactly as follows:

```python
async def bot_loop(state: BotState, exchange: MexcExchange, db: AsyncSession,
                   notifier: TelegramNotifier, config: Settings):
    """
    Main loop. Called once, runs forever until state.running = False.
    
    Every iteration (5 second sleep):
    
    IF trade_open == False:
        1. Check rate limits (cooldown, hourly cap, daily drawdown)
        2. Fetch last 60 candles
        3. Compute indicators
        4. Update state with latest indicator values (for dashboard)
        5. Check entry signal
        6. If signal:
            a. Calculate qty = config.trade_usdt / current_ask
            b. Place limit buy order
            c. Wait up to 30s for fill (poll check_order_filled)
            d. If filled: update state (trade_open=True, entry_price, etc.)
                          save Trade to DB with status='OPEN'
                          send Telegram "trade opened" message
            e. If not filled after 30s: cancel order, log "order not filled"
    
    IF trade_open == True:
        1. Fetch current ticker price
        2. Update state.current_price
        3. Update TSL: if current_price > peak_price:
                           peak_price = current_price
                           trailing_sl = compute_tsl(peak_price, config.trail_pct)
                           update state
                           send Telegram "TSL updated" message (only if TSL moved > 0.1%)
        4. Check exit conditions
        5. If exit_reason is not None:
            a. Place market sell order
            b. Calculate realized PnL
            c. Update Trade in DB (status='CLOSED', exit_price, pnl, exit_reason)
            d. Update state (trade_open=False, reset all trade fields)
            e. Update session stats
            f. Send Telegram "trade closed" message
    
    Sleep 5 seconds.
    Catch all exceptions, log them, continue loop (never crash).
    """
```

---

## 6. Module 2 — Backtesting Engine

### 6.1 `backtest.py`

The backtester must use **identical strategy functions** from `strategy.py` — same `compute_indicators()` and `check_entry_signal()`. This guarantees backtest results match live behavior.

```python
@dataclass
class BacktestResult:
    symbol: str
    timeframe: str
    start_date: str
    end_date: str
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float               # 0.0 to 1.0
    total_pnl_pct: float          # sum of all trade pnl %
    total_pnl_usdt: float         # with $1 per trade
    avg_win_pct: float
    avg_loss_pct: float
    max_drawdown_pct: float       # largest peak-to-trough on equity curve
    profit_factor: float          # gross_profit / gross_loss
    sharpe_ratio: float           # annualized
    avg_hold_minutes: float
    trades: list[dict]            # full trade list for chart rendering
    equity_curve: list[dict]      # [{timestamp, equity_usdt}] for chart

async def run_backtest(
    exchange: MexcExchange,
    symbol: str,
    timeframe: str,
    start_date: str,           # "YYYY-MM-DD"
    end_date: str,
    config: Settings
) -> BacktestResult:
    """
    1. Fetch all OHLCV data for date range from exchange (paginate if needed)
    2. Compute indicators on full dataset
    3. Walk forward candle by candle (iloc[i]):
       - Check entry on candle i
       - If entry triggered: simulate fill at next candle open price
       - Simulate TSL/TP/SL/timeout tick by tick (use high/low of each candle)
       - Record exit reason and PnL
    4. Build equity curve from trade list
    5. Calculate all stats
    6. Return BacktestResult
    
    IMPORTANT: Use candle high/low to check if SL or TP was hit intrabar.
    Assume worst case: SL hit at low, TP hit at high.
    """
```

---

## 7. Module 3 — Web Dashboard

### 7.1 Pages and Components

#### Dashboard page (`pages/Dashboard.jsx`)

Layout: top row of 4 stat cards, then two-column layout (left: candlestick chart, right: live trade card + indicator values), then full-width P&L chart, then log feed at bottom.

**Stat cards (top row):**
- Total P&L today (USDT, colored green/red)
- Win rate (session, as percentage)
- Total trades (session)
- Bot status (RUNNING / STOPPED badge)

**Candlestick chart (`CandleChart.jsx`):**
- Use TradingView `lightweight-charts` library
- Show last 60 × 1m candles of BTC/USDT
- Overlay EMA 50 line in blue
- Overlay Bollinger Bands (upper + lower) as dashed lines
- Mark entry price with a green upward triangle marker
- Mark TSL level with a red horizontal line (updates live)
- Mark TP level with a blue horizontal line
- Auto-updates every 5 seconds via WebSocket message of type `"candle_update"`

**Live trade card (`LiveTradeCard.jsx`):**
- Shows when `trade_open == true`
- Displays: entry price, current price, unrealized P&L (% and USDT), peak price, current TSL level, TP level, time elapsed
- P&L number is large, bold, green when positive, red when negative
- Animates (pulse) when TSL moves up
- When no trade open: shows "Waiting for signal" with current indicator values (RSI, BB position, trend status, volume ratio)

**P&L chart (`PnLChart.jsx`):**
- Cumulative equity curve using Recharts `AreaChart`
- X axis: time, Y axis: cumulative USDT P&L
- Fill area green when above 0, red when below
- Dots on each trade close event (green = win, red = loss)
- Toggleable: session only vs all-time

**Log feed (`LogFeed.jsx`):**
- Scrollable div, max 200 lines
- Color-coded: INFO (gray), SIGNAL (blue), OPEN (green), CLOSE (yellow), TSL UPDATE (teal), ERROR (red)
- Auto-scrolls to bottom on new entries
- Receives entries via WebSocket message type `"log_entry"`

#### Trades page (`pages/Trades.jsx`)

Full trade history table with columns:
- # (trade number)
- Date/time (entry)
- Pair
- Entry price
- Exit price
- Peak price (highest reached)
- TSL fired? (yes/no badge)
- P&L (%)
- P&L (USDT)
- Exit reason (TAKE_PROFIT / TRAILING_SL / HARD_SL / TIMEOUT)
- Hold time (minutes)

Features:
- Pagination (20 per page)
- Filter by: result (WIN/LOSS), exit reason, date range
- Sort by any column
- Export to CSV button (calls `GET /api/trades/export`)
- Summary row at top: total trades, win rate, total P&L

#### Backtest page (`pages/Backtest.jsx`)

Form inputs:
- Symbol (dropdown: BTC/USDT, ETH/USDT, SOL/USDT)
- Start date (date picker)
- End date (date picker)
- Trail % (slider: 0.3% to 2.0%, step 0.1%)
- Take profit % (slider: 0.5% to 3.0%)
- Stop loss % (slider: 0.3% to 2.0%)
- Max hold time (slider: 10 to 60 minutes)
- Run Backtest button

Results panel (shown after run):
- Summary cards: total trades, win rate, total P&L %, max drawdown, profit factor, Sharpe ratio
- Equity curve chart (Recharts)
- Trade list table (same columns as Trades page)
- "Apply these settings" button → saves config

#### Settings page (`pages/Settings.jsx`)

Editable config form:
- API Key (masked input)
- API Secret (masked input)
- Trading pair
- Trade size USDT
- Trail % 
- Take profit %
- Hard stop loss %
- Max hold minutes
- Cooldown seconds
- Max trades per hour
- Telegram bot token
- Telegram chat ID
- Test Telegram button (sends test message)
- Sandbox mode toggle
- Save button (calls `POST /api/config`)

---

## 8. Module 4 — Telegram Bot

### 8.1 `notify.py` — Notification Sender

```python
class TelegramNotifier:
    def __init__(self, token: str, chat_id: str):
        # Initialize python-telegram-bot Application
        pass

    async def send_trade_opened(self, trade: dict):
        """
        Message format:
        
        🟢 TRADE OPENED
        ──────────────
        Pair:    BTC/USDT
        Entry:   $43,250.00
        Qty:     0.0000231
        TP:      $43,769.00 (+1.2%)
        Hard SL: $42,904.00 (-0.8%)
        TSL:     $42,904.00 (trailing 0.8%)
        Time:    14:32:05 UTC
        """

    async def send_tsl_updated(self, trade: dict, old_tsl: float, new_tsl: float):
        """
        Message format (only sent if TSL moved by > 0.1%):
        
        📈 TRAILING STOP UPDATED
        ──────────────────────
        Pair:      BTC/USDT
        New high:  $43,820.00
        New TSL:   $43,469.00 (was $42,904.00)
        Locked in: +0.51% profit
        """

    async def send_trade_closed(self, trade: dict):
        """
        Message format:
        
        🔴 TRADE CLOSED — WIN  ✅   (or LOSS ❌)
        ──────────────────────────
        Pair:      BTC/USDT
        Entry:     $43,250.00
        Exit:      $43,820.00
        Peak:      $43,900.00
        Reason:    TRAILING_SL
        P&L:       +$0.013 (+1.31%)
        Hold time: 8 min 22 sec
        Balance:   $10.013
        """

    async def send_daily_summary(self, stats: dict):
        """
        Sent daily at midnight UTC.
        
        📊 DAILY SUMMARY — 2024-01-15
        ──────────────────────────────
        Trades today:  12
        Wins:          8 (66.7%)
        Losses:        4 (33.3%)
        Total P&L:     +$0.089
        Best trade:    +1.41%
        Worst trade:   -0.82%
        Avg hold:      11.2 min
        Balance EOD:   $10.089
        """

    async def send_error(self, error_msg: str):
        """
        ⚠️ BOT ERROR
        ──────────
        {error_msg}
        Time: {UTC timestamp}
        """

    async def send_bot_started(self):
        """🤖 CryptoBot Pro started. Scanning BTC/USDT on 1m..."""

    async def send_bot_stopped(self, reason: str):
        """🛑 CryptoBot Pro stopped. Reason: {reason}"""

    async def send_test_message(self):
        """✅ Telegram connection working. CryptoBot Pro is connected."""
```

### 8.2 Telegram Bot Commands (optional interactive bot)

If `TELEGRAM_BOT_COMMANDS=true` in .env, also set up command handlers:

- `/status` — returns current bot status, balance, open trade info
- `/stop` — gracefully stops the bot (requires confirmation)
- `/start` — starts the bot if stopped
- `/today` — sends today's summary on demand
- `/balance` — fetches and returns current MEXC balance

---

## 9. Module 5 — Database Layer

### 9.1 `db/models.py` — SQLAlchemy Models

```python
class Trade(Base):
    __tablename__ = "trades"
    
    id: int (primary key, autoincrement)
    symbol: str                    # "BTC/USDT"
    entry_time: datetime
    exit_time: Optional[datetime]
    entry_price: float
    exit_price: Optional[float]
    peak_price: Optional[float]    # highest price reached during trade
    qty: float                     # units bought
    trade_usdt: float              # USDT value of trade (always ~1.0)
    trailing_sl_final: Optional[float]  # TSL level at exit
    take_profit_price: float
    hard_sl_price: float
    trail_pct: float               # config value used for this trade
    pnl_usdt: Optional[float]      # realized P&L in USDT
    pnl_pct: Optional[float]       # realized P&L as percentage
    exit_reason: Optional[str]     # "TAKE_PROFIT" / "TRAILING_SL" / "HARD_SL" / "TIMEOUT"
    status: str                    # "OPEN" / "CLOSED"
    entry_order_id: str
    exit_order_id: Optional[str]
    entry_fee: float
    exit_fee: float
    tsl_update_count: int          # how many times TSL moved up
    is_backtest: bool              # True for backtest trades, False for live


class DailyStats(Base):
    __tablename__ = "daily_stats"
    
    id: int (primary key)
    date: date (unique)
    total_trades: int
    winning_trades: int
    losing_trades: int
    pnl_usdt: float
    pnl_pct: float
    best_trade_pct: float
    worst_trade_pct: float
    avg_hold_minutes: float
    starting_balance: float
    ending_balance: float


class BotLog(Base):
    __tablename__ = "bot_logs"
    
    id: int (primary key)
    timestamp: datetime
    level: str              # "INFO" / "SIGNAL" / "OPEN" / "CLOSE" / "TSL" / "ERROR"
    message: str
    trade_id: Optional[int]  # FK to trades.id if log is trade-related


class Config(Base):
    __tablename__ = "config"
    
    key: str (primary key)
    value: str
    updated_at: datetime
```

### 9.2 `db/crud.py` — DB Operations

Implement async functions for:

```python
# Trades
async def create_trade(db, trade_data: dict) -> Trade
async def update_trade(db, trade_id: int, update_data: dict) -> Trade
async def get_trade(db, trade_id: int) -> Optional[Trade]
async def get_trades(db, limit: int, offset: int, filters: dict) -> list[Trade]
async def get_open_trade(db) -> Optional[Trade]
async def get_trades_csv(db) -> str   # returns CSV string

# Stats
async def get_session_stats(db) -> dict
async def get_daily_stats(db, date: date) -> Optional[DailyStats]
async def upsert_daily_stats(db, date: date, stats: dict) -> DailyStats
async def get_all_daily_stats(db) -> list[DailyStats]
async def get_equity_curve(db) -> list[dict]   # [{timestamp, equity_usdt}]

# Logs
async def save_log(db, level: str, message: str, trade_id: Optional[int] = None)
async def get_recent_logs(db, limit: int = 200) -> list[BotLog]

# Config
async def get_config(db) -> dict
async def set_config(db, key: str, value: str)
async def bulk_set_config(db, config: dict)
```

---

## 10. Module 6 — Configuration System

### 10.1 `core/config.py` — Pydantic Settings

```python
class Settings(BaseSettings):
    # Exchange
    mexc_api_key: str
    mexc_api_secret: str
    sandbox_mode: bool = False
    
    # Trading
    symbol: str = "BTC/USDT"
    timeframe: str = "1m"
    trade_usdt: float = 1.0
    
    # Strategy
    ema_period: int = 50
    rsi_period: int = 14
    rsi_oversold: float = 30.0
    bb_period: int = 20
    bb_std: float = 2.0
    volume_multiplier: float = 1.5
    
    # Risk / exits
    trail_pct: float = 0.008        # 0.8%
    take_profit_pct: float = 0.012  # 1.2%
    hard_sl_pct: float = 0.008      # 0.8%
    max_hold_minutes: int = 30
    
    # Rate limits
    cooldown_seconds: int = 120
    max_trades_per_hour: int = 6
    max_daily_drawdown_pct: float = 0.05   # stop trading if down 5% today
    
    # Telegram
    telegram_token: str = ""
    telegram_chat_id: str = ""
    telegram_bot_commands: bool = False
    
    # API server
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
```

Config is loaded once at startup. If bot is running, config changes (via Settings page) take effect on next trade — never mid-trade.

---

## 11. Module 7 — Logging & Alerting

### 11.1 Logging architecture

Use Python's standard `logging` module with a custom handler that:
1. Writes to rotating file (`logs/bot.log`, max 10MB, keep 5 backups)
2. Writes to stdout (for systemd journal)
3. Saves to `BotLog` table in SQLite (for dashboard log feed)
4. Broadcasts to all WebSocket clients (for live log feed in dashboard)

Log levels and colors for dashboard display:
- `INFO` → gray — routine scan messages
- `SIGNAL` → blue — entry conditions met
- `OPEN` → green — trade opened
- `TSL` → teal — trailing stop updated  
- `CLOSE` → yellow — trade closed
- `ERROR` → red — exceptions, API errors

### 11.2 WebSocket event types

The FastAPI WebSocket endpoint (`/ws`) broadcasts JSON messages. Build a `WebSocketManager` class that maintains a list of connected clients and has a `broadcast(message: dict)` method.

Message types:

```json
// Live price update (every 5s)
{"type": "price_update", "data": {"price": 43250.0, "timestamp": "..."}}

// Candle update (every 60s or on new candle)  
{"type": "candle_update", "data": {"candles": [...], "indicators": {...}}}

// Bot state update (when anything changes)
{"type": "bot_state", "data": {
    "running": true,
    "trade_open": true,
    "entry_price": 43250.0,
    "current_price": 43820.0,
    "trailing_sl": 43469.0,
    "take_profit_price": 43769.0,
    "unrealized_pnl_pct": 1.31,
    "peak_price": 43900.0,
    "last_rsi": 28.4,
    "last_ema50": 43100.0,
    "session_trades": 3,
    "session_wins": 2,
    "session_pnl_usdt": 0.021
}}

// Log entry (on every log event)
{"type": "log_entry", "data": {"level": "OPEN", "message": "...", "timestamp": "..."}}

// Trade opened
{"type": "trade_opened", "data": {trade object}}

// Trade closed
{"type": "trade_closed", "data": {trade object with pnl}}

// TSL updated
{"type": "tsl_updated", "data": {"old_tsl": 42904.0, "new_tsl": 43469.0, "peak": 43900.0}}
```

---

## 12. API Reference

All endpoints prefixed with `/api`. FastAPI auto-generates docs at `/api/docs`.

### Bot control

```
GET  /api/bot/status          → current BotState as JSON
POST /api/bot/start           → starts the bot loop (background task)
POST /api/bot/stop            → sets state.running=False, bot exits cleanly
GET  /api/bot/balance         → fetch MEXC balance via ccxt
```

### Trades

```
GET  /api/trades              → list trades, query params: limit, offset, symbol, 
                                status, exit_reason, date_from, date_to, sort_by, sort_dir
GET  /api/trades/{id}         → single trade by ID
GET  /api/trades/export       → returns CSV file download (Content-Disposition header)
```

### Stats

```
GET  /api/stats               → session + all-time aggregate stats
GET  /api/stats/daily         → list of DailyStats records
GET  /api/stats/equity-curve  → [{timestamp, equity_usdt}] for chart
```

### Candles

```
GET  /api/candles             → last 60 candles with indicators
                                query: symbol, timeframe
```

### Backtest

```
POST /api/backtest            → body: {symbol, timeframe, start_date, end_date, 
                                       trail_pct, take_profit_pct, hard_sl_pct, 
                                       max_hold_minutes}
                                returns BacktestResult JSON
                                (runs synchronously, may take 5-30s)
```

### Config

```
GET  /api/config              → return current config (mask API secrets)
POST /api/config              → update config, body: partial config dict
POST /api/config/test-telegram → send test message, return {success: bool}
```

### Logs

```
GET  /api/logs                → recent logs, query: limit (default 200), level
```

### WebSocket

```
WS   /ws                      → bidirectional WebSocket connection
                                server → client: all message types above
                                client → server: {"type": "ping"} only
```

---

## 13. Environment Variables

Create `.env` file at project root. **Never commit this file.**

```bash
# .env — copy from .env.example and fill in

# Exchange credentials
MEXC_API_KEY=your_api_key_here
MEXC_API_SECRET=your_api_secret_here
SANDBOX_MODE=false

# Trading settings
SYMBOL=BTC/USDT
TRADE_USDT=1.0
TRAIL_PCT=0.008
TAKE_PROFIT_PCT=0.012
HARD_SL_PCT=0.008
MAX_HOLD_MINUTES=30
COOLDOWN_SECONDS=120
MAX_TRADES_PER_HOUR=6
MAX_DAILY_DRAWDOWN_PCT=0.05

# Telegram (get token from @BotFather, chat_id from @userinfobot)
TELEGRAM_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
TELEGRAM_BOT_COMMANDS=false

# API server
API_HOST=0.0.0.0
API_PORT=8000
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Database
DATABASE_URL=sqlite+aiosqlite:///./cryptobot.db
```

---

## 14. Deployment Guide

### 14.1 `requirements.txt` (backend)

```
ccxt>=4.0.0
fastapi>=0.110.0
uvicorn[standard]>=0.27.0
sqlalchemy[asyncio]>=2.0.0
aiosqlite>=0.19.0
apscheduler>=3.10.0
python-telegram-bot>=20.0
pandas>=2.0.0
pandas-ta>=0.3.14b
numpy>=1.24.0
python-dotenv>=1.0.0
pydantic-settings>=2.0.0
websockets>=12.0
```

### 14.2 `package.json` (frontend)

```json
{
  "name": "cryptobot-dashboard",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "recharts": "^2.10.0",
    "lightweight-charts": "^4.1.0",
    "axios": "^1.6.0",
    "zustand": "^4.5.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

### 14.3 `nginx.conf`

```nginx
server {
    listen 80;
    server_name your-vps-ip-or-domain;

    # React frontend (built files)
    location / {
        root /var/www/cryptobot/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # FastAPI backend (REST + WebSocket)
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### 14.4 `cryptobot.service` (systemd)

```ini
[Unit]
Description=CryptoBot Pro Trading Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/cryptobot/backend
Environment=PATH=/home/ubuntu/cryptobot/venv/bin
ExecStart=/home/ubuntu/cryptobot/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 14.5 Initial setup commands (run on VPS)

```bash
# Clone / upload project
git clone <your-repo> cryptobot && cd cryptobot

# Backend setup
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Copy and fill env file
cp .env.example .env
nano .env   # fill in API keys and Telegram details

# Frontend build
cd frontend
npm install
npm run build
cd ..

# Copy built frontend to nginx serve location
sudo mkdir -p /var/www/cryptobot/frontend
sudo cp -r frontend/dist/* /var/www/cryptobot/frontend/

# Install and start systemd service
sudo cp cryptobot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cryptobot
sudo systemctl start cryptobot

# Nginx setup
sudo cp nginx.conf /etc/nginx/sites-available/cryptobot
sudo ln -s /etc/nginx/sites-available/cryptobot /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 15. Testing Requirements

### 15.1 Unit tests (`backend/tests/`)

Write pytest tests for:

```
tests/
├── test_strategy.py       # test compute_indicators, check_entry_signal, check_exit
│                          # use synthetic DataFrame with known values
│                          # assert correct signal on known RSI/BB/EMA combos
├── test_risk.py           # test calculate_position_qty, check_rate_limits
├── test_backtest.py       # run backtest on 30 days of synthetic data
│                          # assert BacktestResult fields are populated and valid
├── test_notify.py         # mock Telegram API, assert message formats
└── test_api.py            # use FastAPI TestClient
                           # test every endpoint returns correct status codes
```

### 15.2 Pre-live checklist

Before switching `SANDBOX_MODE=false`:

- [ ] Ran backtest on at least 90 days of BTC/USDT 1m data
- [ ] Backtest shows positive profit factor (> 1.0)
- [ ] Backtest max drawdown < 10%
- [ ] Paper traded for at least 3 days (sandbox mode) with no crashes
- [ ] Telegram notifications verified working
- [ ] Dashboard showing live data correctly
- [ ] Balance fetch returning correct MEXC account balance
- [ ] Stop/start bot via dashboard working
- [ ] Systemd service auto-restarts after kill test (`sudo kill -9 <pid>`)

---

## 16. Risk & Safety Rules

These rules must be **hardcoded**, not configurable. Claude Code must implement them as unbypassable guards in `bot.py`:

1. **Never exceed $1 USDT per trade.** `qty` calculation must always use `min(config.trade_usdt, 1.0)`.

2. **Never open a second trade while one is open.** Check `state.trade_open` before every entry attempt.

3. **Never disable the hard stop loss.** Even if TSL is active, hard SL is always set and monitored.

4. **API key must never have withdrawal permission.** Add a warning on startup that checks if withdrawal is enabled (ccxt can detect this) and refuses to start if so.

5. **Stop all trading if daily drawdown exceeds 5%.** Calculate `(starting_balance - current_balance) / starting_balance` at each scan. If > 0.05, set `state.running = False` and send Telegram alert.

6. **All exceptions in the bot loop must be caught and logged** — the loop must never crash. Use a top-level `try/except Exception as e` with 10-second sleep on error.

7. **Never place a real order if `SANDBOX_MODE=true`** is not the only protection — also maintain a `DRY_RUN` flag in state that can be set via dashboard without restarting.

8. **Timeout all exchange API calls** — wrap every ccxt call with `asyncio.wait_for(..., timeout=10)`. If timeout, log error and skip this iteration.

9. **Before going live, always validate minimum order size.** On startup, fetch `exchange.markets[symbol]['limits']['amount']['min']` and assert `trade_qty >= min_amount`. Alert if not.

10. **Log every single order attempt**, including the full order dict returned by ccxt. Store in `BotLog` with level `"ORDER"` and the raw JSON.

---

*End of PRD. This document is complete and self-contained. Claude Code should be able to build the entire project from this specification without additional clarification.*
