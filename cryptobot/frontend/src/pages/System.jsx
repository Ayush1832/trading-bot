import { useEffect, useRef, useState } from 'react'
import { AreaChart, Area, YAxis, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../hooks/useApi.js'
import useStore from '../store/useStore.js'
import { Panel, Chip, Dot, Skeleton } from '../ui/kit.jsx'

const POLL_MS = 10000
const MAX_SAMPLES = 60 // ~10 min of history

function ServiceTile({ name, ok, detail, metric, sub }) {
  return (
    <div className="panel-raised px-4 py-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-tx">{name}</span>
        <Dot tone={ok ? 'up' : 'down'} pulse={ok} />
      </div>
      <div className="flex items-baseline justify-between">
        <span className={`text-2xs font-mono font-bold tracking-wider ${ok ? 'text-up' : 'text-down'}`}>
          {ok ? 'OPERATIONAL' : 'DOWN'}
        </span>
        {metric && <span className="text-xs font-mono text-tx-2">{metric}</span>}
      </div>
      {(detail || sub) && (
        <p className="text-3xs text-tx-dim leading-relaxed">{detail}{detail && sub ? ' · ' : ''}{sub}</p>
      )}
    </div>
  )
}

function LatencyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-ink-850 border border-line rounded-md px-2.5 py-1.5 text-2xs font-mono shadow-xl">
      <span className="text-tx-dim">{d.t}</span>{' '}
      <span className="text-accent font-semibold">{d.ms}ms</span>
    </div>
  )
}

export default function System() {
  const [health, setHealth] = useState(null)
  const [history, setHistory] = useState([])
  const [lastPoll, setLastPoll] = useState(null)
  const wsConnected = useStore((s) => s.wsConnected)
  const timerRef = useRef(null)

  useEffect(() => {
    const poll = () => {
      api.get('/health').then((r) => {
        setHealth(r.data)
        setLastPoll(new Date())
        const ms = r.data?.exchange?.latency_ms
        if (ms != null) {
          setHistory((h) => [
            ...h.slice(-(MAX_SAMPLES - 1)),
            { t: new Date().toLocaleTimeString('en-US', { hour12: false }), ms },
          ])
        }
      }).catch(() => {
        setHealth((h) => h ? { ...h, _unreachable: true } : { _unreachable: true })
        setLastPoll(new Date())
      })
    }
    poll()
    timerRef.current = setInterval(poll, POLL_MS)
    return () => clearInterval(timerRef.current)
  }, [])

  const unreachable = health?._unreachable
  const ex = health?.exchange
  const db = health?.database
  const ws = health?.websocket
  const tg = health?.telegram
  const bot = health?.bot

  const services = [
    { name: 'API server', ok: !unreachable && !!health, detail: 'FastAPI backend', metric: lastPoll && `polled ${lastPoll.toLocaleTimeString('en-US', { hour12: false })}` },
    { name: 'Exchange — Bybit', ok: ex?.ok ?? false, detail: ex?.sandbox ? 'testnet' : 'mainnet spot', metric: ex?.latency_ms != null ? `${ex.latency_ms}ms` : null },
    { name: 'Data stream', ok: wsConnected, detail: 'WebSocket push channel', metric: ws?.clients != null ? `${ws.clients} client${ws.clients === 1 ? '' : 's'}` : null },
    { name: 'Database', ok: db?.ok ?? false, detail: 'SQLite via SQLAlchemy async' },
    { name: 'Telegram', ok: tg?.ok ?? false, detail: 'trade alerts channel' },
    { name: 'Engine loop', ok: bot?.running ?? false, detail: bot?.running ? `${bot?.dry_run ? 'paper' : 'live'} mode` : 'stopped by operator', metric: bot?.uptime ? `up ${bot.uptime}` : null },
  ]

  const allOk = !unreachable && services.every((s) => s.ok || s.name === 'Engine loop')
  const downCount = services.filter((s) => !s.ok && s.name !== 'Engine loop').length

  const avgMs = history.length ? Math.round(history.reduce((a, b) => a + b.ms, 0) / history.length) : null
  const maxMs = history.length ? Math.max(...history.map((h) => h.ms)) : null

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4 animate-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-tx">System Health</h1>
          <p className="text-2xs text-tx-dim mt-0.5">Infrastructure telemetry · {POLL_MS / 1000}s polling</p>
        </div>
        <Chip tone={allOk ? 'up' : 'down'} pulse>
          {allOk ? 'ALL SYSTEMS OPERATIONAL' : `${downCount} SERVICE${downCount === 1 ? '' : 'S'} DEGRADED`}
        </Chip>
      </div>

      {/* Service grid */}
      {!health ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map((s) => <ServiceTile key={s.name} {...s} />)}
        </div>
      )}

      {/* Latency history */}
      <Panel
        title="Exchange latency"
        right={
          history.length > 0 && (
            <span className="text-3xs font-mono text-tx-dim">
              avg <span className="text-tx-2">{avgMs}ms</span> · peak <span className="text-tx-2">{maxMs}ms</span>
            </span>
          )
        }
      >
        {history.length < 2 ? (
          <div className="h-36 flex items-center justify-center text-2xs text-tx-faint">
            Collecting samples…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={144}>
            <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="latGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7aa2ff" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#7aa2ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis
                tick={{ fill: '#5e6778', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                width={42}
                tickFormatter={(v) => `${v}ms`}
                axisLine={false} tickLine={false}
              />
              <Tooltip content={<LatencyTooltip />} />
              <Area type="monotone" dataKey="ms" stroke="#7aa2ff" strokeWidth={1.5} fill="url(#latGrad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}
