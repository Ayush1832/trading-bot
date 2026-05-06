# CryptoBot Pro — Complete Self-Test & Verification Prompt

> **Context:** The bot has been fully built with the Precision Swing Strategy. This prompt tells Claude Code to test every single component, flow, and edge case on its own — without any human interaction. At the end, it must produce a pass/fail report for every item.

---

## YOUR TASK — READ THIS FIRST

You are now the QA engineer for this trading bot. Your job is to verify that every component works exactly as designed before any real money is used.

**How to approach this:**
1. Read every file in the project first — understand the full codebase
2. Run every test listed in this document in order
3. Fix any failure you find before moving to the next test
4. Do not skip a test because it seems obvious — run it
5. At the end, produce a structured pass/fail report for every single item

**What you are allowed to do:**
- Run Python scripts and commands in the terminal
- Start and stop the bot in dry-run mode
- Inspect log files
- Query the database directly with SQLite commands
- Make HTTP requests to the API
- Read and modify test files
- Fix bugs you discover

**What you must NOT do:**
- Place any real orders on any exchange
- Disable any safety rule to make a test pass
- Mark a test as "pass" without actually running it
- Move on while any critical test is failing

---

## PHASE 1 — ENVIRONMENT VERIFICATION

Run these checks before touching any application code.

### 1.1 Python environment

```bash
python --version          # must be 3.11+
pip list | grep ccxt      # must show ccxt >= 4.0.0
pip list | grep fastapi   # must show fastapi
pip list | grep pandas    # must show pandas >= 2.0.0
pip list | grep pandas-ta # must show pandas-ta
pip list | grep aiosqlite # must show aiosqlite
```

**Pass criteria:** All packages present at required versions. If any missing: `pip install -r backend/requirements.txt` and re-check.

### 1.2 Node environment (frontend)

```bash
node --version    # must be 18+
cd frontend && npm list --depth=0  # check all dependencies installed
```

If packages missing: `npm install` then re-check.

### 1.3 Environment file

```bash
# Verify .env exists
ls -la .env

# Verify all required keys are present (do not print values — just check keys exist)
python3 -c "
from dotenv import dotenv_values
env = dotenv_values('.env')
required = [
    'MEXC_API_KEY', 'MEXC_API_SECRET',  # or BYBIT equivalent
    'TELEGRAM_TOKEN', 'TELEGRAM_CHAT_ID',
    'DATABASE_URL',
    'TF_WEEKLY', 'TF_DAILY', 'TF_4H', 'TF_1H',
    'SCAN_INTERVAL_SECONDS',
    'MIN_RR_RATIO', 'ATR_1H_MULTIPLIER',
    'MAX_HOLD_MINUTES', 'TP1_POSITION_SIZE',
    'MAX_TRADES_PER_DAY', 'MAX_DAILY_DRAWDOWN_PCT',
    'TRADE_USDT', 'MAX_TRADE_USDT',
]
missing = [k for k in required if k not in env]
if missing:
    print(f'MISSING KEYS: {missing}')
else:
    print('All required .env keys present')
"
```

**Pass criteria:** Output is "All required .env keys present"

### 1.4 Database migration

```bash
cd backend
python migration_strategy_update.py

# Verify all columns exist
python3 -c "
import sqlite3
conn = sqlite3.connect('cryptobot.db')
cols = [row[1] for row in conn.execute('PRAGMA table_info(trades)').fetchall()]
required_cols = [
    'id', 'symbol', 'status', 'entry_time', 'entry_price', 'qty',
    'tp_order_id', 'sl_order_id', 'tp1_price', 'tp2_price',
    'half_exited', 'tp1_exit_price', 'tp1_pnl_usdt',
    'total_pnl_usdt', 'total_pnl_pct', 'rr_ratio', 'grade',
    'entry_ema20', 'entry_atr', 'signal_score',
    'entry_divergence_strength', 'entry_nearest_fib', 'entry_1h_atr',
    'breakeven_sl', 'tsl_order_updates', 'exchange_orders_active',
]
missing = [c for c in required_cols if c not in cols]
if missing:
    print(f'MISSING COLUMNS: {missing}')
else:
    print(f'All {len(required_cols)} required columns present')
conn.close()
"
```

**Pass criteria:** Output confirms all required columns present.

---

## PHASE 2 — UNIT TESTS (STRATEGY ENGINE)

Run the full test suite first. Every test must pass before proceeding.

```bash
cd backend
python -m pytest tests/ -v --tb=short 2>&1 | tee /tmp/test_results.txt
cat /tmp/test_results.txt | tail -20
```

**Pass criteria:** 0 failures, 0 errors. If any fail — fix them before continuing.

After the full suite, run specific test files to confirm coverage:

```bash
python -m pytest tests/test_strategy.py -v    # all strategy tests
python -m pytest tests/test_order_management.py -v  # all order tests
python -m pytest tests/test_pnl.py -v         # all P&L tests
```

Record the exact pass/fail count for each file.

---

## PHASE 3 — STRATEGY LOGIC VERIFICATION

These tests go beyond unit tests — they verify the strategy behaves correctly with realistic synthetic data.

### 3.1 Indicator computation test

```python
# Run this script: backend/tests/manual/test_indicators.py
# Create this file and run it

import pandas as pd
import numpy as np
import sys
sys.path.insert(0, 'backend')
from strategy import compute_indicators

# Create 200 candles of synthetic data with a clear uptrend then pullback
np.random.seed(42)
dates = pd.date_range('2024-01-01', periods=200, freq='4h')
price = 40000
prices = []
for i in range(200):
    if i < 150:
        price *= (1 + np.random.normal(0.001, 0.008))  # uptrend
    else:
        price *= (1 + np.random.normal(-0.002, 0.008))  # pullback
    prices.append(price)

df = pd.DataFrame({
    'ts': [int(d.timestamp() * 1000) for d in dates],
    'open': prices,
    'high': [p * (1 + abs(np.random.normal(0, 0.003))) for p in prices],
    'low': [p * (1 - abs(np.random.normal(0, 0.003))) for p in prices],
    'close': prices,
    'volume': [np.random.uniform(100, 500) for _ in prices],
})

result = compute_indicators(df)

# Verify all required columns exist
required = ['ema20', 'ema50', 'rsi14', 'bb_low', 'bb_high', 'adx14', 'atr14', 'vol_avg', 'vol_ratio']
for col in required:
    assert col in result.columns, f"Missing column: {col}"
    assert not result[col].isna().all(), f"Column {col} is all NaN"
    print(f"  {col}: min={result[col].dropna().min():.4f} max={result[col].dropna().max():.4f} — OK")

print("PASS: compute_indicators produces all required columns with valid values")
```

**Pass criteria:** Script prints PASS with valid numeric ranges for all columns.

### 3.2 RSI divergence detection test

