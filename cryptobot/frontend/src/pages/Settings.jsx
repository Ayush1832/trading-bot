import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useApi.js'
import { Panel, Chip } from '../ui/kit.jsx'

const ALL_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'LINK/USDT', 'MATIC/USDT', 'DOGE/USDT', 'ADA/USDT']

function Field({ label, hint, warning, children }) {
  return (
    <div>
      <label className="text-2xs font-medium text-tx-2 block mb-1">{label}</label>
      {children}
      {hint && <p className="text-3xs text-tx-faint mt-1">{hint}</p>}
      {warning && <p className="text-3xs text-warn mt-1">⚠ {warning}</p>}
    </div>
  )
}

function Slider({ label, display, min, max, step, value, onChange, hint }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-2xs font-medium text-tx-2">{label}</label>
        <span className="text-2xs font-mono font-semibold text-accent">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#7aa2ff] h-1"
      />
      {hint && <p className="text-3xs text-tx-faint mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left w-full group">
      <span className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${checked ? 'bg-accent/80' : 'bg-ink-750'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
      <span>
        <span className="text-xs font-medium text-tx block">{label}</span>
        {description && <span className="text-3xs text-tx-dim block mt-0.5">{description}</span>}
      </span>
    </button>
  )
}

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
    telegram_token: '',
    telegram_chat_id: '',
    sandbox_mode: false,
  })
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState('idle')
  const [tgStatus, setTgStatus] = useState(null)
  const [errors, setErrors] = useState({})

  const loadConfig = useCallback(() => {
    api.get('/config').then((r) => {
      const data = r.data
      if (typeof data.symbols === 'string') {
        data.symbols = data.symbols.split(',').map((s) => s.trim()).filter(Boolean)
      }
      setForm((f) => ({ ...f, ...data }))
    }).catch(() => {})
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const up = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
    if (errors[k]) setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  }

  const toggleSymbol = (sym) => {
    const curr = Array.isArray(form.symbols) ? form.symbols : []
    if (curr.includes(sym)) {
      if (curr.length <= 1) return
      up('symbols', curr.filter((s) => s !== sym))
    } else {
      if (curr.length >= 6) return
      up('symbols', [...curr, sym])
    }
  }

  const validate = () => {
    const errs = {}
    if (form.trade_usdt > 1) errs.trade_usdt = 'Hard cap is $1.00'
    if (form.trade_usdt < 0.1) errs.trade_usdt = 'Minimum is $0.10'
    if (!form.sandbox_mode && !form.bybit_api_key?.trim()) errs.bybit_api_key = 'Required for live trading'
    if (!form.sandbox_mode && !form.bybit_api_secret?.trim()) errs.bybit_api_secret = 'Required for live trading'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const save = async () => {
    if (!validate()) return
    const liveKeys = form.bybit_api_key && form.bybit_api_key !== 'your_real_api_key_here' && !form.sandbox_mode
    if (liveKeys && !window.confirm(
      'You are saving LIVE API keys with real-money mode enabled.\n\nContinue?'
    )) return

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
      setTgStatus({ ok: false, msg: 'Enter token and chat ID first' })
      setTimeout(() => setTgStatus(null), 3000)
      return
    }
    try {
      const r = await api.post('/config/test-telegram')
      setTgStatus(r.data.success ? { ok: true, msg: 'Message delivered' } : { ok: false, msg: r.data.error })
    } catch (e) {
      setTgStatus({ ok: false, msg: e.message })
    }
    setTimeout(() => setTgStatus(null), 4000)
  }

  const symbols = Array.isArray(form.symbols) ? form.symbols : []

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4 animate-enter pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-tx">Configuration</h1>
          <p className="text-2xs text-tx-dim mt-0.5">Engine, strategy, and risk parameters</p>
        </div>
        {dirty && <Chip tone="warn">UNSAVED CHANGES</Chip>}
      </div>

      {/* Exchange */}
      <Panel title="Exchange — Bybit">
        <div className="space-y-4">
          <Field label="API key" hint="Trade permission only — never grant withdrawals." warning={errors.bybit_api_key}>
            <input type="password" className="input" value={form.bybit_api_key}
              onChange={(e) => up('bybit_api_key', e.target.value)} placeholder="••••••••••••" />
          </Field>
          <Field label="API secret" warning={errors.bybit_api_secret}>
            <input type="password" className="input" value={form.bybit_api_secret}
              onChange={(e) => up('bybit_api_secret', e.target.value)} placeholder="••••••••••••" />
          </Field>
          <Toggle
            checked={!!form.sandbox_mode}
            onChange={(v) => up('sandbox_mode', v)}
            label="Testnet sandbox"
            description="Trade on Bybit testnet — no real capital, limited pairs"
          />
          {!form.sandbox_mode && (
            <div className="rounded-md border border-down/25 bg-down/5 px-3 py-2.5">
              <p className="text-2xs text-down font-semibold">LIVE MODE</p>
              <p className="text-3xs text-tx-dim mt-0.5">Real USDT will be traded on Bybit mainnet.</p>
            </div>
          )}
        </div>
      </Panel>

      {/* Watchlist */}
      <Panel title="Watchlist" right={<span className="text-3xs font-mono text-tx-faint">{symbols.length}/6</span>}>
        <div className="grid grid-cols-4 gap-1.5">
          {ALL_SYMBOLS.map((sym) => {
            const on = symbols.includes(sym)
            return (
              <button
                key={sym}
                onClick={() => toggleSymbol(sym)}
                className={`py-2 rounded-md border text-xs font-mono font-semibold transition-colors duration-150 ${
                  on
                    ? 'bg-accent/10 border-accent/40 text-accent'
                    : 'bg-ink-850 border-line text-tx-dim hover:border-line-strong hover:text-tx-2'
                }`}
              >
                {sym.replace('/USDT', '')}
              </button>
            )
          })}
        </div>
      </Panel>

      {/* Sizing */}
      <Panel title="Position sizing">
        <Field label="Trade size (USDT)" hint="Hard-capped at $1.00 per position by the risk engine." warning={errors.trade_usdt}>
          <input
            type="number" step="0.10" min="0.10" max="1.00"
            className="input w-32" value={form.trade_usdt}
            onChange={(e) => up('trade_usdt', parseFloat(e.target.value))}
          />
        </Field>
      </Panel>

      {/* Strategy */}
      <Panel title="Strategy — entries & exits">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <Slider
            label="Min reward : risk" display={`${Number(form.min_rr_ratio).toFixed(1)}:1`}
            min={2} max={5} step={0.5} value={form.min_rr_ratio}
            onChange={(v) => up('min_rr_ratio', v)}
            hint="Floor for accepting a signal"
          />
          <Slider
            label="ATR trail multiplier" display={`${Number(form.atr_1h_multiplier).toFixed(2)}×`}
            min={1} max={3} step={0.25} value={form.atr_1h_multiplier}
            onChange={(v) => up('atr_1h_multiplier', v)}
            hint="Trailing stop distance = 1H ATR × this"
          />
          <Slider
            label="Max hold" display={`${form.max_hold_hours}h`}
            min={24} max={168} step={24} value={form.max_hold_hours}
            onChange={(v) => up('max_hold_hours', v)}
            hint="Forced timeout exit"
          />
          <Slider
            label="Divergence lookback" display={`${form.div_max_age_candles} × 4H`}
            min={4} max={16} step={2} value={form.div_max_age_candles}
            onChange={(v) => up('div_max_age_candles', v)}
            hint="Window for the second RSI low"
          />
          <Slider
            label="RSI oversold ceiling" display={Number(form.div_min_rsi_level).toFixed(0)}
            min={30} max={60} step={5} value={form.div_min_rsi_level}
            onChange={(v) => up('div_min_rsi_level', v)}
            hint="RSI at second low must be below this"
          />
          <Slider
            label="Weak-seller ratio" display={`${(form.volume_weak_seller_ratio * 100).toFixed(0)}%`}
            min={0.6} max={0.95} step={0.05} value={form.volume_weak_seller_ratio}
            onChange={(v) => up('volume_weak_seller_ratio', v)}
            hint="Volume below this × average = exhaustion"
          />
          <Slider
            label="Fib zone tolerance" display={`${(form.daily_pullback_tolerance * 100).toFixed(1)}%`}
            min={0.005} max={0.03} step={0.005} value={form.daily_pullback_tolerance}
            onChange={(v) => up('daily_pullback_tolerance', v)}
            hint="Distance from Fib level that still counts"
          />
        </div>
      </Panel>

      {/* Telegram */}
      <Panel title="Notifications — Telegram">
        <div className="space-y-4">
          <Field label="Bot token" hint="Create one via @BotFather">
            <input type="password" className="input" value={form.telegram_token}
              onChange={(e) => up('telegram_token', e.target.value)} placeholder="1234567890:AAF…" />
          </Field>
          <Field label="Chat ID" hint="Find yours via @userinfobot">
            <input type="text" className="input" value={form.telegram_chat_id}
              onChange={(e) => up('telegram_chat_id', e.target.value)} placeholder="123456789" />
          </Field>
          <div className="flex items-center gap-3">
            <button onClick={testTelegram} className="btn-outline">Send test message</button>
            {tgStatus && (
              <span className={`text-2xs ${tgStatus.ok ? 'text-up' : 'text-down'}`}>
                {tgStatus.ok ? '✓ ' : ''}{tgStatus.msg}
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* Save bar */}
      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          onClick={save}
          disabled={!dirty || saveState === 'saving'}
          className={`flex-1 py-2.5 rounded-md text-xs font-bold tracking-wide transition-all duration-200 ${
            saveState === 'saved' ? 'bg-up/15 text-up border border-up/30'
            : saveState === 'error' ? 'bg-down/15 text-down border border-down/30'
            : dirty ? 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25'
            : 'bg-ink-850 text-tx-faint border border-line cursor-not-allowed'
          }`}
        >
          {saveState === 'saved' ? '✓ SAVED' : saveState === 'error' ? 'SAVE FAILED' : saveState === 'saving' ? 'SAVING…' : dirty ? 'SAVE CONFIGURATION' : 'NO CHANGES'}
        </button>
        {dirty && (
          <button onClick={() => { setDirty(false); setErrors({}); loadConfig() }} className="btn-ghost">
            Discard
          </button>
        )}
      </div>
    </div>
  )
}
