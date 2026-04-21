import { useEffect, useRef } from 'react'
import useStore from '../store/useStore.js'

const LEVEL_COLORS = {
  INFO: 'text-gray-400',
  SIGNAL: 'text-blue-400',
  OPEN: 'text-green-400',
  CLOSE: 'text-yellow-400',
  TSL: 'text-teal-400',
  ERROR: 'text-red-400',
  ORDER: 'text-purple-400',
}

export default function LogFeed() {
  const logs = useStore((s) => s.logs)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">Live Log Feed</h3>
      </div>
      <div className="h-48 overflow-y-auto p-3 scrollbar-thin font-mono text-xs space-y-0.5">
        {logs.length === 0 && (
          <p className="text-gray-600">Waiting for log entries...</p>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 shrink-0">
              {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
            </span>
            <span className={`shrink-0 w-14 ${LEVEL_COLORS[log.level] || 'text-gray-400'}`}>
              [{log.level}]
            </span>
            <span className="text-gray-300 break-all">{log.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