```python
# backend/tests/manual/test_divergence.py

import pandas as pd
import numpy as np
import sys
sys.path.insert(0, 'backend')
from strategy import check_4h_divergence

# Scenario A: Clear bullish divergence
# Price: lower low. RSI: higher low.
# Build a DataFrame where this pattern is clear

def make_divergence_df():
    """Creates synthetic data with clear bullish divergence"""
    closes = [
        100, 102, 104, 103, 101,   # initial rally
        98, 95, 93, 94, 96,         # first drop (RSI low 1, price low 1)
        99, 101, 100, 98, 97,       # brief recovery then second drop
        92, 91, 90, 91, 93,         # second drop LOWER in price...
        # but RSI should be HIGHER because the drop was less violent
    ]
    df = pd.DataFrame({
        'ts': list(range(len(closes))),
        'open': closes,
        'high': [c * 1.005 for c in closes],
        'low': [c * 0.995 for c in closes],
        'close': closes,
        'volume': [100] * len(closes),
    })
    return df

df_div = make_divergence_df()

# Need at least 30 candles for RSI to stabilize — pad with neutral data
padding = pd.DataFrame({
    'ts': list(range(-50, 0)),
    'open': [100] * 50,
    'high': [100.5] * 50,
    'low': [99.5] * 50,
    'close': [100] * 50,
    'volume': [100] * 50,
})
full_df = pd.concat([padding, df_div], ignore_index=True)

result = check_4h_divergence(full_df)
print(f"Divergence detected: {result['ok']}")
print(f"RSI low 1: {result.get('rsi_low_1', 'N/A'):.2f}")
print(f"RSI low 2: {result.get('rsi_low_2', 'N/A'):.2f}")
print(f"Price low 1: {result.get('price_low_1', 'N/A'):.2f}")
print(f"Price low 2: {result.get('price_low_2', 'N/A'):.2f}")
print(f"Divergence strength: {result.get('divergence_strength', 0):.2f}")

# Scenario B: No divergence (both price and RSI make lower lows)
# This should return ok=False
no_div_closes = [100, 98, 95, 92, 89, 90, 93, 91, 88, 85]
no_div_df_raw = pd.DataFrame({
    'ts': list(range(len(no_div_closes))),
    'open': no_div_closes, 'high': [c*1.005 for c in no_div_closes],
    'low': [c*0.995 for c in no_div_closes], 'close': no_div_closes,
    'volume': [100]*len(no_div_closes),
})
no_div_df = pd.concat([padding, no_div_df_raw], ignore_index=True)
no_div_result = check_4h_divergence(no_div_df)
print(f"\nNo-divergence scenario: ok={no_div_result['ok']} (expected: False)")

if not no_div_result['ok']:
    print("PASS: Divergence correctly NOT detected in no-divergence scenario")
else:
    print("FAIL: False positive — divergence detected when it should not be")
```

**Pass criteria:** Divergence scenario returns `ok=True`, no-divergence returns `ok=False`.

### 3.3 Fibonacci level detection test

```python
# backend/tests/manual/test_fibonacci.py

import sys
sys.path.insert(0, 'backend')
from strategy import check_daily_structure
import pandas as pd
import numpy as np

# Build daily data:
# Strong impulse from $40,000 to $50,000
# Then pullback to exactly the 61.8% level: $50,000 - ($10,000 * 0.618) = $43,820
swing_low  = 40000
swing_high = 50000
fib_618    = swing_high - (swing_high - swing_low) * 0.618  # = 43,820
fib_500    = swing_high - (swing_high - swing_low) * 0.500  # = 45,000
fib_382    = swing_high - (swing_high - swing_low) * 0.382  # = 46,180

# Create 100 daily candles: 70 uptrend, 30 pullback
uptrend_closes = list(np.linspace(swing_low, swing_high, 70))
pullback_closes = list(np.linspace(swing_high, fib_618, 30))
all_closes = uptrend_closes + pullback_closes

df = pd.DataFrame({
    'ts': [int(i) * 86400000 for i in range(len(all_closes))],
    'open': all_closes,
    'high': [c * 1.002 for c in all_closes],
    'low': [c * 0.998 for c in all_closes],
    'close': all_closes,
    'volume': [1000.0] * len(all_closes),
})

result = check_daily_structure(df)

print(f"Daily structure ok: {result['ok']}")
print(f"Swing high: ${result['swing_high']:,.2f} (expected ~${swing_high:,.2f})")
print(f"Swing low:  ${result['swing_low']:,.2f} (expected ~${swing_low:,.2f})")
print(f"Fib 61.8%:  ${result['fib_618']:,.2f} (expected ${fib_618:,.2f})")
print(f"Current price in pullback zone: {result['pullback_zone']}")
print(f"Nearest Fib: {result['nearest_fib_label']}")
print(f"Target resistance (TP1): ${result['target_resistance']:,.2f}")

assert abs(result['fib_618'] - fib_618) < 10, "Fib 61.8% calculation wrong"
assert result['pullback_zone'] == True, "Should detect price is in pullback zone"
assert result['ok'] == True, "Daily structure should pass"
assert '61.8' in result['nearest_fib_label'], "Should identify 61.8% as nearest Fib"

print("\nPASS: Fibonacci levels computed correctly and pullback zone detected")
```

**Pass criteria:** All assertions pass, Fib levels within $10 of expected values.

### 3.4 R:R ratio gate test

```python
# backend/tests/manual/test_rr_gate.py

import sys
sys.path.insert(0, 'backend')
from strategy import compute_rr_ratio

# Test 1: R:R = 1.5 — must be rejected
r1 = compute_rr_ratio(entry_price=100.0, stop_loss=98.0, target_resistance=103.0)
assert r1['ok'] == False, f"FAIL: R:R {r1['rr_ratio']:.2f} should be rejected (< 3.0)"
print(f"Test 1 PASS: R:R {r1['rr_ratio']:.2f} correctly rejected")

# Test 2: R:R = 3.0 exactly — must pass
r2 = compute_rr_ratio(entry_price=100.0, stop_loss=99.0, target_resistance=103.0)
assert r2['ok'] == True, f"FAIL: R:R {r2['rr_ratio']:.2f} should pass (>= 3.0)"
print(f"Test 2 PASS: R:R {r2['rr_ratio']:.2f} correctly accepted")

# Test 3: R:R = 4.5 — must pass, verify TP2 is set correctly
r3 = compute_rr_ratio(entry_price=100.0, stop_loss=98.0, target_resistance=109.0)
assert r3['ok'] == True
assert r3['tp2'] > r3['tp1'], "TP2 must be beyond TP1"
print(f"Test 3 PASS: R:R {r3['rr_ratio']:.2f}, TP1={r3['tp1']:.2f}, TP2={r3['tp2']:.2f}")

# Test 4: Stop loss above entry — invalid, must handle gracefully
try:
    r4 = compute_rr_ratio(entry_price=100.0, stop_loss=101.0, target_resistance=105.0)
    assert r4['ok'] == False, "Invalid SL above entry should return ok=False"
    print(f"Test 4 PASS: Invalid SL handled gracefully")
except Exception as e:
    print(f"Test 4 FAIL: Exception not handled: {e}")

print("\nPASS: R:R gate working correctly")
```

**Pass criteria:** All 4 test cases behave as expected.

### 3.5 ATR-based trailing stop test

