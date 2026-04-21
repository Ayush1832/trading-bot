import { useState, useEffect } from 'react'
import api from '../hooks/useApi.js'

export default function Settings() {
  const [form, setForm] = useState({
    mexc_api_key: '',
    mexc_api_secret: '',
    symbol: 'BTC/USDT',
    trade_usdt: 1.0,
    trail_pct: 0.008,
    take_profit_pct: 0.012,
    hard_sl_pct: 0.008,
    max_hold_minutes: 30,
    cooldown_seconds: 120,
    max_trades_per_hour: 6,
    telegram_token: '',
    telegram_chat_id: '',
    sandbox_mode: false,
  })
  const [saved, setSaved] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState(null)

  useEffect(() => {
    api.get('/config').then((r) => {
      setForm((f) => ({ ...f, ...r.data }))
    }).catch(() => {})
  }, [])

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    await api.post('/config', form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testTelegram = async () => {
    const r = await api.post('/config/test-telegram')
    setTelegramStatus(r.data.success ? 'Message sent!' : `Error: ${r.data.error}`)
    setTimeout(() => setTelegramStatus(null), 4000)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-lg font-bold">Settings</h2>

      <Section title="Exchange">
        <Field label="MEXC API Key">
          <input type="password" className="input" value={form.mexc_api_key} onChange={(e) => update('mexc_api_key', e.target.value)} />
        </Field>
        <Field label="MEXC API Secret">
          <input type="password" className="input" value={form.mexc_api_secret} onChange={(e) => update('mexc_api_secret', e.target.value)} />
        </Field>
        <Field label="Sandbox Mode">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.sandbox_mode} onChange={(e) => update('sandbox_mode', e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-gray-400">Enable sandbox (paper trading)</span>
          </label>
        </Field>
      </Section>

      <Section title="Trading">
        <Field label="Symbol">
          <select className="input" value={form.symbol} onChange={(e) => update('symbol', e.target.value)}>
            <option>BTC/USDT</option>
            <option>ETH/USDT</option>
            <option>SOL/USDT</option>
          </select>
        </Field>
        <Field label="Trade Size (USDT)">
          <input type="number" step="0.1" max="1" min="0.1" className="input" value={form.trade_usdt} onChange={(e) => update('trade_usdt', parseFloat(e.target.value))} />
        </Field>
      </Section>

      <Section title="Strategy">
        <Field label={`Trail % (${(form.trail_pct * 100).toFixed(1)}%)`}>
          <input type="number" step="0.001" className="input" value={form.trail_pct} onChange={(e) => update('trail_pct', parseFloat(e.target.value))} />
        </Field>
        <Field label={`Take Profit % (${(form.take_profit_pct * 100).toFixed(1)}%)`}>
          <input type="number" step="0.001" className="input" value={form.take_profit_pct} onChange={(e) => update('take_profit_pct', parseFloat(e.target.value))} />
        </Field>
        <Field label={`Hard Stop Loss % (${(form.hard_sl_pct * 100).toFixed(1)}%)`}>
          <input type="number" step="0.001" className="input" value={form.hard_sl_pct} onChange={(e) => update('hard_sl_pct', parseFloat(e.target.value))} />
        </Field>
        <Field label="Max Hold (minutes)">
          <input type="number" className="input" value={form.max_hold_minutes} onChange={(e) => update('max_hold_minutes', parseInt(e.target.value))} />
        </Field>
        <Field label="Cooldown (seconds)">
          <input type="number" className="input" value={form.cooldown_seconds} onChange={(e) => update('cooldown_seconds', parseInt(e.target.value))} />
        </Field>
        <Field label="Max Trades per Hour">
          <input type="number" className="input" value={form.max_trades_per_hour} onChange={(e) => update('max_trades_per_hour', parseInt(e.target.value))} />
        </Field>
      </Section>

      <Section title="Telegram">
        <Field label="Bot Token">
          <input type="password" className="input" value={form.telegram_token} onChange={(e) => update('telegram_token', e.target.value)} />
        </Field>
        <Field label="Chat ID">
          <input type="text" className="input" value={form.telegram_chat_id} onChange={(e) => update('telegram_chat_id', e.target.value)} />
        </Field>
        <button
          onClick={testTelegram}
          className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-3 py-1.5 rounded"
        >
          Test Telegram
        </button>
        {telegramStatus && <p className="text-xs text-gray-400 mt-1">{telegramStatus}</p>}
      </Section>

      <button
        onClick={save}
        className={`w-full py-2 rounded-lg font-semibold text-sm transition-colors ${
          saved ? 'bg-green-700 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
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
