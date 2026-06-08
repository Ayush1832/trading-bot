import { useEffect, useState } from 'react'
import api from '../hooks/useApi.js'
import useStore from '../store/useStore.js'

function Indicator({ ok, label, detail, latency }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? 'bg-emerald-400' : 'bg-red-500'} ${ok ? 'shadow-[0_0_6px_#10b981]' : ''}`} />
        <span className="text-sm text-gray-300">{label}</span>
      </div>
      <div className="text-right">
        <span className={`text-xs font-mono ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {ok ? 'OK' : 'ERROR'}
        </span>
        {detail && <span className="text-xs text-gray-600 ml-2">{detail}</span>}
        {latency != null && <span className="text-xs text-gray-600 ml-1">{latency}ms</span>}
      </div>
    </div>
  )
}

export default function SystemHealth() {
  const [health, setHealth] = useState(null)
  const wsConnected = useStore((s) => s.wsConnected)

  useEffect(() => {
    const fetch = () => api.get('/health').then(r => setHealth(r.data)).catch(() => {})
    fetch()
    const t = setInterval(fetch, 15000)
    return () => clearInterval(t)
  }, [])

  const bot = health?.bot
  const exchange = health?.exchange
  const db = health?.database
  const telegram = health?.telegram
  const ws = health?.websocket

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">System Health</h3>
        {bot?.uptime && (
          <span className="text-xs text-gray-500 font-mono">up {bot.uptime}</span>
        )}
      </div>
      <div className="px-4 py-1">
        <Indicator
          ok={exchange?.ok ?? false}
          label="Exchange (Bybit)"
          detail={exchange?.sandbox ? 'testnet' : 'mainnet'}
          latency={exchange?.latency_ms}
        />
        <Indicator
          ok={wsConnected ?? false}
          label="WebSocket"
          detail={ws?.clients != null ? `${ws.clients} client${ws.clients !== 1 ? 's' : ''}` : null}
        />
        <Indicator ok={db?.ok ?? false} label="Database" />
        <Indicator ok={telegram?.ok ?? false} label="Telegram" />
        <Indicator
          ok={bot?.running ?? false}
          label="Bot Loop"
          detail={bot?.dry_run ? 'paper' : 'live'}
        />
      </div>
    </div>
  )
}