```python
# backend/tests/manual/test_atr_tsl.py

import sys
sys.path.insert(0, 'backend')
from strategy import compute_atr_tsl

atr_1h = 300.0     # $300 per candle average range
multiplier = 1.5   # config default
entry = 45000.0
peak = 45000.0
tsl = entry - (atr_1h * multiplier)  # = 44550.0

print(f"Initial TSL: {tsl:.2f}")

# Test 1: Price stays flat — TSL must not move
new_peak, new_tsl, moved = compute_atr_tsl(peak, 45000.0, tsl, atr_1h, multiplier)
assert moved == False
assert new_tsl == tsl
print(f"Test 1 PASS: TSL stays at {new_tsl:.2f} when price flat")

# Test 2: Price rises — TSL must move up
new_peak, new_tsl, moved = compute_atr_tsl(peak, 46000.0, tsl, atr_1h, multiplier)
expected_new_tsl = 46000.0 - (atr_1h * multiplier)  # = 45550.0
assert moved == True
assert abs(new_tsl - expected_new_tsl) < 0.01
print(f"Test 2 PASS: TSL moved up to {new_tsl:.2f} (expected {expected_new_tsl:.2f})")

# Test 3: Price drops below previous peak — TSL must NOT move down
peak2 = 46000.0
tsl2 = 45550.0
new_peak, new_tsl, moved = compute_atr_tsl(peak2, 45200.0, tsl2, atr_1h, multiplier)
assert moved == False
assert new_tsl == tsl2
print(f"Test 3 PASS: TSL stays at {new_tsl:.2f} when price drops (did not move down)")

# Test 4: Large price spike — TSL jumps proportionally
new_peak, new_tsl, moved = compute_atr_tsl(peak, 50000.0, tsl, atr_1h, multiplier)
expected = 50000.0 - (atr_1h * multiplier)  # = 49550.0
assert moved == True
assert abs(new_tsl - expected) < 0.01
print(f"Test 4 PASS: Large spike — TSL jumped to {new_tsl:.2f}")

print("\nPASS: ATR-based TSL working correctly")
```

**Pass criteria:** All 4 scenarios produce correct TSL values.

### 3.6 Split exit P&L calculation test

```python
# backend/tests/manual/test_split_pnl.py

import sys
sys.path.insert(0, 'backend')

# Simulate a trade: entry $45,000, TP1 at $46,800 (+4%), 
# second half exits at $48,600 (+8%) via TSL
# Bybit fees: 0.1% maker entry + 0.1% taker on each exit

entry_price  = 45000.0
qty_total    = 1.0 / entry_price   # $1 trade = 0.00002222 BTC
qty_half     = qty_total * 0.5

tp1_price    = 46800.0  # +4%
tp2_price    = 48600.0  # +8%

entry_fee    = entry_price  * qty_total * 0.001
tp1_fee      = tp1_price   * qty_half  * 0.001
tp2_fee      = tp2_price   * qty_half  * 0.001

tp1_gross    = (tp1_price - entry_price) * qty_half
tp2_gross    = (tp2_price - entry_price) * qty_half

tp1_net      = tp1_gross - tp1_fee
tp2_net      = tp2_gross - tp2_fee
total_net    = tp1_net + tp2_net - entry_fee
total_pct    = total_net / (entry_price * qty_total) * 100

print(f"Trade size:   ${entry_price * qty_total:.4f} USDT")
print(f"Qty:          {qty_total:.8f} BTC")
print(f"Entry fee:    ${entry_fee:.6f}")
print(f"TP1 gross:    ${tp1_gross:.6f}")
print(f"TP1 fee:      ${tp1_fee:.6f}")
print(f"TP1 net:      ${tp1_net:.6f}")
print(f"TP2 gross:    ${tp2_gross:.6f}")
print(f"TP2 fee:      ${tp2_fee:.6f}")
print(f"TP2 net:      ${tp2_net:.6f}")
print(f"Total net:    ${total_net:.6f}")
print(f"Total return: {total_pct:.3f}%")

# Verify the bot's calculate_total_pnl function produces the same result
# Import and call the actual function
try:
    from db.crud import calculate_total_pnl
    
    mock_trade = type('Trade', (), {
        'entry_price': entry_price,
        'qty_total': qty_total,
        'tp1_exit_price': tp1_price,
        'exit_price': tp2_price,
    })()
    
    fn_net, fn_pct = calculate_total_pnl(mock_trade)
    assert abs(fn_net - total_net) < 0.000001, \
        f"Function returns {fn_net:.6f}, expected {total_net:.6f}"
    print(f"\nPASS: calculate_total_pnl matches manual calculation")
except ImportError:
    print("\nWARNING: calculate_total_pnl not found in expected location — check import path")

# Verify a full-loss scenario
loss_price   = 44550.0  # hit hard SL, no TP1
loss_gross   = (loss_price - entry_price) * qty_total
loss_fee     = loss_price * qty_total * 0.001
loss_net     = loss_gross - loss_fee - entry_fee
loss_pct     = loss_net / (entry_price * qty_total) * 100
print(f"\nFull loss scenario: {loss_pct:.3f}% (expected ~-1.1%)")
assert loss_pct < -0.8 and loss_pct > -1.5, f"Loss {loss_pct:.3f}% outside expected range"
print("PASS: Full loss P&L in expected range")
```

**Pass criteria:** Split exit total matches manual calculation, loss scenario within expected range.

---

## PHASE 4 — API ENDPOINT VERIFICATION

Start the FastAPI server and test every endpoint.

```bash
# Start the server in background with dry-run and sandbox settings
cd backend
DRY_RUN=true SANDBOX_MODE=true python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
SERVER_PID=$!
sleep 4  # wait for startup

echo "Server started with PID $SERVER_PID"
```

### 4.1 Health and status endpoints

```bash
# Test bot status
curl -s http://localhost:8000/api/bot/status | python3 -m json.tool

# Expected: JSON with running, trade_open, dry_run, usdt_balance etc.
# Verify: dry_run=true, running=false initially, no crash
```

### 4.2 Config endpoints

```bash
# Get config — verify new strategy params are returned
curl -s http://localhost:8000/api/config | python3 -m json.tool

# Check these keys exist in response:
python3 -c "
import requests, json
r = requests.get('http://localhost:8000/api/config')
cfg = r.json()
required_keys = [
    'min_rr_ratio', 'atr_1h_multiplier', 'max_hold_minutes',
    'tp1_position_size', 'max_trades_per_day', 'scan_interval_seconds',
    'tf_weekly', 'tf_daily', 'tf_4h', 'tf_1h',
]
old_keys = ['rsi_oversold', 'bb_period', 'adx_max', 'trail_pct', 'take_profit_pct']
missing_new = [k for k in required_keys if k not in cfg]
present_old = [k for k in old_keys if k in cfg]
if missing_new:
    print(f'FAIL — Missing new config keys: {missing_new}')
elif present_old:
    print(f'FAIL — Old config keys still present (should be removed): {present_old}')
else:
    print('PASS — Config contains correct new keys, old keys removed')
"
```

### 4.3 Candles endpoint — all 4 timeframes

