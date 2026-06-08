import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useApi.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v, d = 4) { return v != null ? Number(v).toFixed(d) : '—' }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' }

function holdDuration(entry, exit) {
  if (!entry || !exit) return '—'
  const ms = new Date(exit) - new Date(entry)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const EXIT_STYLE = {
  TAKE_PROFIT: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40',
  TRAILING_SL:  'bg-teal-900/50 text-teal-300 border border-teal-700/40',
  HARD_SL:      'bg-red-900/50 text-red-300 border border-red-700/40',
  TIMEOUT:      'bg-amber-900/50 text-amber-300 border border-amber-700/40',
}

const GRADE_STYLE = {
  'A+': 'text-emerald-400 bg-emerald-900/40',
  'A':  'text-blue-400 bg-blue-900/40',
  'B':  'text-gray-300 bg-gray-800',
}

// ── Trade Detail Modal ────────────────────────────────────────────────────────

function TradeModal({ trade, onClose }) {
  if (!trade) return null

  const pnl = trade.total_pnl_usdt ?? trade.pnl_usdt ?? 0
  const pnlPct = trade.total_pnl_pct ?? trade.pnl_pct ?? 0
  const isWin = pnl > 0
  const pnlColor = isWin ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold text-white">{trade.symbol}</span>
            {trade.grade && (
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${GRADE_STYLE[trade.grade] || GRADE_STYLE['B']}`}>
                Grade {trade.grade}
              </span>
            )}
            <span className="text-xs text-gray-500">#{trade.id}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* P&L Hero */}
          <div className={`rounded-xl px-5 py-4 ${isWin ? 'bg-emerald-950/30 border border-emerald-800/30' : 'bg-red-950/30 border border-red-800/30'}`}>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-1">Total P&L</p>
                <p className={`text-3xl font-bold font-mono ${pnlColor}`}>
                  {isWin ? '+' : ''}${fmt(pnl, 4)}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-bold font-mono ${pnlColor}`}>
                  {isWin ? '+' : ''}{fmt(pnlPct, 3)}%
                </p>
                {trade.rr_ratio && (
                  <p className="text-xs text-gray-400 mt-1">R:R {fmt(trade.rr_ratio, 2)}:1</p>
                )}
              </div>
            </div>
            {trade.half_exited && trade.tp1_pnl_usdt != null && (
              <div className="mt-3 pt-3 border-t border-gray-700 flex gap-6 text-xs font-mono">
                <span className="text-emerald-400">TP1 partial +${fmt(trade.tp1_pnl_usdt, 4)}</span>
                <span className={pnlColor}>Final leg {isWin ? '+' : ''}${fmt(trade.pnl_usdt, 4)}</span>
              </div>
            )}
          </div>

          {/* Price levels */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Entry</p>
              <p className="text-sm font-mono text-white">${fmt(trade.entry_price, 4)}</p>
              <p className="text-xs text-gray-600">{fmtDate(trade.entry_time)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Exit</p>
              <p className="text-sm font-mono text-white">{trade.exit_price ? `$${fmt(trade.exit_price, 4)}` : '—'}</p>
              <p className="text-xs text-gray-600">{trade.exit_time ? fmtDate(trade.exit_time) : 'Open'}</p>
            </div>
            {trade.peak_price && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Peak Price</p>
                <p className="text-sm font-mono text-emerald-300">${fmt(trade.peak_price, 4)}</p>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Hold Duration</p>
              <p className="text-sm font-mono text-gray-200">{holdDuration(trade.entry_time, trade.exit_time)}</p>
            </div>
          </div>

          {/* SL / TP levels */}
          <div className="bg-gray-800/50 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Risk Levels</p>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              {trade.hard_sl_price && (
                <div>
                  <p className="text-gray-500 mb-0.5">Hard SL</p>
                  <p className="text-red-400">${fmt(trade.hard_sl_price, 4)}</p>
                </div>
              )}
              {trade.trailing_sl_final && (
                <div>
                  <p className="text-gray-500 mb-0.5">TSL Final</p>
                  <p className="text-amber-400">${fmt(trade.trailing_sl_final, 4)}</p>
                </div>
              )}
              {trade.breakeven_sl && (
                <div>
                  <p className="text-gray-500 mb-0.5">Breakeven SL</p>
                  <p className="text-teal-400">${fmt(trade.breakeven_sl, 4)}</p>
                </div>
              )}
              {trade.take_profit_price && (
                <div>
                  <p className="text-gray-500 mb-0.5">TP1</p>
                  <p className="text-emerald-400">${fmt(trade.take_profit_price, 4)}</p>
                </div>
              )}
              {trade.tp2_price && (
                <div>
                  <p className="text-gray-500 mb-0.5">TP2</p>
                  <p className="text-blue-400">${fmt(trade.tp2_price, 4)}</p>
                </div>
              )}
              {trade.tp1_exit_price && (
                <div>
                  <p className="text-gray-500 mb-0.5">TP1 Hit</p>
                  <p className="text-emerald-300">${fmt(trade.tp1_exit_price, 4)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Entry conditions */}
          {(trade.entry_divergence_strength || trade.entry_nearest_fib || trade.entry_1h_atr) && (
            <div className="bg-gray-800/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Entry Analysis</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                {trade.entry_nearest_fib && (
                  <div>
                    <p className="text-gray-500">Fib Level</p>
                    <p className="text-indigo-300 font-mono mt-0.5">{trade.entry_nearest_fib}</p>
                  </div>
                )}
                {trade.entry_divergence_strength != null && (
                  <div>
                    <p className="text-gray-500">Divergence</p>
                    <p className="text-purple-300 font-mono mt-0.5">{fmt(trade.entry_divergence_strength, 3)}</p>
                  </div>
                )}
                {trade.entry_1h_atr && (
                  <div>
                    <p className="text-gray-500">1H ATR</p>
                    <p className="text-gray-200 font-mono mt-0.5">${fmt(trade.entry_1h_atr, 4)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trade meta */}
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-500">Size</p>
              <p className="text-gray-200 font-mono mt-0.5">${fmt(trade.trade_usdt, 4)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-500">Qty</p>
              <p className="text-gray-200 font-mono mt-0.5">{fmt(trade.qty, 6)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-500">TSL Moves</p>
              <p className="text-gray-200 font-mono mt-0.5">{trade.tsl_update_count ?? 0}</p>
            </div>
            <div className="bg-gray-800 rounded-lg px-3 py-2">
              <p className="text-gray-500">Exit Reason</p>
              <p className={`font-medium mt-0.5 ${
                trade.exit_reason === 'TAKE_PROFIT' ? 'text-emerald-400'
                : trade.exit_reason === 'HARD_SL' ? 'text-red-400'
                : trade.exit_reason === 'TRAILING_SL' ? 'text-teal-400'
                : 'text-amber-400'
              }`}>{trade.exit_reason ?? 'OPEN'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Stats Header ──────────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'text-white', sub }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold font-mono mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const STATUS_OPTS  = [{ v: '', l: 'All' }, { v: 'OPEN', l: 'Open' }, { v: 'CLOSED', l: 'Closed' }]
const REASON_OPTS  = [
  { v: '', l: 'All Exits' },
  { v: 'TAKE_PROFIT', l: 'Take Profit' },
  { v: 'TRAILING_SL', l: 'Trailing SL' },
  { v: 'HARD_SL', l: 'Hard SL' },
  { v: 'TIMEOUT', l: 'Timeout' },
]

export default function Trades() {
  const [trades, setTrades] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ status: '', exit_reason: '', date_from: '', date_to: '' })
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const limit = 20

  const load = useCallback(() => {
    const params = {
      limit,
      offset: page * limit,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    }
    Promise.all([
      api.get('/trades', { params }),
      api.get('/stats'),
    ]).then(([tradesRes, statsRes]) => {
      const data = tradesRes.data
      if (data?.trades) {
        setTrades(data.trades)
        setTotal(data.total)
      } else {
        setTrades(Array.isArray(data) ? data : [])
      }
      setStats(statsRes.data)
    }).catch(() => {})
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const setFilter = (key, val) => {
    setPage(0)
    setFilters(f => ({ ...f, [key]: val }))
  }

  const exportCsv = () => window.open('/api/trades/export', '_blank')

  const winRate = stats ? ((stats.win_rate || 0) * 100).toFixed(1) : '—'
  const totalPnl = stats?.total_pnl_usdt ?? 0
  const pnlPos = totalPnl >= 0
  const from = page * limit + 1
  const to = Math.min(page * limit + trades.length, total)

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Trade History</h2>
        <button onClick={exportCsv}
          className="flex items-center gap-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Trades" value={stats.total_trades ?? 0} />
          <StatCard label="Win Rate" value={`${winRate}%`} color="text-blue-400"
            sub={`${stats.winning_trades ?? 0}W / ${stats.losing_trades ?? 0}L`} />
          <StatCard label="Total P&L" value={`${pnlPos ? '+' : ''}$${fmt(totalPnl, 4)}`}
            color={pnlPos ? 'text-emerald-400' : 'text-red-400'} />
          <StatCard label="Avg R:R" value={stats.avg_rr_ratio ? `${fmt(stats.avg_rr_ratio, 2)}:1` : '—'}
            color="text-indigo-400" />
          <StatCard label="Best Trade" value={stats.best_trade_pnl != null ? `+$${fmt(stats.best_trade_pnl, 4)}` : '—'}
            color="text-emerald-400" />
          <StatCard label="Worst Trade" value={stats.worst_trade_pnl != null ? `-$${fmt(Math.abs(stats.worst_trade_pnl), 4)}` : '—'}
            color="text-red-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status pills */}
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
          {STATUS_OPTS.map(o => (
            <button key={o.v} onClick={() => setFilter('status', o.v)}
              className={`text-xs px-3 py-1 rounded-md transition-colors ${
                filters.status === o.v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
              }`}>{o.l}</button>
          ))}
        </div>

        {/* Exit reason */}
        <select value={filters.exit_reason} onChange={e => setFilter('exit_reason', e.target.value)}
          className="text-xs bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-1.5 hover:border-gray-600 focus:outline-none focus:border-indigo-600 transition-colors">
          {REASON_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>

        {/* Date range */}
        <input type="date" value={filters.date_from}
          onChange={e => setFilter('date_from', e.target.value)}
          className="text-xs bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-600 transition-colors" />
        <span className="text-gray-600 text-xs">to</span>
        <input type="date" value={filters.date_to}
          onChange={e => setFilter('date_to', e.target.value)}
          className="text-xs bg-gray-900 border border-gray-800 text-gray-400 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-600 transition-colors" />

        {(filters.status || filters.exit_reason || filters.date_from || filters.date_to) && (
          <button onClick={() => { setPage(0); setFilters({ status: '', exit_reason: '', date_from: '', date_to: '' }) }}
            className="text-xs text-gray-500 hover:text-gray-200 px-2 py-1 rounded transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {trades.length === 0 ? (
          <div className="py-16 text-center text-gray-600 text-sm">No trades found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  {['#', 'Date', 'Pair', 'Grade', 'Entry', 'Exit', 'P&L', 'Hold', 'Reason'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map(t => {
                  const pnl = t.total_pnl_usdt ?? t.pnl_usdt ?? 0
                  const pnlPct = t.total_pnl_pct ?? t.pnl_pct ?? 0
                  const isWin = pnl > 0

                  return (
                    <tr key={t.id}
                      onClick={() => setSelected(t)}
                      className="border-b border-gray-800/60 hover:bg-gray-800/40 cursor-pointer transition-colors group">
                      <td className="px-4 py-3 text-gray-600 font-mono">{t.id}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(t.entry_time)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-200">{t.symbol}</td>
                      <td className="px-4 py-3">
                        {t.grade ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${GRADE_STYLE[t.grade] || GRADE_STYLE['B']}`}>
                            {t.grade}
                          </span>
                        ) : <span className="text-gray-700">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-200">${fmt(t.entry_price, 4)}</td>
                      <td className="px-4 py-3 font-mono text-gray-300">{t.exit_price ? `$${fmt(t.exit_price, 4)}` : <span className="text-gray-600">Open</span>}</td>
                      <td className={`px-4 py-3 font-mono font-semibold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        <div>{isWin ? '+' : ''}${fmt(pnl, 4)}</div>
                        <div className="text-gray-500 font-normal">{isWin ? '+' : ''}{fmt(pnlPct, 2)}%</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono">{holdDuration(t.entry_time, t.exit_time)}</td>
                      <td className="px-4 py-3">
                        {t.exit_reason ? (
                          <span className={`px-2 py-0.5 rounded text-xs ${EXIT_STYLE[t.exit_reason] || 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                            {t.exit_reason.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            OPEN
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">
            {total > 0 ? `${from}–${to} of ${total} trade${total !== 1 ? 's' : ''}` : ''}
          </span>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              ← Prev
            </button>
            <span className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-gray-400">
              {page + 1} / {Math.max(1, Math.ceil(total / limit))}
            </span>
            <button disabled={to >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              Next →
            </button>
          </div>
        </div>
      )}

      {selected && <TradeModal trade={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
