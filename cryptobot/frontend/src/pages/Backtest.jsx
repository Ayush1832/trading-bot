import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, CartesianGrid,
} from 'recharts'
import api from '../hooks/useApi.js'
import { Panel, GradeBadge, Stat, Empty, fmtPx, fmtSigned, fmtDay, pnlColor } from '../ui/kit.jsx'

/* ── Parameter form ──────────────────────────────────────────────────── */

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

function ParamsPanel({ onResult }) {
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

  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.post('/backtest', {
        ...form,
        daily_pullback_tolerance: form.daily_pullback_tolerance / 100,
      })
      onResult({ ...r.data, _params: form })
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel title="Parameters" className="h-fit">
      <div className="space-y-4">
        <div>
          <label className="text-2xs font-medium text-tx-2 block mb-1">Market</label>
          <select className="input" value={form.symbol} onChange={(e) => up('symbol', e.target.value)}>
            <option>BTC/USDT</option>
            <option>ETH/USDT</option>
            <option>SOL/USDT</option>
            <option>AVAX/USDT</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-2xs font-medium text-tx-2 block mb-1">From</label>
            <input type="date" className="input" value={form.start_date} onChange={(e) => up('start_date', e.target.value)} />
          </div>
          <div>
            <label className="text-2xs font-medium text-tx-2 block mb-1">To</label>
            <input type="date" className="input" value={form.end_date} onChange={(e) => up('end_date', e.target.value)} />
          </div>
        </div>

        <div className="pt-1 space-y-4 border-t border-line-soft">
          <Slider
            label="Min reward : risk" display={`${form.min_rr_ratio.toFixed(1)}:1`}
            min={2} max={5} step={0.5} value={form.min_rr_ratio}
            onChange={(v) => up('min_rr_ratio', v)}
            hint="Higher = fewer, better setups"
          />
          <Slider
            label="ATR trail multiplier" display={`${form.atr_1h_multiplier.toFixed(2)}×`}
            min={1} max={3} step={0.25} value={form.atr_1h_multiplier}
            onChange={(v) => up('atr_1h_multiplier', v)}
          />
          <Slider
            label="Max hold" display={`${form.max_hold_hours}h`}
            min={24} max={168} step={24} value={form.max_hold_hours}
            onChange={(v) => up('max_hold_hours', v)}
          />
          <Slider
            label="Fib zone tolerance" display={`${form.daily_pullback_tolerance.toFixed(1)}%`}
            min={0.5} max={3} step={0.5} value={form.daily_pullback_tolerance}
            onChange={(v) => up('daily_pullback_tolerance', v)}
          />
        </div>

        {error && <p className="text-2xs text-down">{error}</p>}

        <button onClick={run} disabled={loading} className="btn-accent w-full py-2.5">
          {loading ? (
            <>
              <span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" />
              Simulating…
            </>
          ) : 'Run Backtest'}
        </button>
        <p className="text-3xs text-tx-faint leading-relaxed">
          1H base data, resampled to 4H / 1D / 1W. Needs ~1 year of history before the start date for indicator warm-up.
        </p>
      </div>
    </Panel>
  )
}

/* ── Result analytics ────────────────────────────────────────────────── */

function buildDrawdown(curve) {
  let peak = 0
  return (curve || []).map((p) => {
    if (p.equity_usdt > peak) peak = p.equity_usdt
    const dd = peak > 0 ? ((p.equity_usdt - peak) / peak) * 100 : 0
    return { timestamp: p.timestamp, dd: Math.min(0, dd) }
  })
}

function buildMonthly(trades) {
  const byMonth = {}
  for (const t of trades || []) {
    if (!t.exit_time) continue
    const d = new Date(t.exit_time)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth[key] = (byMonth[key] || 0) + (t.total_pnl_usdt ?? t.pnl_usdt ?? 0)
  }
  return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month, pnl }))
}