```bash
python3 -c "
import requests

timeframes = ['1w', '1d', '4h', '1h']
symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

for tf in timeframes:
    for sym in symbols:
        r = requests.get(f'http://localhost:8000/api/candles', 
                        params={'symbol': sym, 'timeframe': tf})
        if r.status_code == 200:
            data = r.json()
            count = len(data.get('candles', []))
            has_indicators = all(k in data for k in ['candles', 'indicators'])
            print(f'{tf} {sym}: {count} candles, indicators={has_indicators} — {\"PASS\" if count > 0 else \"FAIL\"}')
        else:
            print(f'{tf} {sym}: FAIL — status {r.status_code}')
"
```

**Pass criteria:** All 12 combinations return candles with indicators.

### 4.4 Start bot in dry-run mode

```bash
# Start the bot
curl -s -X POST http://localhost:8000/api/bot/start | python3 -m json.tool

sleep 3

# Verify it's running
curl -s http://localhost:8000/api/bot/status | python3 -c "
import sys, json
data = json.load(sys.stdin)
assert data['running'] == True, 'Bot not running'
assert data['dry_run'] == True, 'Not in dry-run mode'
print(f'PASS: Bot running in dry-run mode. Balance: {data[\"usdt_balance\"]}')
"
```

### 4.5 Stats and trade endpoints

```bash
# These should return empty/zero but not crash
curl -s http://localhost:8000/api/stats | python3 -m json.tool
curl -s http://localhost:8000/api/stats/equity-curve | python3 -m json.tool
curl -s "http://localhost:8000/api/trades?limit=10&offset=0" | python3 -m json.tool
```

**Pass criteria:** All return 200 with valid JSON structure.

### 4.6 Stop bot

```bash
curl -s -X POST http://localhost:8000/api/bot/stop | python3 -m json.tool
sleep 2
curl -s http://localhost:8000/api/bot/status | python3 -c "
import sys, json
data = json.load(sys.stdin)
assert data['running'] == False
print('PASS: Bot stopped cleanly')
"
```

---

## PHASE 5 — WEBSOCKET VERIFICATION

```python
# backend/tests/manual/test_websocket.py
# Run this as a separate script while the server is running

import asyncio
import json
import websockets

async def test_websocket():
    uri = "ws://localhost:8000/ws"
    received_types = set()
    
    async with websockets.connect(uri) as ws:
        print("Connected to WebSocket")
        
        # First message should be bot_state (sent on connect)
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        assert data['type'] == 'bot_state', f"Expected bot_state, got {data['type']}"
        assert 'data' in data
        state = data['data']
        
        required_fields = ['running', 'trade_open', 'dry_run', 'exchange_orders_active',
                           'session_trades', 'session_pnl_usdt', 'usdt_balance']
        missing = [f for f in required_fields if f not in state]
        assert not missing, f"Missing fields in bot_state: {missing}"
        
        received_types.add(data['type'])
        print(f"PASS: bot_state received with all required fields")
        
        # Wait for scanner_update (should come within 2 scan intervals)
        # With 15-min scan interval, this may take a while — check within 30s
        try:
            for _ in range(10):
                msg = await asyncio.wait_for(ws.recv(), timeout=30.0)
                data = json.loads(msg)
                received_types.add(data['type'])
                print(f"Received message type: {data['type']}")
                
                if data['type'] == 'scanner_update':
                    scan_data = data['data']
                    assert 'coins' in scan_data
                    for coin in scan_data['coins']:
                        assert 'symbol' in coin
                        assert 'conditions_met' in coin
                        assert 'weekly_ok' in coin
                        assert 'daily_ok' in coin
                        assert 'divergence_ok' in coin
                        assert 'momentum_ok' in coin
                        assert 'trigger_ok' in coin
                    print(f"PASS: scanner_update received with {len(scan_data['coins'])} coins")
                    break
        except asyncio.TimeoutError:
            print("WARNING: No scanner_update in 30s — bot may not have completed first scan yet")
        
        # Send ping
        await ws.send(json.dumps({"type": "ping"}))
        print("PASS: Ping sent without error")

asyncio.run(test_websocket())
```

**Pass criteria:** WebSocket connects, immediately sends `bot_state` with all required fields, scanner updates arrive.

---

## PHASE 6 — SAFETY RULE VERIFICATION

These are the most critical tests. Every single one must pass.

### 6.1 Trade size hard cap

```python
# backend/tests/manual/test_safety_trade_size.py

import sys
sys.path.insert(0, 'backend')
from risk import calculate_qty

# Test 1: Normal $1 trade
qty = calculate_qty(usdt_amount=1.0, price=45000.0, min_qty=0.00001, qty_precision=5)
cost = qty * 45000.0
assert cost <= 1.001, f"Trade cost ${cost:.4f} exceeds $1 (tolerance for precision rounding)"
print(f"Test 1 PASS: $1 trade → qty={qty:.8f} → cost=${cost:.4f}")

# Test 2: Attempt $5 — must be capped at $1
qty2 = calculate_qty(usdt_amount=5.0, price=45000.0, min_qty=0.00001, qty_precision=5)
cost2 = qty2 * 45000.0
assert cost2 <= 1.001, f"FAIL: $5 input not capped — cost=${cost2:.4f}"
print(f"Test 2 PASS: $5 input capped to ${cost2:.4f}")

# Test 3: Attempt $100 — must be capped at $1
qty3 = calculate_qty(usdt_amount=100.0, price=45000.0, min_qty=0.00001, qty_precision=5)
cost3 = qty3 * 45000.0
assert cost3 <= 1.001, f"FAIL: $100 input not capped — cost=${cost3:.4f}"
print(f"Test 3 PASS: $100 input capped to ${cost3:.4f}")

# Test 4: Verify the cap is HARDCODED not just config-based
# Read the source code and verify min(usdt_amount, 1.0) exists
with open('risk.py', 'r') as f:
    source = f.read()
assert 'min(usdt_amount, 1.0)' in source or 'min(amount, 1.0)' in source, \
    "FAIL: Hardcoded $1 cap not found in risk.py source code"
print("Test 4 PASS: $1 hard cap is hardcoded in source")

print("\nPASS: Trade size safety cap working correctly")
```

### 6.2 Single trade lock

```python
# backend/tests/manual/test_single_trade_lock.py

import sys, asyncio
sys.path.insert(0, 'backend')
from core.state import BotState, OpenTrade
from risk import check_trade_allowed

# Simulate state with trade already open
state = BotState()
state.running = True
state.trade_open = True
state.open_trade = OpenTrade(
    symbol='BTC/USDT',
    entry_price=45000.0,
    qty_total=0.00002222,
    entry_time=1000000.0,
    peak_price=45000.0,
    trailing_sl=44550.0,
    take_profit_price=47000.0,
    hard_sl_price=44550.0,
    qty_remaining=0.00002222,
    tp1_price=46800.0,
    tp2_price=48600.0,
    entry_order_id='test_123',
    trade_usdt=1.0,
)

from unittest.mock import MagicMock
config = MagicMock()
config.max_trades_per_day = 1
config.max_daily_drawdown_pct = 0.05
config.cooldown_seconds = 0

allowed, reason = check_trade_allowed(state, config)
assert allowed == False, f"FAIL: Trade allowed despite trade_open=True. Reason: {reason}"
assert 'open' in reason.lower() or 'trade' in reason.lower(), \
    f"Reason should mention open trade: '{reason}'"
print(f"PASS: Trade blocked with reason: '{reason}'")

# Now verify one-trade-per-day rule
state2 = BotState()
state2.running = True
state2.trade_open = False
state2.trade_opened_today = True  # already had a trade today

allowed2, reason2 = check_trade_allowed(state2, config)
assert allowed2 == False, "FAIL: Second trade allowed on same day"
print(f"PASS: Second trade blocked: '{reason2}'")
```

