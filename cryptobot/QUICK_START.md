# CryptoBot Pro — Quick Start Guide

## Phase 1: Paper Trading (Zero Risk — Start Here)

Paper trading lets you run the full bot against **live BTC/USDT market data** without spending a single rupee.
The bot computes real signals, simulates fills at real prices, and tracks P&L — just no actual orders go to MEXC.

---

### Step 1 — Install backend dependencies

```bash
cd cryptobot/backend
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
```

### Step 2 — Create your .env file

```bash
cd cryptobot
cp .env.example .env
```

For paper trading, **you don't need MEXC API keys yet**.
Open `.env` and leave `MEXC_API_KEY` blank or as-is — the bot will auto-enable paper mode.

Optionally fill in Telegram details to receive paper trade notifications:
```
TELEGRAM_TOKEN=your_bot_token   # get from @BotFather on Telegram
TELEGRAM_CHAT_ID=your_chat_id   # get from @userinfobot on Telegram
```

### Step 3 — Start the backend

```bash
# From cryptobot/ root
cd backend
uvicorn main:app --reload --port 8000
```

You should see:
```
INFO: No MEXC API keys configured — paper trading mode auto-enabled
INFO: Database initialized
INFO: Scheduler started
```

### Step 4 — Start the frontend

Open a second terminal:
```bash
cd cryptobot/frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

You will see an amber **"PAPER TRADING MODE"** banner at the top of the dashboard.
No real money is at risk.

### Step 5 — Start the bot in paper mode

Click the green **"Start"** button in the top-right corner of the dashboard.

The bot will:
- Fetch live BTC/USDT 1m candles from MEXC (public endpoint — no keys needed)
- Compute EMA50, RSI14, Bollinger Bands, volume ratio every 5 seconds
- When all 4 entry conditions trigger simultaneously, simulate a buy at current ask
- Track the trade with a trailing stop loss
- Show live P&L on the dashboard

---

## Phase 2: Run a Backtest First (Recommended)

Before letting the bot run live signals, validate the strategy on historical data:

1. Go to the **Backtest** page in the dashboard
2. Select BTC/USDT, set a 90-day date range (e.g. 2024-01-01 to 2024-03-31)
3. Click **Run Backtest**
4. Check results:
   - **Profit Factor > 1.0** — strategy makes more than it loses
   - **Max Drawdown < 10%** — no catastrophic losing streaks
   - **Win Rate > 40%** — positive expectancy (high wins aren't required if wins are bigger)

If numbers look good, proceed. If not, adjust Trail %, TP %, or SL % sliders and re-run.

---

## Phase 3: Paper Trade for at Least 7 Days

Let the bot paper trade for **at least 1 week** while watching:

| What to check | Where to look |
|---|---|
| Signals are triggering (not too rare, not too often) | Dashboard log feed |
| Trades are opening and closing correctly | Trades page |
| TSL is moving up as price rises | Live Trade Card on Dashboard |
| P&L is roughly matching backtest expectations | Dashboard stat cards |
| No crashes or errors | Log feed (red ERROR entries) |

### Paper trading checklist
- [ ] At least 10 paper trades completed
- [ ] Win rate is above 40%
- [ ] No ERROR entries in the log feed
- [ ] TSL and TP levels updating correctly on the chart
- [ ] Telegram notifications arriving (if configured)
- [ ] "Reset Account" button works — balance returns to $10.00
- [ ] Stop/Start bot via dashboard works reliably

---

## Phase 4: Create MEXC API Keys (Read-Only for Balance Checks)

When you're ready to go live:

1. Log in to **mexc.com**
2. Go to **API Management** → Create API Key
3. Set permissions:
   - **Read** — YES (required for balance and candles)
   - **Trade** — YES (required for placing orders)
   - **Withdraw** — **NO** (NEVER enable this — the bot enforces this rule)
4. Add your IP address to the whitelist
5. Copy the API Key and Secret

### Add keys to .env
```bash
MEXC_API_KEY=your_actual_key
MEXC_API_SECRET=your_actual_secret
SANDBOX_MODE=false
```

Restart the backend. The paper mode banner will disappear.

---

## Phase 5: Test With Minimum Real Balance

Before risking $10:
1. Deposit **$5 USDT** on MEXC (the minimum to verify order placement works)
2. Start the bot with `TRADE_USDT=0.5` in `.env`
3. Let one real trade complete end-to-end
4. Verify the trade appears in your MEXC order history

If that works, set `TRADE_USDT=1.0` and `SANDBOX_MODE=false` for full operation.

---

## Phase 6: Switch to Live Trading

In the dashboard Settings page:
- Fill in your MEXC API Key and Secret
- Turn off Sandbox Mode
- Click **Save Settings**
- Restart the bot

Or manually edit `.env`:
```bash
MEXC_API_KEY=your_key
MEXC_API_SECRET=your_secret
SANDBOX_MODE=false
TRADE_USDT=1.0
```

The amber PAPER banner disappears and the bot starts placing real orders.

---

## Running Tests

```bash
cd cryptobot/backend
pip install pytest pytest-asyncio
pytest tests/ -v
```

Expected output: all strategy, risk, notify, backtest, and API tests pass.

---

## Safety Rules (Always Active, Cannot Be Disabled)

1. **$1 max per trade** — hardcoded in bot.py
2. **One trade at a time** — checked before every entry
3. **Hard stop loss always active** — even with TSL running
4. **5% daily drawdown halt** — bot stops if today's loss hits 5% of balance
5. **No order if qty < exchange minimum** — checked on startup
6. **10-second timeout on all exchange calls** — never hangs
7. **All exceptions caught** — bot loop never crashes
8. **Paper mode auto-enable** — if no API keys in .env, paper trading turns on automatically

---

## Common Questions

**Q: Why isn't the bot finding any signals?**
The strategy requires ALL 4 conditions at once (EMA trend + RSI < 30 + price ≤ BB lower + volume spike). On a calm day this can take hours. This is intentional — fewer but higher-quality trades.

**Q: The paper balance went negative — how?**
Shouldn't happen. If it does, click "Reset Account" in the paper banner. This is an edge case with very rapid price moves.

**Q: How long should I paper trade before going live?**
Minimum 7 days, ideally 14–30 days with at least 20 completed trades.

**Q: Can I run multiple pairs?**
Not yet — the current version is single-pair. Change `SYMBOL` in `.env` to switch (e.g. ETH/USDT). Multi-pair support would be a future enhancement.