function MonthlyHeat({ trades }) {
  const months = buildMonthly(trades)
  if (!months.length) return null
  const maxAbs = Math.max(...months.map((m) => Math.abs(m.pnl)), 1e-9)

  return (
    <Panel title="Monthly returns">
      <div className="flex flex-wrap gap-1.5">
        {months.map((m) => {
          const intensity = Math.abs(m.pnl) / maxAbs
          const pos = m.pnl >= 0
          const bg = pos
            ? `rgba(25,198,133,${0.08 + intensity * 0.32})`
            : `rgba(240,68,92,${0.08 + intensity * 0.32})`
          const [y, mo] = m.month.split('-')
          const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short' })
          return (
            <div
              key={m.month}
              className="rounded-md border border-line px-2.5 py-2 min-w-[72px]"
              style={{ background: bg }}
              title={`${m.month}: ${fmtSigned(m.pnl)}`}
            >
              <p className="text-3xs font-mono text-tx-dim">{label} ’{y.slice(2)}</p>
              <p className={`text-2xs font-mono font-bold mt-0.5 ${pos ? 'text-up' : 'text-down'}`}>{fmtSigned(m.pnl, 2)}</p>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function ChartTip({ active, payload, fmt }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-ink-850 border border-line rounded-md px-2.5 py-1.5 text-2xs font-mono shadow-xl">
      <span className="text-tx-dim">{fmtDay(d.timestamp)}</span>{' '}
      <span className="text-tx font-semibold">{fmt(d)}</span>
    </div>
  )
}

const EXIT_COLORS = { TAKE_PROFIT: '#19c685', TRAILING_SL: '#7aa2ff', HARD_SL: '#f0445c', TIMEOUT: '#e7a13d' }

function Results({ result }) {
  const [showAll, setShowAll] = useState(false)
  const isPos = result.total_pnl_usdt >= 0
  const dd = buildDrawdown(result.equity_curve)

  const reasonCounts = {}
  for (const t of result.trades || []) {
    if (t.exit_reason) reasonCounts[t.exit_reason] = (reasonCounts[t.exit_reason] || 0) + 1
  }
  const reasons = Object.entries(reasonCounts).map(([k, v]) => ({ reason: k, count: v }))
  const trades = showAll ? result.trades || [] : (result.trades || []).slice(0, 25)

  return (
    <div className="space-y-3">
      {/* Verdict strip */}
      <div className="panel grid grid-cols-3 lg:grid-cols-6 divide-x divide-line-soft">
        <Stat className="px-4 py-3" label="Net P&L" value={fmtSigned(result.total_pnl_usdt)} tone={isPos ? 'up' : 'down'} />
        <Stat
          className="px-4 py-3" label="Win rate"
          value={`${(result.win_rate * 100).toFixed(0)}%`}
          tone={result.win_rate >= 0.5 ? 'up' : 'down'}
          sub={`${result.total_trades} trades`}
        />
        <Stat
          className="px-4 py-3" label="Profit factor"
          value={result.profit_factor === Infinity ? '∞' : result.profit_factor.toFixed(2)}
          tone={result.profit_factor >= 1.5 ? 'up' : result.profit_factor >= 1 ? undefined : 'down'}
        />
        <Stat className="px-4 py-3" label="Max drawdown" value={`${result.max_drawdown_pct.toFixed(1)}%`} tone="down" />
        <Stat
          className="px-4 py-3" label="Sharpe"
          value={result.sharpe_ratio.toFixed(2)}
          tone={result.sharpe_ratio >= 1 ? 'up' : result.sharpe_ratio < 0 ? 'down' : undefined}
        />
        <Stat className="px-4 py-3" label="Trades" value={String(result.total_trades)} />
      </div>

      {/* Equity + drawdown stacked */}
      {result.equity_curve?.length > 0 && (
        <Panel title="Equity & drawdown" flush>
          <div className="px-3 pt-3">
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={result.equity_curve} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} syncId="bt">
                <defs>
                  <linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPos ? '#19c685' : '#f0445c'} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={isPos ? '#19c685' : '#f0445c'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#11141c" vertical={false} />
                <XAxis dataKey="timestamp" hide />
                <YAxis
                  tick={{ fill: '#5e6778', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={52}
                  tickFormatter={(v) => `$${v.toFixed(2)}`} axisLine={false} tickLine={false}
                />
                <Tooltip content={<ChartTip fmt={(d) => `$${d.equity_usdt?.toFixed(4)}`} />} />
                <ReferenceLine y={0} stroke="#1b2030" />
                <Area type="monotone" dataKey="equity_usdt" stroke={isPos ? '#19c685' : '#f0445c'} strokeWidth={1.5} fill="url(#eqG)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="px-3 pb-3 border-t border-line-soft pt-1">
            <ResponsiveContainer width="100%" height={90}>
              <AreaChart data={dd} margin={{ top: 2, right: 4, left: 0, bottom: 0 }} syncId="bt">
                <defs>
                  <linearGradient id="ddG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f0445c" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="#f0445c" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="timestamp" hide />
                <YAxis
                  tick={{ fill: '#5e6778', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={52}
                  tickFormatter={(v) => `${v.toFixed(0)}%`} axisLine={false} tickLine={false}
                />
                <Tooltip content={<ChartTip fmt={(d) => `${d.dd?.toFixed(2)}% drawdown`} />} />
                <Area type="monotone" dataKey="dd" stroke="#f0445c" strokeWidth={1} fill="url(#ddG)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MonthlyHeat trades={result.trades} />
        {reasons.length > 0 && (
          <Panel title="Exit distribution">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={reasons} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="reason" tick={{ fill: '#5e6778', fontSize: 9, fontFamily: 'JetBrains Mono' }} tickFormatter={(v) => v.replace('_', ' ')} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5e6778', fontSize: 9, fontFamily: 'JetBrains Mono' }} width={28} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#10131a', border: '1px solid #1b2030', borderRadius: 6, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={48}>
                  {reasons.map((r) => <Cell key={r.reason} fill={EXIT_COLORS[r.reason] || '#5e6778'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}
      </div>

      {/* Trades */}
      {result.trades?.length > 0 && (
        <Panel
          title={`Simulated trades (${result.trades.length})`}
          flush
          right={
            result.trades.length > 25 && (
              <button onClick={() => setShowAll((v) => !v)} className="text-2xs text-accent hover:text-accent-glow font-medium">
                {showAll ? 'Show fewer' : 'Show all'}
              </button>
            )
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  {['Date', 'Grade', 'Entry', 'Exit', 'P&L', 'Reason'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left microlabel whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => {
                  const pnl = t.total_pnl_usdt ?? t.pnl_usdt ?? 0
                  return (
                    <tr key={t.entry_time ?? i} className="border-b border-line-soft last:border-0">
                      <td className="px-4 py-2 font-mono text-tx-dim whitespace-nowrap">{fmtDay(t.entry_time)}</td>
                      <td className="px-4 py-2"><GradeBadge grade={t.grade} /></td>
                      <td className="px-4 py-2 font-mono text-tx-2">{fmtPx(t.entry_price)}</td>
                      <td className="px-4 py-2 font-mono text-tx-2">{fmtPx(t.exit_price)}</td>
                      <td className={`px-4 py-2 font-mono font-semibold ${pnlColor(pnl)}`}>{fmtSigned(pnl)}</td>
                      <td className="px-4 py-2">
                        <span className="text-2xs font-medium" style={{ color: EXIT_COLORS[t.exit_reason] || '#5e6778' }}>
                          {t.exit_reason?.replace('_', ' ') ?? '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */

export default function Backtest() {
  const [result, setResult] = useState(null)

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4 animate-enter">
      <div>
        <h1 className="text-base font-bold text-tx">Backtest Lab</h1>
        <p className="text-2xs text-tx-dim mt-0.5">Simulate the Precision Swing strategy over historical data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
        <ParamsPanel onResult={setResult} />
        {result ? (
          <Results result={result} />
        ) : (
          <Panel className="h-64">
            <Empty className="h-full flex-col gap-2">
              <svg className="w-8 h-8 text-tx-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 3v18h18" /><path d="M7 13l3-3 4 4 5-6" />
              </svg>
              <span>Configure parameters and run a simulation</span>
            </Empty>
          </Panel>
        )}
      </div>
    </div>
  )
}