### 6.3 Daily drawdown halt

```python
# backend/tests/manual/test_drawdown_halt.py

import sys
sys.path.insert(0, 'backend')
from risk import check_daily_drawdown
from core.state import BotState

state = BotState()
config_mock = type('Config', (), {'max_daily_drawdown_pct': 0.05})()

# Test 1: No drawdown
state.day_start_balance = 10.0
state.usdt_balance = 10.0
result = check_daily_drawdown(state, config_mock)
assert result == False
print("Test 1 PASS: No drawdown, no halt")

# Test 2: 3% drawdown — under limit
state.usdt_balance = 9.70
result = check_daily_drawdown(state, config_mock)
assert result == False
print("Test 2 PASS: 3% drawdown, no halt")

# Test 3: Exactly 5% drawdown — must halt
state.usdt_balance = 9.50
result = check_daily_drawdown(state, config_mock)
assert result == True, f"FAIL: 5% drawdown should trigger halt, got {result}"
print("Test 3 PASS: 5% drawdown triggers halt")

# Test 4: 8% drawdown — must halt
state.usdt_balance = 9.20
result = check_daily_drawdown(state, config_mock)
assert result == True
print("Test 4 PASS: 8% drawdown triggers halt")

print("\nPASS: Daily drawdown halt working correctly")
```

### 6.4 Exchange order placement after fill (read source code)

```python
# backend/tests/manual/test_order_sequence_source.py

# This test reads bot.py source code to verify the correct sequence
# is implemented — trade_open is ONLY set after exchange orders are placed.

with open('bot.py', 'r') as f:
    source = f.read()

# Find the trade open sequence
checks = [
    # state.trade_open = True must appear AFTER place_tp and place_sl
    ('place_limit_buy', "Limit buy order placement"),
    ('wait_for_fill', "Wait for fill logic"),
    ('place_take_profit', "TP order placement"),
    ('place_stop_loss', "SL order placement"),
    ('trade_open = True', "trade_open flag set"),
    ('SAFETY_EXIT_NO_ORDERS', "Safety exit if orders fail"),
]

for pattern, description in checks:
    found = pattern in source
    status = "PASS" if found else "FAIL"
    print(f"  {status}: {description} — '{pattern}' {'found' if found else 'NOT FOUND'} in bot.py")

# Verify trade_open=True appears AFTER exchange order placement
tp_pos = source.find('place_take_profit')
sl_pos = source.find('place_stop_loss')
open_pos = source.find('trade_open = True')
safety_pos = source.find('SAFETY_EXIT_NO_ORDERS')

if tp_pos > 0 and sl_pos > 0 and open_pos > 0:
    if open_pos > tp_pos and open_pos > sl_pos:
        print("PASS: trade_open=True appears AFTER exchange order placement")
    else:
        print("FAIL: trade_open=True appears BEFORE exchange order placement — CRITICAL BUG")
else:
    print("WARNING: Could not verify sequence — check bot.py manually")

if safety_pos > 0:
    print("PASS: Safety exit on order placement failure is implemented")
else:
    print("FAIL: Safety exit for failed order placement NOT FOUND — CRITICAL")
```

### 6.5 Loop exception handling

```python
# backend/tests/manual/test_loop_exception_handling.py

with open('bot.py', 'r') as f:
    source = f.read()

# Verify top-level try/except in the bot loop
patterns = [
    ('except Exception', "Top-level exception catch"),
    ('asyncio.sleep', "Sleep after exception"),
]

for pattern, desc in patterns:
    if pattern in source:
        print(f"PASS: {desc}")
    else:
        print(f"FAIL: {desc} — '{pattern}' NOT FOUND in bot.py")

# Verify the bot loop is structured to never exit
# Look for while True or while state.running pattern
if 'while state.running' in source or 'while True' in source:
    print("PASS: Infinite loop structure present in bot.py")
else:
    print("FAIL: No while loop found — bot will exit after one iteration")

# Verify asyncio timeout on exchange calls
with open('exchange.py', 'r') as f:
    ex_source = f.read()

if 'wait_for' in ex_source and 'timeout' in ex_source:
    print("PASS: asyncio timeout found in exchange.py")
else:
    print("FAIL: No timeout guard found in exchange.py — exchange calls can hang forever")
```

### 6.6 `iloc[-2]` rule in strategy

```python
# backend/tests/manual/test_iloc_rule.py

with open('strategy.py', 'r') as f:
    source = f.read()

# Count occurrences
iloc_neg2 = source.count('iloc[-2]')
iloc_neg1_signal = 0

# Check if iloc[-1] is ever used in signal-related functions
import re
# Find all function bodies that contain signal/check logic
lines = source.split('\n')
in_signal_func = False
for i, line in enumerate(lines):
    if any(fn in line for fn in ['def check_', 'def compute_', 'def select_']):
        in_signal_func = True
    if in_signal_func and 'iloc[-1]' in line and 'candle' in lines[max(0,i-5):i+5]:
        iloc_neg1_signal += 1
        print(f"WARNING: iloc[-1] found near line {i+1}: {line.strip()}")

print(f"iloc[-2] occurrences in strategy.py: {iloc_neg2}")
if iloc_neg1_signal == 0:
    print("PASS: No suspicious iloc[-1] usage in signal functions")
else:
    print(f"FAIL: {iloc_neg1_signal} suspicious iloc[-1] usages found in signal functions")

if iloc_neg2 >= 5:
    print("PASS: iloc[-2] used consistently for closed candle reads")
else:
    print(f"WARNING: Only {iloc_neg2} uses of iloc[-2] — may be insufficient")
```

---

## PHASE 7 — DRY-RUN LIVE FLOW TEST

This is the most important test. It runs the bot in dry-run mode for one full scan cycle and verifies the complete flow.

### 7.1 Start bot and monitor one full scan cycle

```bash
# Start server fresh
cd backend
DRY_RUN=true SANDBOX_MODE=true python -m uvicorn main:app --port 8000 &
SERVER_PID=$!
sleep 3

# Start bot
curl -s -X POST http://localhost:8000/api/bot/start

echo "Bot started. Waiting for first scan cycle (up to 16 minutes)..."
echo "Monitoring logs..."
```

