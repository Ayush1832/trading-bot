import { useState, useEffect } from 'react'
import useStore from '../store/useStore.js'

function elapsed(entryTime) {
  if (!entryTime) return '—'
  const secs = Math.floor(Date.now() / 1000 - entryTime)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s}s`
}

function fmt(n, digits = 2) {
  if (n == null || isNaN(n)) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

function pct(n, digits = 2) {
  if (n == null || isNaN(n)) return '—'
  const v = Number(n)
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

const GRADE_STYLE = {
  'A+': 'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  'A':  'bg-blue-900/60 text-blue-300 border-blue-700',
  'B':  'bg-gray-800 text-gray-400 border-gray-600',
}

function GradeBadge({ grade }) {
  if (!grade) return null
  const cls = GRADE_STYLE[grade] || GRADE_STYLE['B']
  return (
    <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${cls}`}>
      {grade}
    </span>
  )
}

function Row({ label, value, color = 'text-gray-200' }) {
  return (
    <>
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`font-mono text-right text-xs ${color}`}>{value ?? '—'}</span>
    </>
  )
}

// Horizontal progress bar: entry → TP1 → TP2
function ExitProgress({ entry, tp1, tp2, current, halfExited }) {
  if (!entry || !tp1 || !tp2 || !current) return null
  const range = tp2 - entry
  if (range <= 0) return null

  const tp1Pct = Math.min(100, Math.max(0, ((tp1 - entry) / range) * 100))
  const curPct = Math.min(100, Math.max(0, ((current - entry) / range) * 100))

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{fmt(entry)}</span>
        <span className="text-yellow-400">TP1 {fmt(tp1)}</span>
        <span className="text-blue-400">TP2 {fmt(tp2)}</span>
      </div>
      <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden relative">
        {/* TP1 hit segment (always green if half exited) */}
        {halfExited && (
          <div
            className="absolute left-0 top-0 h-full bg-emerald-500 rounded-l-full"
            style={{ width: `${tp1Pct}%` }}
          />
        )}
        {/* Current progress */}
        {!halfExited && (
          <div
            className="absolute left-0 top-0 h-full bg-green-500/70 rounded-l-full transition-all duration-500"
            style={{ width: `${curPct}%` }}
          />
        )}
        {halfExited && curPct > tp1Pct && (
          <div
            className="absolute top-0 h-full bg-blue-500/60"
            style={{ left: `${tp1Pct}%`, width: `${curPct - tp1Pct}%` }}
          />
        )}
        {/* TP1 marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-yellow-400/80"
          style={{ left: `${tp1Pct}%` }}
        />
      </div>
      {halfExited && (
        <div className="flex justify-between text-xs mt-1">
          <span className="text-emerald-400">✓ TP1 locked</span>
          <span className="text-blue-400">trailing → TP2</span>
        </div>
      )}
    </div>
  )
}

// Waiting state — show scanner conditions for best candidate
function WaitingCard({ botState }) {
  const scanner = useStore((s) => s.scanner)

  // Find the symbol with most conditions met
  const COND_KEYS = ['weekly_ok', 'daily_ok', 'h4_div_ok', 'h4_mom_ok', 'h1_bos_ok']
  const condCount = (s) => COND_KEYS.filter(k => s[k]).length

  const entries = Object.values(scanner || {})
  const best = entries.sort((a, b) => {
    if (b.signal !== a.signal) return b.signal ? 1 : -1
    return condCount(b) - condCount(a)
  })[0]

  const CONDITIONS = [
    { key: 'weekly_ok', label: 'Weekly EMA200', tf: '1W' },
    { key: 'daily_ok',  label: 'Daily Fib',     tf: '1D' },
    { key: 'h4_div_ok', label: '4H Divergence', tf: '4H' },
    { key: 'h4_mom_ok', label: '4H Momentum',   tf: '4H' },
    { key: 'h1_bos_ok', label: '1H BOS',        tf: '1H' },
  ]

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-400 text-sm font-medium">Waiting for setup...</p>
        <span className="text-xs text-gray-600">15 min scan</span>
      </div>

      {botState.trade_opened_today ? (
        <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2">
          Trade taken today — next entry: tomorrow 00:00 UTC
        </div>
      ) : (
        <div className="text-xs text-gray-600 mb-3">
          Scanning BTC / ETH / SOL every 15 min
        </div>
      )}

      {best && (
        <div className="mt-2 border border-gray-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-300">{best.symbol}</span>
            <div className="flex items-center gap-2">
              {best.grade && <GradeBadge grade={best.grade} />}
              <span className="text-xs text-gray-500">
                {condCount(best)}/5
              </span>
            </div>
          </div>
          <div className="space-y-1">
            {CONDITIONS.map((c) => {
              const ok = best[c.key] ?? false
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <span className={`text-xs px-1 rounded font-mono ${
                    c.tf === '1W' ? 'bg-purple-900/40 text-purple-400' :
                    c.tf === '1D' ? 'bg-blue-900/40 text-blue-400' :
                    c.tf === '4H' ? 'bg-yellow-900/40 text-yellow-400' :
                    'bg-green-900/40 text-green-400'
                  }`}>{c.tf}</span>
                  <span className={`text-xs ${ok ? 'text-gray-300' : 'text-gray-600'}`}>{c.label}</span>
                  <span className={`ml-auto text-xs ${ok ? 'text-green-400' : 'text-gray-700'}`}>
                    {ok ? '✓' : '·'}
                  </span>
                </div>
              )
            })}
          </div>
          {best.rr_ratio > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500">
              R:R {best.rr_ratio?.toFixed(1)} · Fib {best.nearest_fib || '—'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function LiveTradeCard() {
  const botState = useStore((s) => s.botState)
  const tslPulse = useStore((s) => s.tslPulse)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const t = setInterval(() => forceUpdate((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  if (!botState.trade_open) {
    return <WaitingCard botState={botState} />
  }

  const pnlPct = botState.unrealized_pnl_pct ?? 0
  const pnlPos = pnlPct >= 0
  const half = botState.half_exited

  // Combined P&L label: if TP1 hit, show "locked + floating"
  const combinedLabel = half
    ? `${pct(botState.tp1_pnl_usdt != null
        ? (botState.tp1_pnl_usdt / ((botState.entry_price ?? 1) * ((botState.qty_total ?? 0) * 0.5))) * 100
        : null)} locked + ${pct(pnlPct)} floating`
    : null

  return (
    <div className={`bg-gray-900 rounded-xl p-5 border transition-colors ${
      tslPulse ? 'border-teal-500 animate-pulse' : 'border-gray-800'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-green-400 uppercase">Trade Open</span>
          {botState.current_symbol && (
            <span className="text-xs text-gray-400">{botState.current_symbol}</span>
          )}
          <GradeBadge grade={botState.grade} />
        </div>
        <span className="text-xs text-gray-500">{elapsed(botState.entry_time)}</span>
      </div>

      {botState.rr_ratio > 0 && (
        <div className="text-xs text-gray-500 mb-3">
          R:R {botState.rr_ratio?.toFixed(1)} · ATR {botState.atr_1h?.toFixed(2)}
        </div>
      )}

      {/* P&L */}
      <div className={`text-4xl font-bold mb-1 ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
        {pnlPos ? '+' : ''}{pnlPct.toFixed(3)}%
      </div>
      {combinedLabel && (
        <div className="text-xs text-gray-500 mb-3">{combinedLabel}</div>
      )}

      {/* TP1 hit banner */}
      {half && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-emerald-400 font-semibold">✓ TP1 HIT</span>
            <span className="text-emerald-300">{fmt(botState.tp1_exit_price)}</span>
          </div>
          <div className="text-gray-400 mt-0.5">
            50% locked — remaining is risk-free (SL at breakeven)
          </div>
        </div>
      )}

      {/* Progress bar */}
      <ExitProgress
        entry={botState.entry_price}
        tp1={botState.tp1_price}
        tp2={botState.tp2_price}
        current={botState.current_price}
        halfExited={half}
      />

      {/* Price levels grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
        <Row label="Entry"   value={fmt(botState.entry_price)} />
        <Row label="Current" value={fmt(botState.current_price)} />
        <Row label="Peak"    value={fmt(botState.peak_price)} color="text-emerald-400" />
        <Row label="TSL"     value={fmt(botState.trailing_sl)} color="text-red-400" />
        <Row
          label={half ? 'SL (breakeven)' : 'Hard SL'}
          value={fmt(botState.sl_price)}
          color="text-orange-400"
        />
        <Row
          label={half ? 'TP2 (guide)' : 'TP1 target'}
          value={fmt(half ? botState.tp2_price : botState.tp1_price)}
          color="text-blue-400"
        />
      </div>

      {/* Qty info */}
      <div className="mt-3 pt-3 border-t border-gray-800 flex justify-between text-xs text-gray-500">
        <span>
          Qty: {botState.qty_remaining?.toFixed(6) ?? '—'}
          {half ? ' remaining' : ` / ${botState.qty_total?.toFixed(6) ?? '—'} total`}
        </span>
        {!half && (
          <span className="text-gray-600">TP1 → SL moves to breakeven</span>
        )}
      </div>
    </div>
  )
}
