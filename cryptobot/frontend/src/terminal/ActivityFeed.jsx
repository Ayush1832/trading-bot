import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore.js'
import { Panel } from '../ui/kit.jsx'

const LEVEL_STYLE = {
  INFO: 'text-tx-dim',
  SIGNAL: 'text-accent',
  OPEN: 'text-up',
  CLOSE: 'text-warn',
  TSL: 'text-teal-300',
  ERROR: 'text-down',
  ORDER: 'text-purple-300',
  TP1: 'text-up',
}

const NOISE = ['websocket client', 'ping', 'pong']
const isNoise = (l) => l.message && NOISE.some((p) => l.message.toLowerCase().includes(p))

const FILTERS = ['ALL', 'SIGNAL', 'OPEN', 'CLOSE', 'TSL', 'ORDER', 'ERROR']

export default function ActivityFeed() {
  const logs = useStore((s) => s.logs)
  const bottomRef = useRef(null)
  const scrollRef = useRef(null)
  const [filter, setFilter] = useState('ALL')
  const [follow, setFollow] = useState(true)

  const entries = logs
    .filter((l) => !isNoise(l))
    .filter((l) => filter === 'ALL' || l.level === filter)
    .slice(-200)

  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' })
  }, [entries.length, follow])

  // Pause follow when the user scrolls up
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom !== follow) setFollow(atBottom)
  }

  return (
    <Panel
      title="Activity"
      flush
      right={
        <div className="flex items-center gap-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-1.5 py-0.5 rounded text-3xs font-mono font-semibold transition-colors ${
                filter === f ? 'bg-accent/15 text-accent' : 'text-tx-faint hover:text-tx-2'
              }`}
            >
              {f}
            </button>
          ))}
          {!follow && (
            <button onClick={() => setFollow(true)} className="ml-1 px-1.5 py-0.5 rounded text-3xs font-semibold bg-warn/15 text-warn">
              RESUME ↓
            </button>
          )}
        </div>
      }
      className="h-full"
    >
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-2 font-mono text-2xs leading-relaxed">
        {entries.length === 0 && (
          <p className="text-tx-faint py-6 text-center">No {filter !== 'ALL' ? filter + ' ' : ''}activity yet</p>
        )}
        {entries.map((log, i) => (
          <div key={i} className="flex gap-2 py-px hover:bg-ink-800/50 rounded px-1 -mx-1">
            <span className="text-tx-faint shrink-0 w-[52px]">
              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false }) : ''}
            </span>
            <span className={`shrink-0 w-12 font-bold ${LEVEL_STYLE[log.level] || 'text-tx-dim'}`}>{log.level}</span>
            <span className="text-tx-2 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </Panel>
  )
}
