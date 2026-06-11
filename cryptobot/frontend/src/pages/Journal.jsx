import { useState, useEffect, useCallback } from 'react'
import api from '../hooks/useApi.js'
import { Panel, Chip, GradeBadge, Stat, Empty, fmtPx, fmtPct, fmtSigned, fmtUsd, fmtDateTime, pnlColor } from '../ui/kit.jsx'

const PAGE = 25

const EXIT_META = {
  TAKE_PROFIT: { label: 'Take profit', tone: 'up' },
  TRAILING_SL: { label: 'Trailing stop', tone: 'accent' },
  HARD_SL: { label: 'Hard stop', tone: 'down' },
  TIMEOUT: { label: 'Timeout', tone: 'warn' },
}

function tradePnl(t) {
  return t.total_pnl_usdt ?? t.pnl_usdt ?? 0
}

function tradePnlPct(t) {
  return t.total_pnl_pct ?? t.pnl_pct ?? 0
}

function holdHours(t) {
  if (!t.entry_time || !t.exit_time) return null
  return (new Date(t.exit_time) - new Date(t.entry_time)) / 3600000
}

function fmtHold(t) {
  const h = holdHours(t)
  if (h == null) return '—'
  if (h >= 24) return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`
  if (h >= 1) return `${h.toFixed(1)}h`
  return `${Math.round(h * 60)}m`
}

/* ── Timeline inside drawer ──────────────────────────────────────────── */

function TimelineStep({ time, title, detail, tone = 'idle', last = false }) {
  const dotColor = tone === 'up' ? 'bg-up' : tone === 'down' ? 'bg-down' : tone === 'warn' ? 'bg-warn' : 'bg-accent'
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColor}`} />
        {!last && <span className="w-px flex-1 bg-line my-1" />}
      </div>
      <div className={last ? '' : 'pb-4'}>
        <p className="text-3xs font-mono text-tx-faint">{time}</p>
        <p className="text-xs font-semibold text-tx mt-0.5">{title}</p>
        {detail && <p className="text-2xs text-tx-dim mt-0.5">{detail}</p>}
      </div>
    </div>
  )
}

function KV({ k, v, color = 'text-tx-2' }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-line-soft last:border-0">
      <span className="text-2xs text-tx-dim">{k}</span>
      <span className={`text-2xs font-mono font-medium ${color}`}>{v}</span>
    </div>
  )
}

/* ── Drawer ──────────────────────────────────────────────────────────── */