```python
# backend/tests/manual/test_live_scan_cycle.py
# Run this WHILE the bot is running in another terminal

import time, requests, json

def wait_for_scanner_update(timeout=120):
    """Poll bot status until scanner data appears"""
    start = time.time()
    while time.time() - start < timeout:
        r = requests.get('http://localhost:8000/api/bot/status')
        if r.status_code == 200:
            data = r.json()
            coin_states = data.get('coin_states', {})
            if coin_states:
                return coin_states
        time.sleep(5)
    return None

print("Waiting for first scanner update...")
coin_states = wait_for_scanner_update(timeout=1000)  # 16+ minutes for 15-min scan

if not coin_states:
    print("FAIL: No scanner update received within timeout")
    exit(1)

print(f"PASS: Scanner update received for {len(coin_states)} coins")

for symbol, state in coin_states.items():
    print(f"\n{symbol}:")
    print(f"  Conditions met: {state.get('conditions_met', '?')}/5")
    print(f"  Weekly OK:      {state.get('weekly_ok', '?')}")
    print(f"  Daily OK:       {state.get('daily_ok', '?')}")
    print(f"  Divergence OK:  {state.get('divergence_ok', '?')}")
    print(f"  Momentum OK:    {state.get('momentum_ok', '?')}")
    print(f"  Trigger OK:     {state.get('trigger_ok', '?')}")
    print(f"  Grade:          {state.get('grade', 'N/A')}")
    print(f"  Fail reason:    {state.get('fail_reason', 'N/A')}")
    
    # Verify state structure is correct
    required_fields = ['conditions_met', 'weekly_ok', 'daily_ok', 
                       'divergence_ok', 'momentum_ok', 'trigger_ok']
    missing = [f for f in required_fields if f not in state]
    if missing:
        print(f"  FAIL: Missing fields: {missing}")
    else:
        print(f"  Structure: PASS")
```

### 7.2 Force a dry-run trade (temporarily override signal)

To test the trade open → monitor → close flow without waiting for a real signal:

```python
# backend/tests/manual/test_force_drytrade.py
# This script temporarily injects a simulated trade into state

import requests, json, time

# Trigger a forced dry-run trade via a test endpoint
# (This endpoint must be implemented — add it to routes_bot.py if not present)
r = requests.post('http://localhost:8000/api/bot/test/force-signal', json={
    "symbol": "BTC/USDT",
    "entry_price": 45000.0,
    "stop_loss": 44100.0,     # -2%
    "tp1_price": 47700.0,     # +6%
    "tp2_price": 49500.0,     # +10%
    "rr_ratio": 3.0,
    "grade": "A+",
    "atr_1h": 300.0,
})

if r.status_code == 404:
    print("Test endpoint not found — adding it to routes_bot.py")
    print("Add: POST /api/bot/test/force-signal that sets a dry-run trade in state")
    print("This endpoint should ONLY work when dry_run=True")
else:
    print(f"Force signal response: {r.status_code} — {r.json()}")
```

**If the test endpoint doesn't exist, add it to `routes_bot.py`:**

```python
@router.post("/test/force-signal")
async def force_test_signal(data: dict, request: Request):
    """
    TEST ONLY endpoint — only works in dry_run mode.
    Forces a simulated trade open to test the monitoring flow.
    """
    state = request.app.state.bot_state
    if not state.dry_run:
        return {"error": "Only available in dry-run mode"}
    if state.trade_open:
        return {"error": "Trade already open"}
    
    # Build a simulated OpenTrade with the provided data
    # Use simulated order IDs (DRY_TP_... DRY_SL_...)
    # Set state.trade_open = True
    # Save to DB as OPEN
    # Return success
```

After forcing the trade, verify:

```python
# Verify state shows open trade
time.sleep(2)
status = requests.get('http://localhost:8000/api/bot/status').json()
assert status['trade_open'] == True
assert status['open_trade'] is not None
ot = status['open_trade']
print(f"Trade open: {ot['symbol']} @ ${ot['entry_price']:,.2f}")
print(f"TP1: ${ot['tp1_price']:,.2f} | TP2: ${ot['tp2_price']:,.2f}")
print(f"TSL: ${ot['trailing_sl']:,.2f}")
print(f"Exchange orders active: {ot['exchange_orders_active']}")
print(f"TP order ID: {ot['tp_order_id']}")
print(f"SL order ID: {ot['sl_order_id']}")
assert ot['exchange_orders_active'] == True, "Exchange orders should be active in dry run"
assert ot['tp_order_id'] is not None, "TP order ID should be set"
assert ot['sl_order_id'] is not None, "SL order ID should be set"
print("PASS: Open trade state correctly populated")
```

### 7.3 Verify DB record for open trade

```python
import sqlite3

conn = sqlite3.connect('cryptobot.db')
rows = conn.execute(
    "SELECT * FROM trades WHERE status='OPEN' ORDER BY id DESC LIMIT 1"
).fetchall()
cols = [d[0] for d in conn.execute("PRAGMA table_info(trades)").description]

if rows:
    trade = dict(zip(cols, rows[0]))
    print(f"Open trade in DB:")
    print(f"  Symbol:     {trade['symbol']}")
    print(f"  Entry:      ${trade['entry_price']:,.2f}")
    print(f"  TP1:        {trade['tp1_price']}")
    print(f"  TP2:        {trade['tp2_price']}")
    print(f"  TP order:   {trade['tp_order_id']}")
    print(f"  SL order:   {trade['sl_order_id']}")
    print(f"  Grade:      {trade['grade']}")
    print(f"  RR ratio:   {trade['rr_ratio']}")
    
    assert trade['tp_order_id'] is not None, "TP order ID not saved to DB"
    assert trade['sl_order_id'] is not None, "SL order ID not saved to DB"
    assert trade['tp1_price'] is not None, "TP1 price not saved to DB"
    print("PASS: All trade fields correctly saved to DB")
else:
    print("FAIL: No OPEN trade found in DB")

conn.close()
```

---

## PHASE 8 — BACKTEST VERIFICATION

