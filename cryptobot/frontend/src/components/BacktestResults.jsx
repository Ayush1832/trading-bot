import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import api from '../hooks/useApi.js'

function fmt(v, d = 2) { return v != null ? Number(v).toFixed(d) : '—' }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—' }

function holdDuration(entry, exit) {
  if (!entry || !exit) return '—'
  const ms = new Date(exit) - new Date(entry)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const EXIT_STYLE = {
  TAKE_PROFIT: 'text-emerald-400',
  TRAILING_SL: 'text-teal-400',
  HARD_SL: 'text-red-400',
  TIMEOUT: 'text-amber-400',
}

// ── Metric card ───────────────────────────────────────────────────────────────

function Metric({ label, value, color = 'text-white', sub }) {
  return (
    <div className="bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-700/50">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Custom tooltips ───────────────────────────────────────────────────────────

function EquityTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-500">{fmtDate(d.timestamp)}</p>
      <p className={`font-mono font-semibold mt-0.5 ${d.equity_usdt >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        ${fmt(d.equity_usdt, 4)}
      </p>
      {d.pnl_usdt != null && (
        <p className={`font-mono mt-0.5 ${d.pnl_usdt >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          Trade: {d.pnl_usdt >= 0 ? '+' : ''}${fmt(d.pnl_usdt, 4)}
        </p>
      )}
      {d.symbol && <p className="text-gray-600 mt-0.5">{d.symbol}</p>}
    </div>
  )
}

function DrawdownTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-500">{fmtDate(d.timestamp)}</p>
      <p className="font-mono text-red-400">{fmt(d.drawdown_pct, 2)}% DD</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BacktestResults({ result }) {
  const [showAll, setShowAll] = useState(false)
  if (!result) return null

  const isPositive = result.total_pnl_usdt >= 0
  const winRate = result.win_rate ?? 0
  const pnlColor = isPositive ? 'text-emerald-400' : 'text-red-400'

  // Build drawdown curve from equity_curve
  const drawdownCurve = (() => {
    let peak = 0
    return (result.equity_curve || []).map(p => {
      if (p.equity_usdt > peak) peak = p.equity_usdt
      const dd = peak > 0 ? ((p.equity_usdt - peak) / peak) * 100 : 0
      return { timestamp: p.timestamp, drawdown_pct: Math.min(0, dd) }
    })
  })()

  // Win/loss distribution (by exit reason)
  const reasonCounts = {}
  for (const t of result.trades || []) {
    if (!t.exit_reason) continue
    reasonCounts[t.exit_reason] = (reasonCounts[t.exit_reason] || 0) + 1
  }
  const reasonData = Object.entries(reasonCounts).map(([k, v]) => ({ reason: k.replace('_', ' '), count: v }))

  // Trade list
  const tradesToShow = showAll ? result.trades || [] : (result.trades || []).slice(0, 30)

  const applySettings = async () => {
    if (!window.confirm('Apply these backtest parameters to your live settings?')) return
    try {
      await api.post('/config', {
        min_rr_ratio: result.params?.min_rr_ratio,
        atr_1h_multiplier: result.params?.atr_1h_multiplier,
        max_hold_hours: result.params?.max_hold_hours,
        daily_pullback_tolerance: result.params?.daily_pullback_tolerance,
      })
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Metric label="Total Trades" value={result.total_trades} />
        <Metric label="Win Rate"
          value={`${(winRate * 100).toFixed(1)}%`}
          color={winRate >= 0.5 ? 'text-emerald-400' : 'text-red-400'}
          sub={`${result.winning_trades ?? '?'}W / ${result.losing_trades ?? '?'}L`} />
        <Metric label="Total P&L"
          value={`${isPositive ? '+' : ''}$${fmt(result.total_pnl_usdt, 4)}`}
          color={pnlColor} />
        <Metric label="Max Drawdown"
          value={`${fmt(result.max_drawdown_pct, 2)}%`}
          color="text-red-400" />
        <Metric label="Profit Factor"
          value={result.profit_factor === Infinity ? '∞' : fmt(result.profit_factor, 2)}
          color={result.profit_factor >= 1 ? 'text-emerald-400' : 'text-red-400'} />
        <Metric label="Sharpe"
          value={fmt(result.sharpe_ratio, 2)}
          color={result.sharpe_ratio >= 1 ? 'text-emerald-400' : result.sharpe_ratio >= 0 ? 'text-gray-300' : 'text-red-400'} />
      </div>

      {/* Equity + Drawdown charts */}
      {result.equity_curve?.length > 0 && (
        <div className="space-y-3">
          {/* Equity curve */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-300">Equity Curve</h4>
              <span className={`text-sm font-mono font-bold ${pnlColor}`}>
                {isPositive ? '+' : ''}${fmt(result.total_pnl_usdt, 4)}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={result.equity_curve} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="btEquity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="timestamp" hide />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} width={56}
                  tickFormatter={v => `$${Number(v).toFixed(2)}`} />
                <Tooltip content={<EquityTooltip />} />
                <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 2" />
                <Area type="monotone" dataKey="equity_usdt"
                  stroke={isPositive ? '#10b981' : '#ef4444'}
                  fill="url(#btEquity)"
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props
                    return <circle key={payload.trade_id} cx={cx} cy={cy} r={2.5}
                      fill={payload.win ? '#10b981' : '#ef4444'} stroke="none" />
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Drawdown curve */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-300">Drawdown</h4>
              <span className="text-sm font-mono text-red-400">
                Max {fmt(result.max_drawdown_pct, 2)}%
              </span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={drawdownCurve} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="btDD" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="timestamp" hide />
                <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} width={40}
                  tickFormatter={v => `${v.toFixed(0)}%`} />
                <Tooltip content={<DrawdownTooltip />} />
                <ReferenceLine y={0} stroke="#374151" />
                <Area type="monotone" dataKey="drawdown_pct"
                  stroke="#ef4444" fill="url(#btDD)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Exit reason distribution */}
      {reasonData.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Exit Distribution</h4>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={reasonData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="reason" tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [v, 'Trades']}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {reasonData.map((d, i) => (
                  <Cell key={i} fill={
                    d.reason === 'TAKE PROFIT' ? '#10b981'
                    : d.reason === 'TRAILING SL' ? '#14b8a6'
                    : d.reason === 'HARD SL' ? '#ef4444'
                    : '#d97706'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trade list */}
      {(result.trades?.length > 0) && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-300">
              Trade List <span className="text-gray-600 font-normal">({result.trades.length} total)</span>
            </h4>
            <button onClick={applySettings}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              Apply to Settings
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  {['#', 'Date', 'Symbol', 'Grade', 'Entry', 'Exit', 'P&L', 'Hold', 'Reason'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tradesToShow.map(t => {
                  const pnl = t.total_pnl_usdt ?? t.pnl_usdt ?? 0
                  const isWin = pnl > 0
                  return (
                    <tr key={t.id} className="border-b border-gray-800/60">
                      <td className="px-4 py-2 text-gray-600">{t.id}</td>
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtDate(t.entry_time)}</td>
                      <td className="px-4 py-2 text-gray-200 font-semibold">{t.symbol}</td>
                      <td className="px-4 py-2">
                        {t.grade ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                            t.grade === 'A+' ? 'text-emerald-400 bg-emerald-900/40'
                            : t.grade === 'A' ? 'text-blue-400 bg-blue-900/40'
                            : 'text-gray-300 bg-gray-800'}`}>
                            {t.grade}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-gray-300">${fmt(t.entry_price, 4)}</td>
                      <td className="px-4 py-2 font-mono text-gray-400">{t.exit_price ? `$${fmt(t.exit_price, 4)}` : '—'}</td>
                      <td className={`px-4 py-2 font-mono font-semibold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWin ? '+' : ''}${fmt(pnl, 4)}
                      </td>
                      <td className="px-4 py-2 text-gray-500 font-mono">{holdDuration(t.entry_time, t.exit_time)}</td>
                      <td className={`px-4 py-2 font-medium ${EXIT_STYLE[t.exit_reason] || 'text-gray-400'}`}>
                        {t.exit_reason?.replace('_', ' ') ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {result.trades.length > 30 && (
            <div className="px-5 py-3 border-t border-gray-800 text-center">
              <button onClick={() => setShowAll(v => !v)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                {showAll ? 'Show fewer' : `Show all ${result.trades.length} trades`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
