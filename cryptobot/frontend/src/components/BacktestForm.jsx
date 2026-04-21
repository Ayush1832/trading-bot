import { useState } from 'react'
import api from '../hooks/useApi.js'

export default function BacktestForm({ onResult }) {
  const [form, setForm] = useState({
    symbol: 'BTC/USDT',
    start_date: '2024-01-01',
    end_date: '2024-03-31',
    trail_pct: 0.8,
    take_profit_pct: 1.2,
    hard_sl_pct: 0.8,
    max_hold_minutes: 30,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const payload = {
        ...form,
        trail_pct: form.trail_pct / 100,
        take_profit_pct: form.take_profit_pct / 100,
        hard_sl_pct: form.hard_sl_pct / 100,
        timeframe: '1m',
      }
      const r = await api.post('/backtest', payload)
      onResult(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Backtest Parameters</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Symbol">
          <select className="input" value={form.symbol} onChange={(e) => update('symbol', e.target.value)}>
            <option>BTC/USDT</option>
            <option>ETH/USDT</option>
            <option>SOL/USDT</option>
          </select>
        </Field>

        <Field label="Start Date">
          <input type="date" className="input" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} />
        </Field>

        <Field label="End Date">
          <input type="date" className="input" value={form.end_date} onChange={(e) => update('end_date', e.target.value)} />
        </Field>

        <SliderField label={`Trail % (${form.trail_pct}%)`} min={0.3} max={2.0} step={0.1}
          value={form.trail_pct} onChange={(v) => update('trail_pct', v)} />

        <SliderField label={`Take Profit % (${form.take_profit_pct}%)`} min={0.5} max={3.0} step={0.1}
          value={form.take_profit_pct} onChange={(v) => update('take_profit_pct', v)} />

        <SliderField label={`Stop Loss % (${form.hard_sl_pct}%)`} min={0.3} max={2.0} step={0.1}
          value={form.hard_sl_pct} onChange={(v) => update('hard_sl_pct', v)} />

        <SliderField label={`Max Hold (${form.max_hold_minutes}m)`} min={10} max={60} step={5}
          value={form.max_hold_minutes} onChange={(v) => update('max_hold_minutes', v)} />
      </div>

      {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

      <button
        onClick={run}
        disabled={loading}
        className="mt-5 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg font-semibold text-sm transition-colors"
      >
        {loading ? 'Running Backtest...' : 'Run Backtest'}
      </button>
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

function SliderField({ label, min, max, step, value, onChange }) {
  return (
    <Field label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </Field>
  )
}