```python
# backend/tests/manual/test_backtest.py

import requests, time, json

# Run a short backtest (30 days)
payload = {
    "symbol": "BTC/USDT",
    "timeframe": "1h",
    "start_date": "2024-09-01",
    "end_date": "2024-09-30",
}

print("Running 30-day backtest (may take 30–90 seconds)...")
r = requests.post('http://localhost:8000/api/backtest', json=payload, timeout=180)

if r.status_code != 200:
    print(f"FAIL: Backtest returned {r.status_code}: {r.text[:200]}")
    exit(1)

result = r.json()
print(f"\nBacktest Results:")
print(f"  Total trades:     {result['total_trades']}")
print(f"  Win rate:         {result.get('win_rate', 0)*100:.1f}%")
print(f"  Total P&L:        {result.get('total_pnl_pct', 0):.2f}%")
print(f"  Profit factor:    {result.get('profit_factor', 0):.2f}")
print(f"  Max drawdown:     {result.get('max_drawdown_pct', 0):.2f}%")
print(f"  Avg R:R:          {result.get('avg_rr_ratio', 0):.2f}")
print(f"  TP1 hit count:    {result.get('half_exit_count', 0)}")
print(f"  Fees deducted:    ${result.get('total_fees_usdt', 0):.6f}")
print(f"  Grade breakdown:  {result.get('grade_breakdown', {})}")

# Structural checks
required_result_fields = [
    'total_trades', 'winning_trades', 'win_rate', 'total_pnl_usdt',
    'profit_factor', 'max_drawdown_pct', 'avg_rr_ratio',
    'half_exit_count', 'total_fees_usdt', 'grade_breakdown',
    'equity_curve', 'trades',
]
missing = [f for f in required_result_fields if f not in result]
if missing:
    print(f"\nFAIL: Missing fields in BacktestResult: {missing}")
else:
    print(f"\nPASS: All required BacktestResult fields present")

# Sanity checks
assert result['total_trades'] >= 0, "Negative trade count"
assert result.get('total_fees_usdt', -1) >= 0, "Negative fees — fees not being deducted"
assert len(result.get('equity_curve', [])) >= 0, "equity_curve should be a list"

if result['total_trades'] > 0:
    assert result.get('avg_rr_ratio', 0) >= 2.5, \
        f"Average R:R {result.get('avg_rr_ratio'):.2f} too low — setup filter may not be working"
    
    # Verify no trades during 00:00–03:59 UTC (avoid hours)
    for trade in result.get('trades', []):
        import datetime
        entry_hour = datetime.datetime.fromisoformat(trade['entry_time']).hour
        assert entry_hour not in [0, 1, 2, 3], \
            f"FAIL: Trade opened at {entry_hour}:00 UTC — avoid hours not respected"
    
    print(f"PASS: Trades only in allowed hours")
    print(f"PASS: Average R:R {result.get('avg_rr_ratio', 0):.2f} meets minimum")

print("\nPASS: Backtest complete and structurally valid")
```

---

## PHASE 9 — TELEGRAM VERIFICATION

```bash
# Send test message
curl -s -X POST http://localhost:8000/api/config/test-telegram | python3 -m json.tool
```

**Expected output:**
```json
{"success": true, "message": "Test message sent successfully"}
```

**Check your Telegram app:** You should receive:
```
✅ Telegram connected
CryptoBot Pro notifications are working.
```

