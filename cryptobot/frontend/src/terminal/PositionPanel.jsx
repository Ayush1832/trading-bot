import { useEffect, useState } from 'react'
import useStore from '../store/useStore.js'
import { Panel, Chip, GradeBadge, Num, fmtPx, fmtPct, fmtSigned, fmtDuration, pnlColor } from '../ui/kit.jsx'

/* Price ladder row: where price sits relative to levels */
function Level({ label, price, tone, active }) {
  const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-tx-2'
  return (
    <div className={`flex items-center justify-between py-1 ${active ? '' : 'opacity-90'}`}>
      <span className="text-2xs text-tx-dim font-medium">{label}</span>
      <span className={`text-xs font-mono font-semibold ${color}`}>{fmtPx(price)}</span>
    </div>
  )
}

/* Journey bar: entry → current → TP2, with TP1 milestone */
function Journey({ entry, current, tp1, tp2, halfExited }) {
  if (!entry || !tp1 || !tp2 || !current || tp2 <= entry) return null
  const span = tp2 - entry
  const pos = Math.min(100, Math.max(0, ((current - entry) / span) * 100))
  const tp1Pos = Math.min(100, Math.max(0, ((tp1 - entry) / span) * 100))

  return (
    <div className="mt-3">
      <div className="relative h-1.5 rounded-full bg-ink-800">
        {/* Locked segment after TP1 */}
        {halfExited && (
          <div className="absolute inset-y-0 left-0 rounded-l-full bg-up/60" style={{ width: `${tp1Pos}%` }} />
        )}
        {/* Live progress */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${pos >= 0 ? 'bg-up' : 'bg-down'}`}
          style={{ width: `${pos}%`, opacity: halfExited ? 0.5 : 1 }}
        />
        {/* TP1 milestone tick */}
        <div className="absolute -inset-y-0.5 w-px bg-warn" style={{ left: `${tp1Pos}%` }} />
        {/* Current price knob */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-tx border-2 border-ink-900 transition-all duration-700 ease-out"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-3xs font-mono text-tx-faint">
        <span>ENTRY</span>
        <span className={halfExited ? 'text-up' : 'text-warn'}>{halfExited ? 'TP1 ✓' : 'TP1'}</span>
        <span className="text-accent">TP2</span>
      </div>
    </div>
  )
}

function OpenPosition({ s }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const pnl = s.unrealized_pnl_pct ?? 0
  const held = s.entry_time ? Date.now() / 1000 - s.entry_time : null

  return (
    <div className="flex flex-col h-full">
      {/* Identity row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono text-tx">{s.current_symbol?.replace('/USDT', '')}</span>
          <Chip tone="up" pulse>LONG</Chip>
          <GradeBadge grade={s.grade} />
        </div>
        <span className="text-2xs font-mono text-tx-dim">{fmtDuration(held)}</span>
      </div>

      {/* Unrealized P&L hero */}
      <div className="mt-3">
        <p className="microlabel">Unrealized</p>
        <Num
          value={pnl}
          format={(v) => fmtPct(v, 2)}
          className={`text-3xl font-bold leading-tight ${pnlColor(pnl, 'text-tx')}`}
        />
        {s.half_exited && s.tp1_pnl_usdt != null && (
          <p className="text-2xs font-mono text-up mt-0.5">{fmtSigned(s.tp1_pnl_usdt)} locked at TP1</p>
        )}
      </div>

      <Journey
        entry={s.entry_price} current={s.current_price}
        tp1={s.tp1_price} tp2={s.tp2_price} halfExited={s.half_exited}
      />

      {/* TP1 banner */}
      {s.half_exited && (
        <div className="mt-3 rounded-md border border-up/25 bg-up/5 px-3 py-2">
          <p className="text-2xs font-semibold text-up">TP1 FILLED — RISK-FREE RUNNER</p>
          <p className="text-3xs text-tx-dim mt-0.5">50% closed at {fmtPx(s.tp1_exit_price)} · stop moved to breakeven</p>
        </div>
      )}

      {/* Price ladder */}
      <div className="mt-3 pt-2 border-t border-line-soft">
        <Level label="TP2 — runner target" price={s.tp2_price} tone="accent" />
        {!s.half_exited && <Level label="TP1 — 50% exit" price={s.tp1_price} tone="up" />}
        <Level label="Current" price={s.current_price} tone={pnl >= 0 ? 'up' : 'down'} active />
        <Level label="Entry" price={s.entry_price} />
        {s.trailing_sl && s.trailing_sl !== s.sl_price && (
          <Level label="Trailing stop" price={s.trailing_sl} tone="warn" />
        )}
        <Level label={s.half_exited ? 'Stop — breakeven' : 'Hard stop'} price={s.sl_price} tone="down" />
      </div>

      {/* Footer meta */}
      <div className="mt-auto pt-2 border-t border-line-soft flex items-center justify-between text-3xs font-mono text-tx-dim">
        <span>{s.qty_remaining?.toFixed(6) ?? '—'} {s.half_exited ? 'remaining' : 'qty'}</span>
        <span>R:R {s.rr_ratio?.toFixed(1) ?? '—'}:1</span>
        <span>peak {fmtPx(s.peak_price)}</span>
      </div>
    </div>
  )
}

function Flat({ s }) {
  const reason = s.daily_halted
    ? { tone: 'down', head: 'HALTED', body: 'Daily drawdown limit reached — trading resumes 00:00 UTC' }
    : s.trade_opened_today
    ? { tone: 'warn', head: 'SLOT USED', body: 'Today’s trade is done — next entry window opens 00:00 UTC' }
    : s.running
    ? { tone: 'accent', head: 'HUNTING', body: 'No position — scanning watchlist every 15 minutes' }
    : { tone: 'idle', head: 'STANDBY', body: 'Engine stopped' }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-6">
      <Chip tone={reason.tone} pulse={reason.tone === 'accent'}>{reason.head}</Chip>
      <p className="text-xs text-tx-dim max-w-[220px]">{reason.body}</p>
      <div className="flex items-center gap-4 mt-2 text-3xs font-mono text-tx-faint">
        <span>EXPOSURE $0.00</span>
        <span>·</span>
        <span>{s.signals_today ?? 0} SIGNALS TODAY</span>
      </div>
    </div>
  )
}

export default function PositionPanel() {
  const botState = useStore((s) => s.botState)
  const tslPulse = useStore((s) => s.tslPulse)

  return (
    <Panel
      title="Position"
      right={tslPulse && <Chip tone="warn">TSL MOVED</Chip>}
      className={`h-full transition-shadow duration-300 ${tslPulse ? 'shadow-[0_0_0_1px_#e7a13d66]' : ''}`}
    >
      {botState.trade_open ? <OpenPosition s={botState} /> : <Flat s={botState} />}
    </Panel>
  )
}