function TradeDrawer({ trade: t, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!t) return null

  const pnl = tradePnl(t)
  const isWin = pnl > 0
  const exit = EXIT_META[t.exit_reason] || { label: t.exit_reason || 'Open', tone: 'idle' }
  const riskPerUnit = t.entry_price && t.hard_sl_price ? t.entry_price - t.hard_sl_price : null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-ink-900 border-l border-line shadow-2xl flex flex-col animate-enter">
        {/* Header */}
        <header className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold font-mono text-tx">{t.symbol}</span>
            <GradeBadge grade={t.grade} />
            <Chip tone={t.status === 'OPEN' ? 'accent' : isWin ? 'up' : 'down'}>
              {t.status === 'OPEN' ? 'OPEN' : isWin ? 'WIN' : 'LOSS'}
            </Chip>
          </div>
          <button onClick={onClose} className="btn-ghost px-2" aria-label="Close">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* P&L hero */}
          <div className={`rounded-panel border px-4 py-3.5 ${isWin ? 'border-up/25 bg-up/5' : 'border-down/25 bg-down/5'}`}>
            <div className="flex items-baseline justify-between">
              <span className={`text-2xl font-bold font-mono ${pnlColor(pnl, 'text-tx')}`}>{fmtSigned(pnl)}</span>
              <span className={`text-sm font-mono font-semibold ${pnlColor(pnl, 'text-tx')}`}>{fmtPct(tradePnlPct(t), 2)}</span>
            </div>
            {t.half_exited && t.tp1_pnl_usdt != null && (
              <div className="flex gap-4 mt-2 pt-2 border-t border-line-soft text-2xs font-mono">
                <span className="text-up">TP1 leg {fmtSigned(t.tp1_pnl_usdt)}</span>
                <span className={pnlColor(t.pnl_usdt)}>runner {fmtSigned(t.pnl_usdt)}</span>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div>
            <p className="microlabel mb-3">Trade timeline</p>
            <TimelineStep
              time={fmtDateTime(t.entry_time)}
              title={`Entered long at ${fmtPx(t.entry_price)}`}
              detail={`${t.qty?.toFixed(6)} units · ${fmtUsd(t.trade_usdt)} notional · R:R ${t.rr_ratio?.toFixed(1) ?? '—'}:1`}
              tone="accent"
            />
            {t.half_exited && t.tp1_exit_time && (
              <TimelineStep
                time={fmtDateTime(t.tp1_exit_time)}
                title={`TP1 filled at ${fmtPx(t.tp1_exit_price)}`}
                detail="50% closed · stop moved to breakeven"
                tone="up"
              />
            )}
            {t.exit_time ? (
              <TimelineStep
                time={fmtDateTime(t.exit_time)}
                title={`${exit.label} exit at ${fmtPx(t.exit_price)}`}
                detail={`held ${fmtHold(t)} · ${t.tsl_update_count ?? 0} trailing-stop updates`}
                tone={exit.tone}
                last
              />
            ) : (
              <TimelineStep time="now" title="Position still open" tone="accent" last />
            )}
          </div>

          {/* Risk profile */}
          <div>
            <p className="microlabel mb-2">Risk profile</p>
            <div className="panel-raised px-3.5 py-1.5">
              <KV k="Entry" v={fmtPx(t.entry_price)} color="text-tx" />
              <KV k="Hard stop" v={fmtPx(t.hard_sl_price)} color="text-down" />
              {riskPerUnit != null && t.entry_price > 0 && (
                <KV k="Initial risk" v={`${((riskPerUnit / t.entry_price) * 100).toFixed(2)}%`} color="text-down" />
              )}
              <KV k="TP1 target" v={fmtPx(t.take_profit_price)} color="text-up" />
              <KV k="TP2 target" v={fmtPx(t.tp2_price)} color="text-accent" />
              {t.breakeven_sl && <KV k="Breakeven stop" v={fmtPx(t.breakeven_sl)} color="text-warn" />}
              {t.trailing_sl_final && <KV k="Final trailing stop" v={fmtPx(t.trailing_sl_final)} color="text-warn" />}
              <KV k="Peak price" v={fmtPx(t.peak_price)} color="text-up" />
            </div>
          </div>

          {/* Entry reasoning */}
          {(t.entry_nearest_fib || t.entry_divergence_strength != null || t.entry_1h_atr != null) && (
            <div>
              <p className="microlabel mb-2">Entry reasoning</p>
              <div className="panel-raised px-3.5 py-1.5">
                {t.entry_nearest_fib && <KV k="Fibonacci level" v={t.entry_nearest_fib} color="text-accent" />}
                {t.entry_divergence_strength != null && (
                  <KV k="RSI divergence strength" v={`+${Number(t.entry_divergence_strength).toFixed(2)}`} color="text-purple-300" />
                )}
                {t.entry_1h_atr != null && <KV k="1H ATR at entry" v={fmtPx(t.entry_1h_atr)} />}
                {t.grade && <KV k="Setup grade" v={t.grade} color={t.grade === 'A+' ? 'text-up' : t.grade === 'A' ? 'text-accent' : 'text-tx-2'} />}
              </div>
            </div>
          )}

          {/* Execution */}
          <div>
            <p className="microlabel mb-2">Execution</p>
            <div className="panel-raised px-3.5 py-1.5">
              <KV k="Notional" v={fmtUsd(t.trade_usdt, 2)} />
              <KV k="Quantity" v={t.qty?.toFixed(6) ?? '—'} />
              <KV k="Fees (entry + exit)" v={fmtUsd((t.entry_fee || 0) + (t.exit_fee || 0), 4)} />
              <KV k="Trailing-stop updates" v={String(t.tsl_update_count ?? 0)} />
              <KV k="Trade ID" v={`#${t.id}`} />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */

const STATUS_OPTS = [
  { v: '', l: 'All' },
  { v: 'OPEN', l: 'Open' },
  { v: 'CLOSED', l: 'Closed' },
]

const REASON_OPTS = [
  { v: '', l: 'All exits' },
  { v: 'TAKE_PROFIT', l: 'Take profit' },
  { v: 'TRAILING_SL', l: 'Trailing stop' },
  { v: 'HARD_SL', l: 'Hard stop' },
  { v: 'TIMEOUT', l: 'Timeout' },
]

export default function Journal() {
  const [trades, setTrades] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ status: '', exit_reason: '' })
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(() => {
    const params = {
      limit: PAGE,
      offset: page * PAGE,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    }
    Promise.all([api.get('/trades', { params }), api.get('/stats')])
      .then(([tr, st]) => {
        const d = tr.data
        setTrades(d?.trades ?? (Array.isArray(d) ? d : []))
        setTotal(d?.total ?? 0)
        setStats(st.data)
      })
      .catch(() => {})
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const setFilter = (k, v) => { setPage(0); setFilters((f) => ({ ...f, [k]: v })) }
  const from = page * PAGE + 1
  const to = Math.min(page * PAGE + trades.length, total)
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4 animate-enter">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-bold text-tx">Trade Journal</h1>
          <p className="text-2xs text-tx-dim mt-0.5">Every execution, fully inspectable</p>
        </div>
        <button onClick={() => window.open('/api/trades/export', '_blank')} className="btn-outline">
          Export CSV
        </button>
      </div>

      {/* Performance summary */}
      {stats && (
        <div className="panel grid grid-cols-2 md:grid-cols-5 divide-x divide-line-soft">
          <Stat className="px-4 py-3" label="Closed trades" value={String(stats.total_trades ?? 0)} />
          <Stat
            className="px-4 py-3" label="Win rate"
            value={stats.total_trades > 0 ? `${((stats.win_rate || 0) * 100).toFixed(0)}%` : '—'}
            tone={stats.win_rate >= 0.5 ? 'up' : stats.total_trades > 0 ? 'down' : undefined}
            sub={`${stats.winning_trades ?? 0}W · ${stats.losing_trades ?? 0}L`}
          />
          <Stat
            className="px-4 py-3" label="Net P&L"
            value={fmtSigned(stats.total_pnl_usdt ?? 0)}
            tone={(stats.total_pnl_usdt ?? 0) > 0 ? 'up' : (stats.total_pnl_usdt ?? 0) < 0 ? 'down' : undefined}
          />
          <Stat
            className="px-4 py-3" label="Avg R:R"
            value={stats.avg_rr_ratio ? `${stats.avg_rr_ratio.toFixed(1)}:1` : '—'}
            tone="accent"
          />
          <Stat
            className="px-4 py-3" label="Avg per trade"
            value={stats.total_trades > 0 ? fmtSigned((stats.total_pnl_usdt || 0) / stats.total_trades) : '—'}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-0.5 panel p-0.5">
          {STATUS_OPTS.map((o) => (
            <button
              key={o.v}
              onClick={() => setFilter('status', o.v)}
              className={`px-3 py-1 rounded text-2xs font-semibold transition-colors ${
                filters.status === o.v ? 'bg-accent/15 text-accent' : 'text-tx-dim hover:text-tx-2'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 panel p-0.5">
          {REASON_OPTS.map((o) => (
            <button
              key={o.v}
              onClick={() => setFilter('exit_reason', o.v)}
              className={`px-3 py-1 rounded text-2xs font-semibold transition-colors ${
                filters.exit_reason === o.v ? 'bg-accent/15 text-accent' : 'text-tx-dim hover:text-tx-2'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Panel flush>
        {trades.length === 0 ? (
          <Empty className="py-16">No trades match these filters</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line">
                  {['Date', 'Market', 'Grade', 'Entry', 'Exit', 'Net P&L', 'Hold', 'Outcome'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left microlabel whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => {
                  const pnl = tradePnl(t)
                  const isWin = pnl > 0
                  const exit = EXIT_META[t.exit_reason]
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t)}
                      className="border-b border-line-soft last:border-0 hover:bg-ink-800/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 text-tx-dim font-mono whitespace-nowrap">{fmtDateTime(t.entry_time)}</td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-tx">{t.symbol?.replace('/USDT', '')}</td>
                      <td className="px-4 py-2.5"><GradeBadge grade={t.grade} /></td>
                      <td className="px-4 py-2.5 font-mono text-tx-2">{fmtPx(t.entry_price)}</td>
                      <td className="px-4 py-2.5 font-mono text-tx-2">{t.exit_price ? fmtPx(t.exit_price) : <span className="text-tx-faint">—</span>}</td>
                      <td className={`px-4 py-2.5 font-mono font-semibold ${pnlColor(pnl)}`}>
                        {fmtSigned(pnl)}
                        <span className="text-tx-faint font-normal ml-1.5">{fmtPct(tradePnlPct(t), 1)}</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-tx-dim">{fmtHold(t)}</td>
                      <td className="px-4 py-2.5">
                        {t.status === 'OPEN' ? (
                          <Chip tone="accent" pulse>OPEN</Chip>
                        ) : exit ? (
                          <Chip tone={exit.tone}>{exit.label.toUpperCase()}</Chip>
                        ) : (
                          <Chip>—</Chip>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Pagination */}
      {total > PAGE && (
        <div className="flex items-center justify-between text-2xs">
          <span className="text-tx-dim font-mono">{from}–{to} of {total}</span>
          <div className="flex items-center gap-1.5">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="btn-outline">← Prev</button>
            <span className="px-3 py-1.5 font-mono text-tx-dim">{page + 1} / {pages}</span>
            <button disabled={to >= total} onClick={() => setPage((p) => p + 1)} className="btn-outline">Next →</button>
          </div>
        </div>
      )}

      {selected && <TradeDrawer trade={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
