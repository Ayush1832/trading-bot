import { useState, useEffect } from 'react'
import api from '../hooks/useApi.js'

const ALL_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'LINK/USDT', 'MATIC/USDT', 'DOGE/USDT', 'ADA/USDT']

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, description, children, danger }) {
  return (
    <div className={`rounded-xl p-5 border space-y-4 ${danger ? 'bg-red-950/10 border-red-800/40' : 'bg-gray-900 border-gray-800'}`}>
      <div>
        <h3 className={`text-sm font-semibold uppercase tracking-wider ${danger ? 'text-red-400' : 'text-gray-400'}`}>{title}</h3>
        {description && <p className="text-xs text-gray-600 mt-1">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children, warning }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-700 mt-0.5">{hint}</p>}
      {warning && <p className="text-xs text-amber-500/80 mt-0.5">⚠ {warning}</p>}
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange, hint, format }) {
  const display = format ? format(value) : value
  return (
    <Field label={`${label}: ${display}`} hint={hint}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500" />
      <div className="flex justify-between text-xs text-gray-700 mt-0.5">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </Field>
  )
}

function Input({ type = 'text', value, onChange, ...props }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors"
      {...props} />
  )
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className={`relative mt-0.5 w-10 h-6 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-700'}`}
        onClick={() => onChange(!checked)}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'left-5' : 'left-1'}`} />
      </div>
      <div>
        <p className="text-sm text-gray-300">{label}</p>
        {description && <p className="text-xs text-gray-600">{description}</p>}
      </div>
    </label>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const [form, setForm] = useState({
    bybit_api_key: '',
    bybit_api_secret: '',
    symbols: ['ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'BTC/USDT'],
    trade_usdt: 1.0,
    min_rr_ratio: 3.0,
    atr_1h_multiplier: 1.5,
    div_max_age_candles: 8,
    div_min_rsi_level: 50.0,
    volume_weak_seller_ratio: 0.85,
    daily_pullback_tolerance: 0.015,
    max_hold_hours: 72,
    max_trades_per_day: 1,
    telegram_token: '',
    telegram_chat_id: '',
    sandbox_mode: false,
  })
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [telegramStatus, setTelegramStatus] = useState(null)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    api.get('/config').then((r) => {
      const data = r.data
      if (typeof data.symbols === 'string') {
        data.symbols = data.symbols.split(',').map(s => s.trim()).filter(Boolean)
      }
      setForm(f => ({ ...f, ...data }))
    }).catch(() => {})
  }, [])

  const update = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
    // Clear error when corrected
    if (errors[k]) setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  const toggleSymbol = (sym) => {
    const curr = Array.isArray(form.symbols) ? form.symbols : []
    if (curr.includes(sym)) {
      if (curr.length <= 1) return
      update('symbols', curr.filter(s => s !== sym))
    } else {
      if (curr.length >= 6) return
      update('symbols', [...curr, sym])
    }
  }

  const validate = () => {
    const errs = {}
    if (form.trade_usdt > 1) errs.trade_usdt = 'Max allowed is $1.00 (hard cap)'
    if (form.trade_usdt < 0.1) errs.trade_usdt = 'Minimum is $0.10'
    if (!form.sandbox_mode && !form.bybit_api_key?.trim()) errs.bybit_api_key = 'Required for live trading'
    if (!form.sandbox_mode && !form.bybit_api_secret?.trim()) errs.bybit_api_secret = 'Required for live trading'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const save = async () => {
    if (!validate()) return

    // Warn before applying live keys
    const isLiveKeys = form.bybit_api_key && form.bybit_api_key !== 'your_real_api_key_here'
      && !form.sandbox_mode
    if (isLiveKeys && dirty) {
      const ok = window.confirm(
        'You are saving LIVE API keys with REAL MONEY mode enabled.\n\n' +
        'Make sure you trust this environment and have not shared your screen.\n\n' +
        'Continue?'
      )
      if (!ok) return
    }

    setSaveState('saving')
    try {
      const payload = { ...form }
      if (Array.isArray(payload.symbols)) payload.symbols = payload.symbols.join(',')
      await api.post('/config', payload)
      setSaveState('saved')
      setDirty(false)
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  const testTelegram = async () => {
    if (!form.telegram_token || !form.telegram_chat_id) {
      setTelegramStatus('Enter token and chat ID first')
      setTimeout(() => setTelegramStatus(null), 3000)
      return
    }
    try {
      const r = await api.post('/config/test-telegram')
      setTelegramStatus(r.data.success ? '✓ Message sent successfully!' : `Error: ${r.data.error}`)
    } catch (e) {
      setTelegramStatus('Request failed: ' + e.message)
    }
    setTimeout(() => setTelegramStatus(null), 4000)
  }

  const currentSymbols = Array.isArray(form.symbols) ? form.symbols : []

  const saveBtnCls = saveState === 'saved' ? 'bg-emerald-700 text-white'
    : saveState === 'error' ? 'bg-red-700 text-white'
    : saveState === 'saving' ? 'bg-indigo-700 opacity-70 text-white cursor-wait'
    : dirty ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
    : 'bg-gray-800 text-gray-500 cursor-not-allowed'

  const saveBtnLabel = saveState === 'saved' ? '✓ Saved'
    : saveState === 'error' ? 'Save Failed'
    : saveState === 'saving' ? 'Saving…'
    : dirty ? 'Save Settings'
    : 'No Changes'

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Settings</h2>
        {dirty && <span className="text-xs text-amber-400 font-medium">Unsaved changes</span>}
      </div>

      {/* Exchange */}
      <Section title="Exchange — Bybit"
        description="API credentials are stored locally and never sent to third parties.">
        <div className="grid grid-cols-1 gap-4">
          <Field label="API Key" hint="Read/Write permissions required. No withdrawal permission needed."
            warning={errors.bybit_api_key}>
            <Input type="password" value={form.bybit_api_key}
              onChange={v => update('bybit_api_key', v)}
              placeholder="••••••••••••••••" />
          </Field>
          <Field label="API Secret"
            warning={errors.bybit_api_secret}>
            <Input type="password" value={form.bybit_api_secret}
              onChange={v => update('bybit_api_secret', v)}
              placeholder="••••••••••••••••" />
          </Field>
          <Toggle checked={!!form.sandbox_mode}
            onChange={v => update('sandbox_mode', v)}
            label="Sandbox (Testnet) Mode"
            description="Use Bybit testnet. No real money at risk. Pairs and liquidity are limited." />
        </div>
        {!form.sandbox_mode && (
          <div className="mt-3 rounded-lg border border-red-800/40 bg-red-950/20 px-4 py-3 text-xs text-red-300">
            <span className="font-semibold">⚠ Live mode:</span> Real USDT will be traded on Bybit mainnet. Make sure your API key has proper permissions set.
          </div>
        )}
      </Section>

      {/* Watchlist */}
      <Section title="Watchlist"
        description={`Select 1–6 pairs to scan. Currently: ${currentSymbols.join(', ')}`}>
        <div className="grid grid-cols-4 gap-2">
          {ALL_SYMBOLS.map(sym => {
            const active = currentSymbols.includes(sym)
            return (
              <button key={sym} onClick={() => toggleSymbol(sym)}
                className={`py-2 px-3 rounded-lg border text-sm font-mono transition-colors ${
                  active
                    ? 'bg-indigo-700 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}>
                {sym.replace('/USDT', '')}{active && ' ✓'}
              </button>
            )
          })}
        </div>
      </Section>

      {/* Trade sizing */}
      <Section title="Trade Sizing"
        description="Controls how much USDT is risked per trade.">
        <Field label={`Trade Size: $${Number(form.trade_usdt).toFixed(2)} USDT`}
          hint="Hard cap is $1.00. A single trade never exceeds this amount."
          warning={errors.trade_usdt}>
          <input type="number" step="0.10" min="0.10" max="1.00"
            value={form.trade_usdt}
            onChange={e => update('trade_usdt', parseFloat(e.target.value))}
            className="w-32 bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 transition-colors" />
        </Field>
      </Section>

      {/* Strategy — R:R & Exit */}
      <Section title="Strategy — R:R & Exit">
        <div className="grid grid-cols-2 gap-6">
          <Slider label="Min R:R" min={2.0} max={5.0} step={0.5} value={form.min_rr_ratio}
            onChange={v => update('min_rr_ratio', v)}
            format={v => `${v.toFixed(1)}:1`}
            hint="Minimum reward:risk to enter. Higher = fewer, higher-quality trades." />
          <Slider label="ATR TSL Multiplier" min={1.0} max={3.0} step={0.25} value={form.atr_1h_multiplier}
            onChange={v => update('atr_1h_multiplier', v)}
            format={v => `${v.toFixed(2)}×`}
            hint="Trailing SL distance = 1H ATR × this multiplier." />
          <Slider label="Max Hold" min={24} max={168} step={24} value={form.max_hold_hours}
            onChange={v => update('max_hold_hours', v)}
            format={v => `${v}h`}
            hint="Force TIMEOUT exit after this many hours open." />
          <Field label="TP1 Position Size" hint="Fixed at 50% — hardcoded in strategy.">
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-500">50% (fixed)</div>
          </Field>
        </div>
      </Section>

      {/* Strategy — Divergence */}
      <Section title="Strategy — Divergence Detection"
        description="Controls RSI divergence detection on the 4H timeframe.">
        <div className="grid grid-cols-2 gap-6">
          <Slider label="Divergence Lookback" min={4} max={16} step={2} value={form.div_max_age_candles}
            onChange={v => update('div_max_age_candles', v)}
            format={v => `${v} × 4H`}
            hint="How far back to look for the 2nd RSI low." />
          <Slider label="RSI Oversold Level" min={30} max={60} step={5} value={form.div_min_rsi_level}
            onChange={v => update('div_min_rsi_level', v)}
            format={v => v.toFixed(0)}
            hint="RSI at 2nd low must be below this threshold." />
        </div>
      </Section>

      {/* Strategy — Volume & Fibonacci */}
      <Section title="Strategy — Volume & Fibonacci">
        <div className="grid grid-cols-2 gap-6">
          <Slider label="Weak Seller Ratio" min={0.60} max={0.95} step={0.05} value={form.volume_weak_seller_ratio}
            onChange={v => update('volume_weak_seller_ratio', v)}
            format={v => `${(v * 100).toFixed(0)}%`}
            hint="Green candle volume must be below this % of average — confirms exhausted sellers." />
          <Slider label="Fib Zone Tolerance" min={0.005} max={0.030} step={0.005} value={form.daily_pullback_tolerance}
            onChange={v => update('daily_pullback_tolerance', v)}
            format={v => `${(v * 100).toFixed(1)}%`}
            hint="Price must be within this % of the Fibonacci level." />
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Telegram Notifications"
        description="Receive trade alerts and status updates on Telegram.">
        <div className="grid grid-cols-1 gap-4">
          <Field label="Bot Token" hint="Create a bot via @BotFather on Telegram.">
            <Input type="password" value={form.telegram_token}
              onChange={v => update('telegram_token', v)}
              placeholder="1234567890:AAF..." />
          </Field>
          <Field label="Chat ID" hint="Your personal chat ID or group ID (use @userinfobot to find it).">
            <Input type="text" value={form.telegram_chat_id}
              onChange={v => update('telegram_chat_id', v)}
              placeholder="123456789" />
          </Field>
          <div className="flex items-center gap-3">
            <button onClick={testTelegram}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg transition-colors">
              Send Test Message
            </button>
            {telegramStatus && (
              <span className={`text-xs ${telegramStatus.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                {telegramStatus}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Save button */}
      <div className="flex items-center gap-4 pb-6">
        <button onClick={save} disabled={!dirty || saveState === 'saving'}
          className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${saveBtnCls}`}>
          {saveBtnLabel}
        </button>
        {dirty && (
          <button onClick={() => {
            setDirty(false)
            api.get('/config').then(r => {
              const data = r.data
              if (typeof data.symbols === 'string') data.symbols = data.symbols.split(',').map(s => s.trim()).filter(Boolean)
              setForm(f => ({ ...f, ...data }))
            }).catch(() => {})
          }}
            className="text-xs text-gray-500 hover:text-gray-300 px-3 py-2 rounded-lg transition-colors">
            Discard
          </button>
        )}
      </div>
    </div>
  )
}