If not received within 30 seconds:
1. Check `TELEGRAM_TOKEN` format (must be `123456:ABC-DEF...`)
2. Check `TELEGRAM_CHAT_ID` (must be the chat's numeric ID)
3. Verify the bot has been started in Telegram (`/start` in the chat)

---

## PHASE 10 — FRONTEND VERIFICATION

```bash
# Build the frontend
cd frontend
npm run build 2>&1 | tail -10
```

**Pass criteria:** Build completes with no errors. `dist/` directory exists with `index.html`.

Then open the dashboard in browser (or check via curl):

```bash
# Check if nginx is serving the frontend (if deployed)
# Or check the dev server
cd frontend && npm run dev &
sleep 3
curl -s http://localhost:5173 | grep -c "CryptoBot"
```

**Manual browser checks (do these with the bot running in dry-run mode):**

```
Open http://localhost:5173 (or your VPS IP)

□ Dashboard loads without console errors
□ Bot status badge shows correctly (RUNNING or STOPPED)
□ Scanner panel shows 3 coins (BTC, ETH, SOL)
□ Each coin card shows 5 conditions with [W][D][4H][1H] badges
□ Conditions show ✓ or ✗ with brief reason text
□ Score bar reflects conditions_met count (0-5)
□ When score=5, card shows green pulsing border
□ LiveTradeCard shows "Waiting for signal" when no trade
□ P&L chart loads (empty is fine, no error)
□ Log feed shows recent bot log entries
□ "Today: 0/1 trade" shows in stats grid

Trades page:
□ Table loads without error (empty is fine)
□ Grade column exists
□ R:R column exists
□ TP1 P&L column exists
□ Total P&L column exists

Backtest page:
□ Form loads with all sliders/dropdowns
□ Min R:R slider visible (2.0–5.0 range)
□ ATR multiplier slider visible
□ TP1 position size slider visible
□ Old parameters NOT visible (RSI oversold, BB period, ADX max, trail %)

Settings page:
□ API key shows as ****...XXXX (masked)
□ New strategy params visible
□ Old params NOT visible
□ Test Telegram button exists
□ Dry Run toggle exists and works
```

---

## PHASE 11 — CRASH RECOVERY TEST

This verifies the bot correctly restores state after a crash.

```python
# backend/tests/manual/test_crash_recovery.py

import sqlite3, json
from datetime import datetime

# Step 1: Manually insert a fake OPEN trade into the database
# simulating a state where the bot crashed mid-trade
conn = sqlite3.connect('cryptobot.db')

fake_trade = {
    'symbol': 'BTC/USDT',
    'status': 'OPEN',
    'entry_time': datetime.utcnow().isoformat(),
    'entry_price': 45000.0,
    'qty': 0.00002222,
    'trade_usdt': 1.0,
    'entry_order_id': 'CRASH_TEST_ENTRY',
    'tp_order_id': 'CRASH_TEST_TP',
    'sl_order_id': 'CRASH_TEST_SL',
    'tp1_price': 46800.0,
    'tp2_price': 48600.0,
    'take_profit_price': 46800.0,
    'hard_sl_price': 44550.0,
    'trailing_sl_final': 44550.0,
    'trail_pct_used': 0.01,
    'exchange_orders_active': 1,
    'half_exited': 0,
    'rr_ratio': 3.0,
    'grade': 'A',
    'entry_1h_atr': 300.0,
}

conn.execute("""
    INSERT INTO trades (symbol, status, entry_time, entry_price, qty, trade_usdt,
    entry_order_id, tp_order_id, sl_order_id, tp1_price, tp2_price, take_profit_price,
    hard_sl_price, trailing_sl_final, trail_pct_used, exchange_orders_active,
    half_exited, rr_ratio, grade, entry_1h_atr)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", (
    fake_trade['symbol'], fake_trade['status'], fake_trade['entry_time'],
    fake_trade['entry_price'], fake_trade['qty'], fake_trade['trade_usdt'],
    fake_trade['entry_order_id'], fake_trade['tp_order_id'], fake_trade['sl_order_id'],
    fake_trade['tp1_price'], fake_trade['tp2_price'], fake_trade['take_profit_price'],
    fake_trade['hard_sl_price'], fake_trade['trailing_sl_final'], fake_trade['trail_pct_used'],
    fake_trade['exchange_orders_active'], fake_trade['half_exited'],
    fake_trade['rr_ratio'], fake_trade['grade'], fake_trade['entry_1h_atr'],
))
conn.commit()
fake_trade_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
conn.close()

print(f"Inserted fake OPEN trade with ID {fake_trade_id}")
print("Now restart the server and verify it recovers the trade state...")
print("Expected: bot restores trade_open=True with correct order IDs from DB")
print("Expected: Telegram message sent: 'Bot restarted. Resuming open trade...'")
print("Expected: Bot attempts to verify order status on exchange (in dry run: simulates)")
```

After inserting the fake trade, restart the server:

```bash
kill $SERVER_PID
sleep 2
DRY_RUN=true SANDBOX_MODE=true python -m uvicorn main:app --port 8000 &
sleep 4

# Check state
python3 -c "
import requests
status = requests.get('http://localhost:8000/api/bot/status').json()
print(f'trade_open: {status[\"trade_open\"]}')
if status['trade_open']:
    ot = status['open_trade']
    print(f'symbol: {ot[\"symbol\"]}')
    print(f'tp_order_id: {ot[\"tp_order_id\"]}')
    print(f'sl_order_id: {ot[\"sl_order_id\"]}')
    if ot['tp_order_id'] == 'CRASH_TEST_TP' and ot['sl_order_id'] == 'CRASH_TEST_SL':
        print('PASS: Crash recovery restored correct order IDs')
    else:
        print('FAIL: Order IDs do not match what was in DB')
else:
    print('FAIL: trade_open is False — crash recovery did not restore state')
"
```

**Pass criteria:** After restart, `trade_open=True` with correct order IDs from the DB.

---

## PHASE 12 — CLEANUP AND FINAL REPORT

```bash
# Stop the bot and server
curl -s -X POST http://localhost:8000/api/bot/stop
sleep 2
kill $SERVER_PID 2>/dev/null

# Clean up test trade from DB
python3 -c "
import sqlite3
conn = sqlite3.connect('backend/cryptobot.db')
conn.execute(\"DELETE FROM trades WHERE entry_order_id='CRASH_TEST_ENTRY'\")
conn.commit()
conn.close()
print('Test data cleaned up')
"
```

---

## FINAL REPORT — GENERATE THIS AT THE END

After running every test, generate this exact report:

```
═══════════════════════════════════════════════════════════
          CRYPTOBOT PRO — COMPLETE TEST REPORT
═══════════════════════════════════════════════════════════

DATE: [current date]
BOT VERSION: Precision Swing Strategy
EXCHANGE: [exchange name]
DRY RUN: true

───────────────────────────────────────────────────────────
PHASE 1 — ENVIRONMENT
───────────────────────────────────────────────────────────
[ ] Python 3.11+
[ ] All pip packages installed
[ ] Node 18+
[ ] All npm packages installed
[ ] .env file complete (all required keys)
[ ] Database migration complete (all columns present)

───────────────────────────────────────────────────────────
PHASE 2 — UNIT TESTS
───────────────────────────────────────────────────────────
[ ] test_strategy.py: __/__ passed
[ ] test_order_management.py: __/__ passed
[ ] test_pnl.py: __/__ passed
[ ] TOTAL: __/__ passed, __ failed

───────────────────────────────────────────────────────────
PHASE 3 — STRATEGY LOGIC
───────────────────────────────────────────────────────────
[ ] Indicator computation (all columns, valid values)
[ ] RSI divergence detection (true positive + true negative)
[ ] Fibonacci level identification (within $10 tolerance)
[ ] R:R ratio gate (rejects <3.0, accepts >=3.0)
[ ] ATR-based TSL (moves up, never down, correct calculation)
[ ] Split exit P&L (matches manual calculation to 6 decimals)

───────────────────────────────────────────────────────────
PHASE 4 — API ENDPOINTS
───────────────────────────────────────────────────────────
[ ] GET /api/bot/status — returns correct structure
[ ] GET /api/config — new params present, old params absent
[ ] GET /api/candles (all 4 timeframes × 3 symbols = 12)
[ ] POST /api/bot/start — bot starts in dry-run
[ ] GET /api/stats — returns without error
[ ] GET /api/trades — returns without error
[ ] POST /api/bot/stop — bot stops cleanly

───────────────────────────────────────────────────────────
PHASE 5 — WEBSOCKET
───────────────────────────────────────────────────────────
[ ] Connects successfully
[ ] Sends bot_state immediately on connect
[ ] bot_state has all required fields
[ ] scanner_update received with all 5 conditions per coin
[ ] Ping handled without error

───────────────────────────────────────────────────────────
PHASE 6 — SAFETY RULES
───────────────────────────────────────────────────────────
[ ] Trade size hard cap: $5/$100 input capped to $1
[ ] Hardcoded cap in source (not just config)
[ ] Single trade lock: second entry blocked with trade open
[ ] One-trade-per-day: second entry blocked after first trade
[ ] Daily drawdown halt: triggers at exactly 5%
[ ] trade_open=True set AFTER exchange orders placed (source verified)
[ ] Safety exit implemented if exchange orders fail
[ ] Exception handling: loop never exits on error
[ ] asyncio timeout on exchange calls
[ ] iloc[-2] used for all signal reads (not iloc[-1])

───────────────────────────────────────────────────────────
PHASE 7 — LIVE DRY-RUN FLOW
───────────────────────────────────────────────────────────
[ ] Scanner produces condition results for all 3 coins
[ ] All 5 conditions present in scanner data per coin
[ ] Grade field populated
[ ] Forced dry-run trade opens correctly
[ ] State populated with all trade fields
[ ] DB record saved with all columns
[ ] Exchange order IDs saved to DB
[ ] Dashboard reflects open trade state

───────────────────────────────────────────────────────────
PHASE 8 — BACKTEST
───────────────────────────────────────────────────────────
[ ] Backtest completes without error
[ ] All required result fields present
[ ] Fees deducted (total_fees_usdt > 0)
[ ] grade_breakdown populated
[ ] avg_rr_ratio >= 2.5 (quality filter working)
[ ] No trades during avoid hours

───────────────────────────────────────────────────────────
PHASE 9 — TELEGRAM
───────────────────────────────────────────────────────────
[ ] Test message API returns success=true
[ ] Message received in Telegram app

───────────────────────────────────────────────────────────
PHASE 10 — FRONTEND
───────────────────────────────────────────────────────────
[ ] Build completes without errors
[ ] Scanner panel shows 5 conditions with TF badges
[ ] Old parameters absent from Settings page
[ ] New parameters present in Settings page
[ ] Trade table has Grade, R:R, TP1 P&L columns
[ ] LiveTradeCard shows split exit UI elements

───────────────────────────────────────────────────────────
PHASE 11 — CRASH RECOVERY
───────────────────────────────────────────────────────────
[ ] After restart: trade_open=True restored from DB
[ ] Correct order IDs (tp_order_id, sl_order_id) restored
[ ] Telegram alert sent on recovery

───────────────────────────────────────────────────────────
OVERALL RESULT
───────────────────────────────────────────────────────────
Total checks: __ / __ passed

CRITICAL FAILURES (any of these = DO NOT USE LIVE):
[ ] None — all critical checks passed
  OR
[X] List any critical failures here

READY FOR LIVE TRADING: YES / NO
═══════════════════════════════════════════════════════════
```

**The bot is ready for live trading ONLY IF:**
1. Zero critical failures
2. All Phase 6 safety checks pass
3. Phase 7 dry-run flow completes successfully
4. Phase 8 backtest returns valid results with fees deducted
5. Telegram notifications confirmed working

**If any Phase 6 item fails — fix it before going live. No exceptions.**

---

*End of test prompt. Run every phase in order. Fix failures before proceeding. Generate the final report.*
