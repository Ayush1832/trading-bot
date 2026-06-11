import { useEffect, useRef, useState } from 'react'

/* ── Formatting helpers ──────────────────────────────────────────────── */

export function fmtUsd(v, d = 2) {
  if (v == null || isNaN(v)) return '—'
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

export function fmtPx(v) {
  // Price-aware decimals: BTC needs 2, SOL 3, sub-$10 needs 4
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  const d = n >= 1000 ? 2 : n >= 10 ? 3 : 4
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`
}

export function fmtPct(v, d = 2, signed = true) {
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  return `${signed && n >= 0 ? '+' : ''}${n.toFixed(d)}%`
}

export function fmtSigned(v, d = 4) {
  if (v == null || isNaN(v)) return '—'
  const n = Number(v)
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(d)}`
}

export function pnlColor(v, neutral = 'text-tx-2') {
  if (v == null || isNaN(v) || Number(v) === 0) return neutral
  return Number(v) > 0 ? 'text-up' : 'text-down'
}

export function fmtDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '—'
  const s = Math.max(0, Math.floor(seconds))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

export function fmtClock(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour12: false })
}

export function fmtDay(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/* ── Panel ───────────────────────────────────────────────────────────── */

export function Panel({ title, right, children, className = '', bodyClass = '', flush = false }) {
  return (
    <section className={`panel overflow-hidden flex flex-col ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between px-4 h-9 border-b border-line-soft shrink-0">
          <h3 className="microlabel">{title}</h3>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={`${flush ? '' : 'p-4'} flex-1 min-h-0 ${bodyClass}`}>{children}</div>
    </section>
  )
}

/* ── Status dot + chip ───────────────────────────────────────────────── */

const DOT_COLOR = {
  up: 'bg-up shadow-glow-up',
  down: 'bg-down shadow-glow-down',
  warn: 'bg-warn',
  accent: 'bg-accent',
  idle: 'bg-tx-faint',
}

export function Dot({ tone = 'idle', pulse = false }) {
  return <span className={`dot ${DOT_COLOR[tone] || DOT_COLOR.idle} ${pulse ? 'animate-pulse-soft' : ''}`} />
}

const CHIP_TONE = {
  up: 'bg-up/10 text-up border-up/25',
  down: 'bg-down/10 text-down border-down/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  accent: 'bg-accent/10 text-accent border-accent/25',
  idle: 'bg-ink-800 text-tx-2 border-line-strong',
}

export function Chip({ tone = 'idle', children, pulse = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-2xs font-semibold tracking-wide ${CHIP_TONE[tone] || CHIP_TONE.idle} ${className}`}>
      {pulse && <Dot tone={tone} pulse />}
      {children}
    </span>
  )
}

/* ── Grade badge ─────────────────────────────────────────────────────── */

export function GradeBadge({ grade, size = 'sm' }) {
  if (!grade) return null
  const tone = grade === 'A+' ? 'up' : grade === 'A' ? 'accent' : 'idle'
  return <Chip tone={tone} className={size === 'lg' ? 'text-xs px-2.5 py-1' : ''}>{grade}</Chip>
}

/* ── Animated number — flashes green/red when value moves ───────────── */

export function Num({ value, format = (v) => v, className = '' }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    if (prev.current != null && value != null && value !== prev.current) {
      setFlash(value > prev.current ? 'flash-up' : 'flash-down')
      const t = setTimeout(() => setFlash(''), 700)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value])

  return <span className={`font-mono ${flash} ${className}`}>{format(value)}</span>
}

/* ── Stat block (label over value) ───────────────────────────────────── */

export function Stat({ label, value, sub, tone, mono = true, className = '' }) {
  const valueColor = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-tx'
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="microlabel mb-1">{label}</p>
      <p className={`text-base font-semibold leading-tight truncate ${mono ? 'font-mono' : ''} ${valueColor}`}>{value}</p>
      {sub && <p className="text-2xs text-tx-dim mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

/* ── Meter — horizontal capacity bar ─────────────────────────────────── */

export function Meter({ value, max = 100, tone = 'accent', className = '' }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const fill = tone === 'up' ? 'bg-up' : tone === 'down' ? 'bg-down' : tone === 'warn' ? 'bg-warn' : 'bg-accent'
  return (
    <div className={`h-1 rounded-full bg-ink-800 overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${fill} transition-all duration-500 ease-out`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ── Arc gauge (SVG) — used in Risk center ───────────────────────────── */

export function ArcGauge({ value, max = 100, label, display, tone = 'accent', size = 132 }) {
  const pct = Math.min(1, Math.max(0, value / max))
  const r = 52
  const cx = 60, cy = 60
  const startAngle = -210, endAngle = 30 // 240° sweep
  const sweep = endAngle - startAngle

  const polar = (angle) => {
    const rad = (angle * Math.PI) / 180
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
  }
  const arc = (from, to) => {
    const [x1, y1] = polar(from)
    const [x2, y2] = polar(to)
    const large = to - from > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const color = tone === 'up' ? '#19c685' : tone === 'down' ? '#f0445c' : tone === 'warn' ? '#e7a13d' : '#7aa2ff'

  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 120 110" style={{ width: size, height: size * 0.92 }}>
        <path d={arc(startAngle, endAngle)} fill="none" stroke="#151924" strokeWidth="9" strokeLinecap="round" />
        {pct > 0.005 && (
          <path
            d={arc(startAngle, startAngle + sweep * pct)}
            fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
            style={{ transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)', filter: `drop-shadow(0 0 5px ${color}55)` }}
          />
        )}
        <text x="60" y="58" textAnchor="middle" fill="#e8ebf2" fontSize="17" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {display}
        </text>
        <text x="60" y="74" textAnchor="middle" fill="#5e6778" fontSize="7.5" fontWeight="600" letterSpacing="0.12em">
          {label?.toUpperCase()}
        </text>
      </svg>
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────── */

export function Empty({ children, className = '' }) {
  return (
    <div className={`flex items-center justify-center text-sm text-tx-dim py-8 ${className}`}>
      {children}
    </div>
  )
}

/* ── Skeleton shimmer ────────────────────────────────────────────────── */

export function Skeleton({ className = '' }) {
  return <div className={`bg-ink-800 rounded animate-pulse-soft ${className}`} />
}
