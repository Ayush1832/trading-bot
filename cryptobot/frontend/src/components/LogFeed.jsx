import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore.js'

const LEVEL_COLORS = {
  INFO:   'text-gray-400',
  SIGNAL: 'text-blue-400',
  OPEN:   'text-green-400',
  CLOSE:  'text-yellow-400',
  TSL:    'text-teal-400',
  ERROR:  'text-red-400',
  ORDER:  'text-purple-400',
  TP1:    'text-emerald-400',
}

const LEVEL_BG = {
  SIGNAL: 'bg-blue-950/30',
  OPEN:   'bg-green-950/30',
  CLOSE:  'bg-yellow-950/30',
  ERROR:  'bg-red-950/30',
  TP1:    'bg-emerald-950/30',
}

const NOISE_PATTERNS = [
  'WebSocket client connected',
  'WebSocket client disconnected',
  'ping',
  'pong',
]

function isNoise(log) {
  if (!log.message) return false
  return NOISE_PATTERNS.some((p) => log.message.toLowerCase().includes(p.toLowerCase()))
}

export default function LogFeed() {
  const logs = useStore((s) => s.logs)
  const bottomRef = useRef(null)
  const [filter, setFilter] = useState('ALL')
  const [autoScroll, setAutoScroll] = useState(true)

  const levels = ['ALL', 'SIGNAL', 'OPEN', 'CLOSE', 'TSL', 'ERROR', 'ORDER']

  const filtered = logs
    .filter((l) => !isNoise(l))
    .filter((l) => filter === 'ALL' || l.level === filter)
    .slice(-150)

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filtered, autoScroll])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-300">Live Log Feed</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {levels.map((l) => (
              <button
                key={l}
                onClick={() => setFilter(l)}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                  filter === l
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              autoScroll ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'
            }`}
            title="Toggle auto-scroll"
          >
            {autoScroll ? '⬇ Auto' : '⏸ Paused'}
          </button>
          <span className="text-xs text-gray-600 font-mono">{filtered.length} entries</span>
        </div>
      </div>
      <div className="h-56 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
        {filtered.length === 0 && (
          <p className="text-gray-600 py-4 text-center">
            {filter !== 'ALL' ? `No ${filter} entries yet` : 'Waiting for log entries...'}
          </p>
        )}
        {filtered.map((log, i) => (
          <div
            key={i}
            className={`flex gap-2 rounded px-1 py-0.5 ${LEVEL_BG[log.level] || ''}`}
          >
            <span className="text-gray-600 shrink-0 w-16 text-right">
              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
            </span>
            <span className={`shrink-0 w-14 font-semibold ${LEVEL_COLORS[log.level] || 'text-gray-400'}`}>
              {log.level}
            </span>
            <span className="text-gray-300 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
