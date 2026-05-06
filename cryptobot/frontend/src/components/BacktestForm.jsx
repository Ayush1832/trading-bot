import { useState } from 'react'
import api from '../hooks/useApi.js'

export default function BacktestForm({ onResult }) {
  const [form, setForm] = useState({
    symbol: 'BTC/USDT',
    start_date: '2023-01-01',
    end_date: '2024-01-01',
    min_rr_ratio: 3.0,
    atr_1h_multiplier: 1.5,
    max_hold_hours: 72,
    daily_pullback_tolerance: 1.5,
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
        daily_pullback_tolerance: form.daily_pullback_tolerance / 100,
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
      <h3 className="text-sm font-semibold text-gray-300 mb-1">Swing Backtest Parameters</h3>
      <p className="text-xs text-gray-600 mb-4">
        Uses 1H base data, resampled to 4H / 1D / 1W internally. Requires ~1 year of historical data before start date for indicator warm-up.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Symbol">
          <select className="input" value={form.symbol} onChange={(e) => update('symbol', e.target.value)}>
            <option>BTC/USDT</option>
            <option>ETH/USDT</option>
            <option>SOL/USDT</option>
          </select>
        </Field>

        <Field label="Start Date">
          <input type="date" className="input" value={form.start_date}
            onChange={(e) => update('start_date', e.target.value)} />
        </Field>

        <Field label="End Date">
          <input type="date" className="input" value={form.end_date}
            onChange={(e) => update('end_date', e.target.value)} />
        </Field>

        <SliderField label={`Min R:R (${form.min_rr_ratio}:1)`} min={2.0} max={5.0} step={0.5}
          value={form.min_rr_ratio} onChange={(v) => update('min_rr_ratio', v)} />

        <SliderField label={`ATR Multiplier (${form.atr_1h_multiplier}×)`} min={1.0} max={3.0} step={0.25}
          value={form.atr_1h_multiplier} onChange={(v) => update('atr_1h_multiplier', v)} />

        <SliderField label={`Max Hold (${form.max_hold_hours}h)`} min={24} max={168} step={24}
          value={form.max_hold_hours} onChange={(v) => update('max_hold_hours', v)} />

        <SliderField label={`Fib Tolerance (${form.daily_pullback_tolerance}%)`} min={0.5} max={3.0} step={0.5}
          value={form.daily_pullback_tolerance} onChange={(v) => update('daily_pullback_tolerance', v)} />
      </div>

      {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}

      <button onClick={run} disabled={loading}
        className="mt-5 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg font-semibold text-sm transition-colors">
        {loading ? 'Running Swing Backtest...' : 'Run Backtest'}
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
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500" />
    </Field>
  )
}
