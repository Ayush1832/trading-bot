import { useState, useEffect } from 'react'
import api from '../hooks/useApi.js'

const ALL_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT']

export default function Settings() {
  const [form, setForm] = useState({
    bybit_api_key: '',
    bybit_api_secret: '',
    symbol: 'BTC/USDT',
    symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
    trade_usdt: 1.0,
    // Swing — R:R and TSL
    min_rr_ratio: 3.0,
    atr_1h_multiplier: 1.5,
    tp1_position_size: 0.5,
    // Swing — divergence
    div_max_age_candles: 8,
    div_min_rsi_level: 50.0,
    // Swing — volume
    volume_weak_seller_ratio: 0.85,
    // Swing — Fibonacci
    daily_pullback_tolerance: 0.015,
    // Hold
    max_hold_hours: 72,
    max_trades_per_day: 1,
    // Telegram
    telegram_token: '',
    telegram_chat_id: '',
    sandbox_mode: false,
  })
  const [saved, setSaved] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState(null)

  useEffect(() => {
    api.get('/config').then((r) => {
      const data = r.data
      if (typeof data.symbols === 'string') {
        data.symbols = data.symbols.split(',').map((s) => s.trim()).filter(Boolean)
      }
      setForm((f) => ({ ...f, ...data }))
    }).catch(() => {})
  }, [])

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const toggleSymbol = (sym) => {
    const current = Array.isArray(form.symbols) ? form.symbols : []
    if (current.includes(sym)) {
      if (current.length <= 1) return
      update('symbols', current.filter((s) => s !== sym))
    } else {
      if (current.length >= 3) return
      update('symbols', [...current, sym])
    }
  }

  const save = async () => {
    const payload = { ...form }
    if (Array.isArray(payload.symbols)) {
      payload.symbols = payload.symbols.join(',')
    }
    await api.post('/config', payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testTelegram = async () => {
    const r = await api.post('/config/test-telegram')
    setTelegramStatus(r.data.success ? 'Message sent!' : `Error: ${r.data.error}`)
    setTimeout(() => setTelegramStatus(null), 4000)
  }

  const currentSymbols = Array.isArray(form.symbols) ? form.symbols : []

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-bold">Settings — Swing Strategy</h2>

      <Section title="Exchange — Bybit">
        <Field label="Bybit API Key">
          <input type="password" className="input" value={form.bybit_api_key}
            onChange={(e) => update('bybit_api_key', e.target.value)} />
        </Field>
        <Field label="Bybit API Secret">
          <input type="password" className="input" value={form.bybit_api_secret}
            onChange={(e) => update('bybit_api_secret', e.target.value)} />
        </Field>
        <Field label="Sandbox Mode">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.sandbox_mode}
              onChange={(e) => update('sandbox_mode', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-gray-400">Enable sandbox (paper trading)</span>
          </label>
        </Field>
      </Section>

      <Section title="Watchlist (BTC · ETH · SOL)">
        <p className="text-xs text-gray-500 mb-3">
          Selected: {currentSymbols.join(', ')} — swing strategy needs deep liquidity.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ALL_SYMBOLS.map((sym) => {
            const selected = currentSymbols.includes(sym)
            return (
              <button key={sym} onClick={() => toggleSymbol(sym)}
                className={`text-sm py-2 px-3 rounded-lg border transition-colors font-mono ${
                  selected
                    ? 'bg-indigo-700 border-indigo-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                }`}>
                {sym.replace('/USDT', '')}
                {selected && ' ✓'}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Trade Sizing">
        <Field label="Trade Size (USDT) — max $1.00">
          <input type="number" step="0.1" max="1" min="0.1" className="input"
            value={form.trade_usdt}
            onChange={(e) => update('trade_usdt', parseFloat(e.target.value))} />
        </Field>
      </Section>

      <Section title="Strategy — R:R & Exit">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Min R:R Ratio (${form.min_rr_ratio}:1)`}>
            <input type="range" min={2.0} max={5.0} step={0.5} className="w-full accent-indigo-500"
              value={form.min_rr_ratio}
              onChange={(e) => update('min_rr_ratio', parseFloat(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">Minimum reward:risk required to enter</p>
          </Field>
          <Field label={`ATR Multiplier (${form.atr_1h_multiplier}×)`}>
            <input type="range" min={1.0} max={3.0} step={0.25} className="w-full accent-indigo-500"
              value={form.atr_1h_multiplier}
              onChange={(e) => update('atr_1h_multiplier', parseFloat(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">TSL distance = 1H ATR × multiplier</p>
          </Field>
          <Field label="TP1 Position Size (always 50%)">
            <input type="text" className="input bg-gray-800 text-gray-500 cursor-not-allowed"
              value="50% (fixed)" readOnly />
          </Field>
          <Field label={`Max Hold Hours (${form.max_hold_hours}h)`}>
            <input type="range" min={24} max={168} step={24} className="w-full accent-indigo-500"
              value={form.max_hold_hours}
              onChange={(e) => update('max_hold_hours', parseInt(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">TIMEOUT forced after this many hours</p>
          </Field>
        </div>
      </Section>

      <Section title="Strategy — Divergence Detection">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Divergence Lookback (${form.div_max_age_candles} × 4H candles)`}>
            <input type="range" min={4} max={16} step={2} className="w-full accent-indigo-500"
              value={form.div_max_age_candles}
              onChange={(e) => update('div_max_age_candles', parseInt(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">How far back to look for RSI divergence</p>
          </Field>
          <Field label={`RSI Oversold Level (${form.div_min_rsi_level})`}>
            <input type="range" min={30} max={60} step={5} className="w-full accent-indigo-500"
              value={form.div_min_rsi_level}
              onChange={(e) => update('div_min_rsi_level', parseFloat(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">RSI at 2nd low must be below this</p>
          </Field>
        </div>
      </Section>

      <Section title="Strategy — Volume & Fibonacci">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Weak Seller Ratio (${(form.volume_weak_seller_ratio * 100).toFixed(0)}%)`}>
            <input type="range" min={0.60} max={0.95} step={0.05} className="w-full accent-indigo-500"
              value={form.volume_weak_seller_ratio}
              onChange={(e) => update('volume_weak_seller_ratio', parseFloat(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">Green candle volume &lt; ratio × avg = weak sellers</p>
          </Field>
          <Field label={`Fib Zone Tolerance (${(form.daily_pullback_tolerance * 100).toFixed(1)}%)`}>
            <input type="range" min={0.005} max={0.030} step={0.005} className="w-full accent-indigo-500"
              value={form.daily_pullback_tolerance}
              onChange={(e) => update('daily_pullback_tolerance', parseFloat(e.target.value))} />
            <p className="text-xs text-gray-600 mt-0.5">Price must be within this % of fib level</p>
          </Field>
        </div>
      </Section>

      <Section title="Telegram">
        <Field label="Bot Token">
          <input type="password" className="input" value={form.telegram_token}
            onChange={(e) => update('telegram_token', e.target.value)} />
        </Field>
        <Field label="Chat ID">
          <input type="text" className="input" value={form.telegram_chat_id}
            onChange={(e) => update('telegram_chat_id', e.target.value)} />
        </Field>
        <button onClick={testTelegram}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded">
          Test Telegram
        </button>
        {telegramStatus && <p className="text-xs text-gray-400 mt-1">{telegramStatus}</p>}
      </Section>

      <button onClick={save}
        className={`w-full py-2 rounded-lg font-semibold text-sm transition-colors ${
          saved ? 'bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}>
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 space-y-4">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
