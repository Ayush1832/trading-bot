# CryptoBot Pro — Complete Project Documentation

A fully automated, single-position cryptocurrency **swing trading** system built on a
multi-timeframe confluence strategy. It trades Bybit spot, enforces a strict
risk budget (max **$1.00** per trade, **1 trade/day**, **5%** daily drawdown halt),
and ships with a real-time "trading terminal" web dashboard.

> ⚠️ **Real-money software.** This bot can place live orders with real funds.
> Read [§14 Risk & Known Limitations](#14-risk--known-limitations) before going live.

---

## Table of Contents

1. [What the bot does](#1-what-the-bot-does)
2. [Architecture](#2-architecture)
3. [Technology stack](#3-technology-stack)
4. [The Precision Swing Strategy](#4-the-precision-swing-strategy)
5. [Entry: levels, R:R, grading, selection](#5-entry-levels-rr-grading-selection)
6. [Exit logic](#6-exit-logic)
7. [Position sizing & fees](#7-position-sizing--fees)
8. [Risk management & safety systems](#8-risk-management--safety-systems)
9. [The bot loop lifecycle](#9-the-bot-loop-lifecycle)
10. [Paper trading](#10-paper-trading)
11. [Backtesting engine](#11-backtesting-engine)
12. [Data model & persistence](#12-data-model--persistence)
13. [In-memory state](#13-in-memory-state)
14. [Risk & known limitations](#14-risk--known-limitations)
15. [API reference](#15-api-reference)
16. [WebSocket protocol](#16-websocket-protocol)
17. [Frontend (trading terminal)](#17-frontend-trading-terminal)
18. [Configuration reference](#18-configuration-reference)
19. [Scheduler & Telegram](#19-scheduler--telegram)
20. [Running locally](#20-running-locally)
21. [Deployment](#21-deployment)
22. [Repository layout](#22-repository-layout)

---

## 1. What the bot does

CryptoBot Pro scans a small watchlist of liquid crypto pairs every 15 minutes. For
each symbol it evaluates a **5-condition, 4-timeframe confluence** model. When **all
required conditions align** on a symbol *and* the reward-to-risk ratio is at least
**3:1**, it opens a single long spot position sized at a hard-capped **$1.00**.

Once in a trade it monitors every 15 seconds and manages a **split exit**:

- **TP1** — sell 50% at the first target, then move the stop to breakeven.
- **TP2** — let the remaining 50% run to a 5:1 target.
- An **ATR-based trailing stop** ratchets up underneath the runner.
- A resting **exchange-side stop-loss** protects the position even if the bot is offline.

It is deliberately conservative: **one trade per day maximum**, **5% daily
drawdown halt**, and a **72-hour** hold timeout. Everything is observable in real time
through a dashboard and optional Telegram alerts.

**Operating modes**
- **Paper (dry-run)** — simulated fills against an in-memory balance; auto-enabled
  when no API keys are configured.
- **Testnet (sandbox)** — Bybit testnet with real API calls but fake money.
- **Live** — Bybit mainnet, real funds.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                            │
│   React + Vite "Trading Terminal"  ── REST /api + WebSocket /ws  │
└───────────────────────────────┬─────────────────────────────────┘
                                 │
┌───────────────────────────────▼─────────────────────────────────┐
│                       FastAPI backend (one process)              │
│                                                                  │
│  ┌────────────┐   ┌─────────────┐   ┌──────────────────────┐     │
│  │  REST API  │   │  WebSocket  │   │  APScheduler (daily) │     │
│  │  routers   │   │  manager    │   │  00:00 UTC reset     │     │
│  └────────────┘   └─────────────┘   └──────────────────────┘     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   bot_loop()  — single asyncio task, the trading engine   │   │
│  │   scan (15 min)  →  enter  →  monitor (15 s)  →  exit      │   │
│  └───────────┬───────────────────────────┬──────────────────┘   │
│              │                            │                      │
│   ┌──────────▼─────────┐      ┌───────────▼──────────┐           │
│   │  strategy.py        │      │  exchange.py (ccxt)  │           │
│   │  5-condition model  │      │  Bybit spot orders   │           │
│   └─────────────────────┘      └───────────┬──────────┘          │
│   ┌─────────────────────┐                  │                     │
│   │  risk.py / state.py  │      ┌───────────▼──────────┐          │
│   │  guards & memory     │      │  SQLite (SQLAlchemy) │          │
│   └─────────────────────┘      └──────────────────────┘          │
│   ┌─────────────────────┐      ┌──────────────────────┐          │
│   │  paper_trading.py    │      │  notify.py (Telegram)│          │
│   └─────────────────────┘      └──────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
                                 │
                       Bybit REST API (ccxt)  +  Telegram Bot API
```

**Key architectural facts**
- The trading engine is a **single long-running `asyncio` task** (`bot_loop`) launched
  in-process via `asyncio.create_task` when `POST /api/bot/start` is called.
- All live trade state lives in a **single in-memory `BotState` singleton**
  (thread-safe via a lock). The bot **cannot be horizontally scaled** — exactly one
  instance must run.
- Durable data (trades, logs, daily stats, config overrides) is persisted in **SQLite**.
- The frontend never talks to the exchange — it only consumes the backend's REST + WS.

---

## 3. Technology stack

| Layer | Technology |
|---|---|
| Language (backend) | Python **3.13** (pandas-ta is incompatible with 3.14) |
| Web framework | FastAPI + Uvicorn (ASGI) |
| Exchange client | ccxt (async), Bybit spot |
| Indicators | pandas, pandas-ta, numpy |
| Database | SQLite via SQLAlchemy 2.0 async + aiosqlite |
| Scheduling | APScheduler (AsyncIOScheduler, UTC) |
| Notifications | python-telegram-bot |
| Config | pydantic-settings (`.env`) |
| Frontend | React 18 + Vite 5 |
| Routing/state | react-router-dom, Zustand |
| Charts | lightweight-charts (candles), Recharts (analytics) |
| Styling | Tailwind CSS (custom design tokens) |

Backend dependencies are pinned in `cryptobot/backend/requirements.txt`.

---

## 4. The Precision Swing Strategy

The strategy is a **top-down, multi-timeframe confluence** model. It only goes
**long**, and only when the macro trend, the pullback structure, the momentum
reversal, and the short-term trigger all agree. All logic lives in
`cryptobot/backend/strategy.py`.

> **Candle convention:** every condition evaluates the **last *fully closed* candle**
> using `df.iloc[-2]` (index `-1` is the still-forming live candle and is ignored).

There are **5 conditions** across **4 timeframes**. Four are **required** (a hard gate);
the fifth is **advisory** and only sets the trade's quality grade.

### Condition 1 — Weekly macro trend `[1W]` *(required)*
Function: `check_weekly_trend(weekly_df)`

- Requires ≥ **210** weekly candles.
- Computes **EMA200** on weekly closes.
- **Pass when both:**
  1. Last closed weekly close **> weekly EMA200** (`above_ema200`), and
  2. **Higher highs** — the last 3 closed weekly highs are strictly ascending
     (`h1 > h2 > h3`).
- Failure reasons: `insufficient_data`, `ema200_nan`, `below_ema200`, `no_higher_highs`.

*Purpose: only trade symbols in a confirmed long-term uptrend.*

### Condition 2 — Daily Fibonacci pullback structure `[1D]` *(required)*
Function: `check_daily_structure(daily_df, tolerance=0.015)`

- Requires ≥ **220** daily candles.
- Computes daily **EMA50** and **EMA200**.
- Determines the swing **high/low** from the last **50 closed daily candles**
  (`df.iloc[-52:-2]`).
- Computes three Fibonacci retracement levels of that range:
  - **38.2%** = `swing_high − range × 0.382`
  - **50.0%** = `swing_high − range × 0.500`
  - **61.8%** = `swing_high − range × 0.618`
- **Pass when both:**
  1. **EMA50 > EMA200** (daily uptrend), and
  2. Price is within **`tolerance`** (default **1.5%**) of one of the three Fib levels
     (i.e. price has *pulled back into* the golden retracement zone).
- Reports `fib_zone` (the matched level) and `nearest_fib`.
- Failure reasons: `insufficient_data`, `ema_nan`, `invalid_swing`, `no_fib_zone`,
  `no_ema_uptrend`.

*Purpose: buy strength on a healthy retracement, not at the top.*

### Condition 3 — 4H RSI bullish divergence `[4H]` *(required)*
Function: `check_4h_divergence(h4_df, max_age_candles=8, min_rsi_level=50.0)`

- Requires ≥ **30** 4H candles. Computes **RSI(14)**.
- Searches a window of the last `max_age_candles × 3 + 5` candles for **local minima**
  in both price lows and RSI.
- Takes the two most recent price-low minima and two most recent RSI minima.
- **Pass when all three:**
  1. **Price lower low** — `p2 < p1` (price made a lower low),
  2. **RSI higher low** — `rsi2 > rsi1` (RSI made a higher low → bullish divergence),
  3. **RSI oversold** — `rsi2 < min_rsi_level` (default **50**).
- `divergence_strength = rsi2 − rsi1` (used for ranking ties).
- Failure reasons: `insufficient_data`, `window_too_small`, `no_minima`, `rsi_nan`,
  `no_price_lower_low`, `no_rsi_higher_low`, `rsi_not_oversold`.

*Purpose: confirm selling pressure is exhausting and a reversal is underway.*

### Condition 4 — 4H momentum & seller exhaustion `[4H]` *(advisory — sets grade)*
Function: `check_4h_momentum(h4_df, weak_seller_ratio=0.85)`

- Computes **MACD(12,26,9)**. Detects a **bullish cross** (MACD crossing above signal)
  within the last ~5 closed candles. Column detection is robust to pandas-ta naming.
- Detects **weak sellers**: the last closed candle is **green** *and* its volume is
  **below `weak_seller_ratio` × the 20-bar average volume** (default 85%).
- **Grade:**
  - **A+** → MACD cross **and** weak sellers
  - **A**  → MACD cross only
  - **B**  → neither
- This condition **always returns `ok: True`** — it never blocks entry. Grade is used
  only to rank competing signals and as a quality label.

### Condition 5 — 1H Break of Structure (entry trigger) `[1H]` *(required)*
Function: `check_1h_entry_trigger(h1_df, lookback=10)`

- Requires ≥ `lookback + 5` 1H candles.
- Computes the swing high = highest high of the **10 candles before** the last closed
  candle (`h1_df.iloc[-(lookback+2):-2]`).
- **Pass when** the last closed 1H **close > that swing high** (a confirmed break of
  structure — buyers have absorbed the pullback and resumed the uptrend).
- Failure reason: `no_bos`.

*Purpose: precise timing — don't enter until the short-term structure turns up.*

### The gate
In `check_entry_signal(...)` a signal fires **only if**:

```
weekly.ok  AND  daily.ok  AND  h4_divergence.ok  AND  h1_bos.ok
AND computed R:R ≥ min_rr_ratio (default 3.0)
```

`h4_momentum` is *not* in the gate — it only contributes the grade.

---

## 5. Entry: levels, R:R, grading, selection

When the gate passes, `check_entry_signal` computes the trade plan:

| Level | Formula |
|---|---|
| **Entry** | last closed 1H close (`h1_df.iloc[-2].close`) |
| **Stop-loss (SL)** | lowest low of the last 20 1H candles (`iloc[-22:-2]`) × **0.999** (0.1% buffer) |
| **Risk per unit** | `entry − SL` (must be > 0) |
| **TP1** | `max(entry + risk × 3.0, 4H resistance)` where 4H resistance = 90th-percentile high of the last ~52 4H candles (if above entry) |
| **TP2** | `entry + risk × 5.0` (runner target) |
| **1H ATR** | `ATR(14)` on 1H, last closed value — used to size the trailing stop |

**Reward-to-risk** = `(TP1 − entry) / (entry − SL)`, rounded to 2 dp
(`compute_rr_ratio`). If `R:R < min_rr_ratio` (default **3.0**) the signal is rejected
even if all conditions passed.

**Signal selection** (`select_best_signal`) — when multiple symbols fire in the same
scan, the winner is chosen by:
1. **Grade** — A+ > A > B
2. **R:R** — higher is better
3. **Divergence strength** — higher is better
4. **Symbol name** — alphabetical (deterministic tiebreak)

---

## 6. Exit logic

Exit decisions are made by `check_exit(...)` every 15 seconds while a position is open.
The position has two phases.

### Phase 1 — before TP1 (`half_exited = False`)
- **TP1_PARTIAL** — if `current_price ≥ tp1_price` → sell 50%, move stop to breakeven.
- **HARD_SL** — if `current_price ≤ trailing_sl` **or** `≤ sl_price` → full exit.

### Phase 2 — after TP1 (`half_exited = True`, 50% remaining)
- **TAKE_PROFIT_2** — if `current_price ≥ tp2_price` → close runner.
- **TRAILING_SL** — if `current_price ≤ trailing_sl` → close runner.
- **BREAKEVEN_SL** — if `current_price ≤ sl_price` (now = entry) → close runner.

### Always
- **TIMEOUT** — if held ≥ `max_hold_hours` (default **72h**) → force close.

### The TP1 partial exit (`execute_tp1_partial`)
1. Re-entrancy guard: sets `half_exited = True` **before** the async sell and uses an
   `exit_in_progress` flag, so a slow/ambiguous fill cannot trigger a second sell.
2. Cancels the resting exchange stop (frees the reserved asset on spot).
3. Market-sells **50%** of the position.
4. Records TP1 P&L, moves `sl_price` to **breakeven** (entry price).
5. **Re-arms** a resting exchange stop on the remaining 50% at breakeven.
6. If the sell fails: rolls back the guard, re-arms the full-size stop, and retries
   next tick.

### The ATR trailing stop (`compute_atr_tsl`)
```
new_tsl = peak_price − (atr_1h × atr_1h_multiplier)      # multiplier default 1.5
trailing_sl = max(new_tsl, current_trailing_sl)          # NEVER decreases
```
The trailing stop ratchets up as a new peak price is reached and is **monotonic
(one-directional)** — it can only rise, never loosen.

### P&L accounting
- `pnl_usdt` = the **final leg** only.
- `tp1_pnl_usdt` = the realized TP1 partial.
- `total_pnl_usdt` = TP1 partial **+** final leg (the true trade result; used in stats,
  equity curve, and win/loss determination).

---

## 7. Position sizing & fees

`risk.calculate_position_qty(usdt_amount, price, min_qty, fee_rate=0.001)`

```
capped  = min(usdt_amount, MAX_TRADE_USDT)        # MAX_TRADE_USDT = 1.0, hard cap
raw_qty = capped / (price × (1 + fee_rate))        # fee-aware: notional + fee ≤ budget
qty     = floor(raw_qty × 1e8) / 1e8               # round down to 8 dp
return 0.0 if qty < min_qty                        # below exchange minimum → skip trade
```

- **Hard cap of $1.00** is enforced in two places (`risk.MAX_TRADE_USDT` and the bot
  loop's `min(config.trade_usdt, 1.0)`), independent of any config value.
- **Fee-aware:** the budget covers notional **+** the entry taker fee, so a $1 trade
  never overshoots available balance.
- **Taker fee** = `config.taker_fee_rate` = **0.001 (0.1%)** — Bybit spot taker. Used
  consistently for sizing and for entry/exit/TP1 P&L. (Paper trader uses the same
  `PAPER_FEE_RATE = 0.001`.)

---

## 8. Risk management & safety systems

All protections are **always on**. They are surfaced in the dashboard's Risk page.

| Protection | Rule | Where |
|---|---|---|
| Position cap | **$1.00** maximum per trade | `risk.MAX_TRADE_USDT`, bot loop |
| Hard stop-loss | structural stop below entry on every trade | `strategy`, bot loop |
| **Exchange-side stop** | a resting stop order on Bybit so the trade is protected even if the bot is **stopped/asleep/crashed** | `exchange.place_stop_loss`, bot loop |
| ATR trailing stop | `peak − ATR×1.5`, ratchets up only | `compute_atr_tsl` |
| Breakeven lock | stop → entry after TP1 fills | `execute_tp1_partial` |
| Daily drawdown halt | trading stops at **−5%** of starting balance | `check_daily_drawdown` |
| Trade frequency gate | **1 entry per UTC day** maximum | `state.trade_opened_today` |
| Hold timeout | force exit after **72h** | `check_exit` |
| R:R floor | minimum **3:1** reward-to-risk to enter | `check_entry_signal` |
| Balance guard | skip entry if balance < `trade_usdt × 1.1` | bot loop |
| No-withdrawal | API key never needs withdrawal permission | operational |

### Safety hardening (the catastrophe-floor design)
Because the strategy's *smart* exits (TP1/TSL/TP2/timeout) are computed **in the
process loop**, a dead/asleep process would otherwise leave a position unmanaged. To
prevent unbounded loss the bot also places a **resting exchange stop-loss**:

- **On entry** — a stop-market sell for the full position at the hard SL is placed on
  Bybit (`use_exchange_stop_loss = True`). It survives a process crash or a sleeping
  laptop. Placement is **best-effort**: if it fails, the bot alerts and continues with
  the in-process stop.
- **Spot sequencing** — a resting stop reserves the base asset, so the bot **cancels
  it before any bot-driven sell** and **re-arms** it afterward (half size + breakeven
  after TP1).
- **Reconciliation** — each monitor tick checks whether the resting stop *already
  filled* (e.g. price gapped through it while the bot was down). If so, the close is
  recorded as `HARD_SL`/`BREAKEVEN_SL`.
- **Sell-failure escalation** — a failed market-sell re-arms the protective stop,
  increments a retry counter, sends a **CRITICAL** alert at `max_sell_retries`
  (default 5), and retries — it never abandons a position or strands it as silently
  `OPEN`.
- **Crash recovery** — on restart, `recover_open_trade` restores full state (including
  the resting stop id) from the DB and resumes monitoring.

---

## 9. The bot loop lifecycle

`bot_loop()` in `cryptobot/backend/bot.py`. Two cadences:

- **`SCAN_INTERVAL` = 900s (15 min)** — full 4-timeframe scan when flat.
- **`MONITOR_INTERVAL` = 15s** — price/exit checks when in a position (and the loop's
  base tick).

### Startup
1. Log strategy parameters, send "bot started" Telegram message.
2. `recover_open_trade` — resume any `OPEN` trade from the DB.
3. Fetch per-symbol minimum order amounts.
4. Read starting balance (live) or paper balance; if balance fetch fails, default to
   $10 for the session and warn.

### Flat (no open trade) — every loop tick
1. If `trade_opened_today` or `daily_halted` → skip entry (still refresh the scanner
   display every 15 min).
2. Balance guard, then daily-drawdown guard.
3. Only run the full scan every `SCAN_INTERVAL`; otherwise just broadcast state.
4. `scan_all_symbols` — fetch 1W/1D/4H/1H for every symbol **in parallel**, run
   `check_entry_signal`, update the scanner panel, count signals.
5. `select_best_signal` → fetch live ask → size the position → place a **marketable
   limit buy** → poll for fill (`check_order_filled`, timeout **120s**).
6. On fill: persist the trade, set state, place the **resting exchange stop**, notify,
   broadcast.

> Weekly candles are **cached** (`_weekly_cache`) and only refetched when a new weekly
> candle closes — saving hundreds of API calls per scan.

### In a position — every 15s
1. Snapshot state.
2. **Reconcile** the resting stop (did it fill while we weren't selling?).
3. Fetch current price; update unrealized P&L.
4. Update peak price and ratchet the ATR trailing stop (persist + notify on a
   meaningful move).
5. `check_exit` → `TP1_PARTIAL` (partial) or a full-exit reason.
6. Full exit: set `exit_in_progress`, cancel the resting stop, market-sell the
   remainder (with retry/escalation), then `_finalize_full_close` records everything.

### `_finalize_full_close`
A single source of truth for closing bookkeeping (used by both the loop exit and the
stop-fill reconciliation): writes the DB row (`CLOSED`, P&L, fees, reason), resets all
in-memory position state, updates session/daily counters and win/loss, logs, notifies,
and broadcasts.

### Error handling
The whole loop body is wrapped in a try/except: any unexpected error is logged, sent
to Telegram, and the loop sleeps 10s and continues (never silently dies).

---

## 10. Paper trading

`cryptobot/backend/paper_trading.py` — a `PaperTrader` singleton that mirrors the
exchange interface with simulated fills:

- Starting balance **$10** (in-memory; reset on restart).
- `simulate_limit_buy` (instant fill, rejects on insufficient balance),
  `simulate_market_sell`, `open_trade`, `close_trade`, `get_stats`, `reset`.
- Fee **0.1%** (`PAPER_FEE_RATE`).
- Auto-enabled at startup when no real API keys are configured (or placeholder keys).
  In that case the exchange client is constructed **keyless** so public market data
  (candles, tickers) still works while no private calls are attempted.

---

## 11. Backtesting engine

`cryptobot/backend/backtest.py`, exposed via `POST /api/backtest`.

- Fetches 1H base data for the range and **resamples** to 4H/1D/1W internally
  (so it reuses the exact same `strategy.py` condition functions as the live bot).
- Requires ~1 year of history **before** the start date for indicator warm-up
  (weekly EMA200).
- Simulates the full split-exit model (TP1 partial, breakeven, ATR TSL, TP2, timeout)
  and the **1-trade-per-day** rule.
- Returns a `BacktestResult`: total/winning/losing trades, win rate, total P&L (USDT
  and %), fees, avg win/loss %, **max drawdown %**, **profit factor**, **Sharpe**, avg
  hold minutes, TP1/TP2 hit counts, avg R:R achieved, grade & exit-reason breakdowns,
  the full **trade list**, and the **equity curve**.
- The dashboard renders this as equity + drawdown charts, a monthly-returns heatmap,
  an exit-reason distribution, and a trade table.

---

## 12. Data model & persistence

SQLite at `sqlite+aiosqlite:///./cryptobot.db` (relative to `cryptobot/`), via
SQLAlchemy 2.0 async. Tables (`cryptobot/backend/db/models.py`):

### `trades`
The central record. Key columns:

- **Identity/timing:** `id`, `symbol`, `entry_time`, `exit_time`, `is_backtest`
- **Prices:** `entry_price`, `exit_price`, `peak_price`
- **Sizing:** `qty`, `trade_usdt`, `entry_fee`, `exit_fee`
- **Levels:** `hard_sl_price`, `take_profit_price` (TP1), `tp1_price`, `tp2_price`,
  `trailing_sl_final`, `breakeven_sl`
- **Split exit:** `half_exited`, `tp1_exit_price`, `tp1_exit_time`, `tp1_pnl_usdt`,
  `tp1_order_id`, `tp2_order_id`
- **P&L:** `pnl_usdt`, `pnl_pct` (final leg), `total_pnl_usdt`, `total_pnl_pct` (combined)
- **Orders:** `entry_order_id`, `exit_order_id`, `tp_order_id`, **`sl_order_id`** (resting stop),
  `exchange_orders_active`, `tsl_update_count`
- **Status:** `status` (`OPEN` / `CLOSED`), `exit_reason`
- **Entry snapshot:** `rr_ratio`, `grade`, `entry_divergence_strength`,
  `entry_nearest_fib`, `entry_1h_atr`
- **Legacy scalping columns** (kept nullable for schema compatibility):
  `signal_score`, `entry_rsi`, `entry_ema20/50`, `entry_adx`, `entry_atr`,
  `entry_volume_ratio`

### `daily_stats`
Per-day rollup: `date` (unique), `total/winning/losing_trades`, `pnl_usdt`, `pnl_pct`,
`best/worst_trade_pct`, `avg_hold_minutes`, `starting_balance`, `ending_balance`.

### `bot_logs`
`id`, `timestamp`, `level` (INFO/SIGNAL/OPEN/CLOSE/TSL/ERROR/ORDER/TP1), `message`,
`trade_id`. Backs the dashboard's Activity feed.

### `config`
Key/value store of runtime overrides set via the Settings page; applied over the
`.env` defaults at startup and on save.

**CRUD highlights** (`db/crud.py`): `get_open_trade` uses `scalars().first()` with
`ORDER BY id DESC` to survive duplicate OPEN rows; `get_trades_with_count` powers
paginated journal queries; `get_session_stats` and `get_equity_curve` use
`coalesce(total_pnl_usdt, pnl_usdt)` so split trades are counted correctly.

---

## 13. In-memory state

`BotState` singleton (`cryptobot/backend/core/state.py`), guarded by a `threading.Lock`.
Holds: running/dry-run flags, the open-trade snapshot (symbol, entry, prices, SL/TP/TSL,
qty, grade, R:R, `half_exited`, `sl_order_id`, `exit_in_progress`, `sell_retry_count`),
balance, **session** stats (trades/wins/pnl), **daily** counters (trades/wins/losses/pnl/
signals, `daily_halted`, `trade_opened_today`), and the **scanner** map of
`SymbolScanState` (per-symbol condition booleans, key values, computed levels).
`to_dict()` is what the WebSocket broadcasts as `bot_state`. `reset_daily()` is called
by the scheduler at 00:00 UTC.

---

## 14. Risk & known limitations

**This bot has real financial risk. Understand these before trading live:**

1. **Never validated against a live fill.** As of this writing the code has not executed
   a real order on mainnet. The exchange stop-loss parameters
   (`triggerPrice` + `triggerDirection=2`) follow the Bybit v5 spec but are
   **unverified against the live API**. **On your first live trade, open the Bybit order
   screen and confirm the resting stop order actually appears at your stop price.** If
   the placement fails you'll get a Telegram alert — stop the bot and investigate.
2. **Bybit spot minimum order size.** Some pairs have a minimum notional above **$1.00**.
   If your sized order is below the minimum, the trade is **skipped** (safe, but you'll
   see no entries). This can make a $1-capped bot appear idle.
3. **24/7 uptime is required.** The smart exits run in-process. The resting exchange
   stop is the only protection while the bot is down — it is a *catastrophe floor*, not
   a substitute for keeping the bot running.
4. **Single instance only.** State is in memory; never run two copies against the same
   account.
5. **Ambiguous fills.** If a sell request times out but actually executed, the bot
   alerts rather than risk a double-sell — manual reconciliation may occasionally be
   needed.
6. **SQLite is local.** On an ephemeral container filesystem the DB is wiped on
   redeploy; use a persistent disk or migrate `DATABASE_URL` to Postgres for such hosts.

---

## 15. API reference

All routes are under the **`/api`** prefix. Interactive docs at **`/api/docs`**.

### Bot control — `/api/bot`
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/bot/status` | running / dry-run / open-trade status |
| POST | `/api/bot/start` | launch the trading loop |
| POST | `/api/bot/stop` | stop the loop |
| GET | `/api/bot/balance` | current balance |
| POST | `/api/bot/dry-run` | toggle paper mode |

### Trades — `/api/trades`
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/trades` | paginated list → `{ trades: [...], total: N }`; filters: `limit, offset, symbol, status, exit_reason, date_from, date_to, sort_by, sort_dir` |
| GET | `/api/trades/export` | CSV download |
| GET | `/api/trades/{trade_id}` | single trade detail |

### Stats — `/api/stats`
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stats` | session totals (trades, win rate, total P&L, avg R:R) |
| GET | `/api/stats/daily` | per-day stats rows |
| GET | `/api/stats/equity-curve` | cumulative equity points (split-exit aware) |

### Market data, scanner, backtest, config, paper, system
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/candles` | OHLCV + EMA20/50 + Bollinger for the chart (`symbol`, `timeframe`, `limit`) |
| GET | `/api/scanner` | scanner snapshot + `signals_today` |
| GET | `/api/scanner/symbols` | configured watchlist |
| POST | `/api/backtest` | run a backtest (see §11) |
| GET | `/api/config` | current effective config (secrets masked as `***`) |
| POST | `/api/config` | update config (ignores masked `***` values) |
| POST | `/api/config/test-telegram` | send a Telegram test message |
| GET | `/api/paper/stats` | paper trader stats |
| GET | `/api/paper/trades` | paper trade history |
| POST | `/api/paper/reset` | reset paper balance/history |
| POST | `/api/paper/enable` · `/disable` | toggle paper mode |
| GET | `/api/logs` | recent bot logs (`limit`, `level`) |
| GET | `/api/health` | exchange ping+latency, DB, WS clients, Telegram, bot uptime |
| WS | `/ws` | real-time push channel (see §16) |

---

## 16. WebSocket protocol

Client connects to **`/ws`**; the server immediately pushes the current `bot_state`.
The client sends `{"type":"ping"}` every 30s and receives `{"type":"pong"}`.

**Server → client message types:**
- `bot_state` — full `BotState.to_dict()` (the primary state stream)
- `scanner_update` — per-symbol scan results
- `log_entry` — a new log line (level, message, timestamp)
- `trade_opened` / `trade_closed` — trade lifecycle events
- `tp1_hit` — TP1 partial fired
- `tsl_updated` — trailing stop moved (old/new/peak)
- `price_update` — live price for the open symbol
- `pong` — heartbeat ack

The frontend's `useWebSocket` hook auto-reconnects (3s backoff) and tracks connection
state in the Zustand store for the "STREAM / OFFLINE" indicator.

---

## 17. Frontend (trading terminal)

A React SPA designed as a professional trading terminal (dark, dense, financial-grade).
Source under `cryptobot/frontend/src/`.

### Shell & navigation
- **Left icon rail** (`shell/Sidebar.jsx`): Terminal · Journal · Backtest · Risk · System,
  plus Config at the bottom.
- **Top status bar** (`shell/TopBar.jsx`): app name + mode chip (`PAPER` / `TESTNET` /
  `LIVE · REAL FUNDS`), engine state (SCANNING / IN POSITION / STOPPED), live equity &
  today's P&L, data-stream indicator, and the **START/STOP ENGINE** control (stop is
  confirmed).

### Pages
| Route | Page | Contents |
|---|---|---|
| `/` | **Terminal** | 6-stat strip; live candle chart with SL/TP1/TP2/TSL price lines + symbol tabs; **Position** panel (P&L hero, entry→TP1→TP2 journey bar, price ladder); **Strategy Intelligence** panel; watchlist + activity feed |
| `/journal` | **Trade Journal** | performance summary, filters, sortable table; click a row → slide-in **drawer** with the trade timeline (entry → TP1 → exit), risk profile, entry reasoning, execution detail |
| `/backtest` | **Backtest Lab** | parameter sliders; equity + drawdown charts; monthly-returns heatmap; exit-reason distribution; trade list |
| `/risk` | **Risk Command Center** | verdict banner; drawdown / exposure / trade-slot arc gauges; capital snapshot; the 8 protection systems |
| `/system` | **System Health** | service tiles (API, exchange, stream, DB, Telegram, engine), aggregate status, live exchange-latency history chart |
| `/settings` | **Configuration** | exchange keys + sandbox toggle, watchlist picker, trade sizing, strategy sliders, Telegram — with validation, unsaved-change tracking, and a live-key warning |

### Strategy Intelligence panel (a standout feature)
Translates the raw condition output into the strategy's "thinking": the 5 gates with
timeframe chips, a weighted **signal-strength %**, **humanized blocker reasons** (mapped
from `strategy.py` reason codes, e.g. *"Price hasn't pulled back into the Fib zone"*),
and a `WAITING: …` verdict — so it's always clear *why* a trade is or isn't opening.

### Design system
- Tokens in `tailwind.config.js`: layered **ink** surfaces, hairline **line** borders,
  **tx** text scale, a single **accent** (azure), and semantic **up/down/warn**.
- Reusable primitives in `ui/kit.jsx`: `Panel`, `Stat`, `Chip`, `Dot`, `Meter`,
  `ArcGauge`, `GradeBadge`, `Num` (flashes green/red on value change), formatters.
- Green/red are reserved exclusively for P&L state; motion is used only to explain
  state changes.

### Dev proxy
`vite.config.js` proxies `/api` and `/ws` to `http://localhost:8000`, so the SPA and API
share an origin in development.

---

## 18. Configuration reference

Defaults live in `cryptobot/backend/core/config.py`; overridden by `.env` and by values
saved through the Settings page (stored in the `config` table).

### Exchange
| Key | Default | Notes |
|---|---|---|
| `bybit_api_key` / `bybit_api_secret` | `""` | placeholders/empty → keyless + paper mode |
| `sandbox_mode` | `false` | Bybit testnet when true |

### Watchlist & timeframes
| Key | Default |
|---|---|
| `symbols` | `ETH/USDT, SOL/USDT, AVAX/USDT, LINK/USDT` (running config uses BTC in place of LINK) |
| `symbol` | `ETH/USDT` (primary display) |
| `tf_weekly / tf_daily / tf_4h / tf_1h` | `1w / 1d / 4h / 1h` |
| `scan_interval_seconds` | `900` (15 min) |

### Trade sizing & fees
| Key | Default | Notes |
|---|---|---|
| `trade_usdt` | `1.0` | per-trade budget |
| `max_trade_usdt` | `1.0` | explicit hard cap |
| `taker_fee_rate` | `0.001` | Bybit spot taker (0.1%) |

### Strategy
| Key | Default | Meaning |
|---|---|---|
| `weekly_ema_period` | `200` | weekly trend EMA |
| `daily_ema_fast / slow` | `50 / 200` | daily trend EMAs |
| `daily_pullback_tolerance` | `0.015` | how close to a Fib level counts as "in zone" (1.5%) |
| `div_max_age_candles` | `8` | 4H divergence lookback window factor |
| `div_min_rsi_level` | `50.0` | RSI-at-low oversold ceiling |
| `macd_fast / slow / signal` | `12 / 26 / 9` | 4H MACD |
| `volume_weak_seller_ratio` | `0.85` | green-candle volume < ratio×avg = weak sellers |
| `min_rr_ratio` | `3.0` | minimum reward:risk to enter |
| `atr_1h_multiplier` | `1.5` | trailing-stop distance = 1H ATR × this |
| `tp1_position_size` | `0.5` | fraction sold at TP1 (50%) |
| `max_hold_hours` | `72` | timeout exit (also `max_hold_minutes = 4320`) |

### Limits & orders
| Key | Default | Meaning |
|---|---|---|
| `max_trades_per_day` | `1` | one high-quality trade per UTC day |
| `max_daily_drawdown_pct` | `0.05` | halt at −5% on the day |
| `cooldown_seconds` | `0` | unused (1/day rule replaces it) |
| `entry_order_timeout_seconds` | `120` | cancel an unfilled limit buy after 2 min |
| `use_exchange_stop_loss` | `true` | place the resting exchange stop after entry |
| `max_sell_retries` | `5` | consecutive sell failures before CRITICAL escalation |

### Notifications, server, DB
| Key | Default |
|---|---|
| `telegram_token` / `telegram_chat_id` | `""` |
| `api_host / api_port` | `0.0.0.0 / 8000` |
| `cors_origins` | `http://localhost:5173`, `http://localhost:3000` |
| `database_url` | `sqlite+aiosqlite:///./cryptobot.db` |

---

## 19. Scheduler & Telegram

**Scheduler** (`scheduler.py`) — an APScheduler `AsyncIOScheduler` in **UTC** runs one
cron job at **00:00 UTC** daily: sends the daily summary (today's trades, exit-reason
breakdown, halt status) and then `reset_daily()` clears all daily counters and the
`trade_opened_today` / `daily_halted` flags for the new trading day.

**Telegram** (`notify.py`) — `TelegramNotifier` sends:
`send_trade_opened`, `send_tp1_partial`, `send_tsl_updated`, `send_trade_closed`,
`send_daily_summary`, `send_error` (used for warnings + CRITICAL alerts),
`send_bot_started`, `send_bot_stopped`, `send_test_message`. All are no-ops if the
token/chat-id are unset.

**Logging** — `DbWsLogHandler` mirrors every log record into the `bot_logs` table **and**
broadcasts it to WebSocket clients (using `run_coroutine_threadsafe` against the stored
event loop), powering the live Activity feed. Logs also rotate to `logs/bot.log`
(10 MB × 5 backups).

---

## 20. Running locally

**Prerequisites:** Python **3.13** at `C:/Python313/python.exe` (Windows), Node.js.

**Backend**
```bash
cd cryptobot
C:/Python313/python.exe -m pip install -r backend/requirements.txt
C:/Python313/python.exe -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
Boots in paper mode automatically if no API keys are set. Health check:
`http://localhost:8000/api/health`.

**Frontend**
```bash
cd cryptobot/frontend
npm install
npm run dev        # http://localhost:5173
```

**Going live:** open **Settings**, paste Bybit API key/secret (spot trading enabled,
**no withdrawal**), turn **Sandbox** off for mainnet (or on for testnet), save, then
**START ENGINE** from the top bar.

**Tests**
```bash
cd cryptobot
C:/Python313/python.exe -m pytest backend/tests/ -q     # 89 tests
```

> **VS Code note:** the project pins the 3.13 interpreter in `.vscode/settings.json`.
> If you see "Cannot find module" on `fastapi`/`ccxt`/`pydantic`, the editor is using
> Python 3.14 — run *Python: Select Interpreter* → `C:\Python313\python.exe`.

---

## 21. Deployment

This is a **stateful, always-on, single-instance** service — that constraint drives
every hosting choice.

| Option | Backend | Frontend | Verdict |
|---|---|---|---|
| **Vercel / Netlify / Cloudflare Pages** | ❌ serverless can't run a persistent loop | ✅ free static host | frontend only |
| **Render free web service** | ⚠️ spins down after 15 min idle (kills the loop); ephemeral disk wipes SQLite | — | avoid for the engine |
| **Your own PC / laptop** | ✅ simplest | ✅ | great for paper/testnet |
| **Oracle Cloud Always Free VM** | ✅ genuinely free 24/7, persistent disk | ✅ | best free always-on |
| **Fly.io** | ✅ persistent process + volume | ✅ | good fit |
| **Render paid ($7/mo) / Railway** | ✅ no spin-down | ✅ | once live |

**Recommended split:** frontend → Vercel (set the API base URL + `cors_origins`);
backend → an always-on VM (Oracle Always Free / Fly), run under `systemd` for
auto-restart, set secrets as env vars, keep SQLite on the persistent disk (or move
`DATABASE_URL` to Postgres on container hosts).

---

## 22. Repository layout

```
trading-bot/
├── DOCUMENTATION.md            ← this file
├── .vscode/settings.json       ← pins Python 3.13 interpreter
└── cryptobot/
    ├── cryptobot.db            ← SQLite (auto-created)
    ├── .env / .env.example     ← configuration
    ├── backend/
    │   ├── main.py             ← FastAPI app, lifespan, /api/health, /ws, logging
    │   ├── bot.py              ← the trading engine (scan/enter/monitor/exit, recovery)
    │   ├── strategy.py         ← 5-condition model, levels, R:R, exit logic
    │   ├── exchange.py         ← Bybit (ccxt) wrapper, orders, stop-loss, fill polling
    │   ├── risk.py             ← position sizing (fee-aware), drawdown, gates
    │   ├── paper_trading.py    ← dry-run simulator
    │   ├── backtest.py         ← historical simulation engine
    │   ├── scheduler.py        ← daily 00:00 UTC summary + reset
    │   ├── notify.py           ← Telegram notifier
    │   ├── requirements.txt
    │   ├── core/
    │   │   ├── config.py        ← Settings (all tunables)
    │   │   ├── state.py         ← BotState + SymbolScanState singletons
    │   │   └── websocket.py     ← WS connection manager
    │   ├── db/
    │   │   ├── database.py      ← async engine/session, init_db
    │   │   ├── models.py        ← Trade / DailyStats / BotLog / Config
    │   │   └── crud.py          ← all queries
    │   ├── api/                 ← routes_{bot,trades,stats,candles,scanner,backtest,config,paper}.py
    │   └── tests/               ← 89 tests (strategy, risk, exchange safety, api, backtest, notify)
    └── frontend/
        ├── index.html · vite.config.js · tailwind.config.js · package.json
        └── src/
            ├── App.jsx · main.jsx · index.css
            ├── shell/           ← Sidebar, TopBar
            ├── pages/           ← Terminal, Journal, Backtest, Risk, System, Settings
            ├── terminal/        ← MarketChart, PositionPanel, StrategyIntel, Watchlist, ActivityFeed
            ├── ui/kit.jsx       ← design-system primitives
            ├── store/useStore.js← Zustand store
            └── hooks/           ← useApi (axios), useWebSocket
```

---

*Strategy summary in one line:* **Long only, when the weekly uptrend + daily Fib
pullback + 4H bullish RSI divergence + 1H break of structure all align and R:R ≥ 3:1 —
then split-exit (50% at TP1, runner to TP2) with an ATR trailing stop and a resting
exchange stop-loss, capped at $1 and one trade per day.**
