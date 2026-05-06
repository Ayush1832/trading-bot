import { useState, useEffect } from 'react'
import api from '../hooks/useApi.js'

export default function PaperTradingBanner({ dryRun }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!dryRun) return
    const load = () => api.get('/paper/stats').then((r) => setStats(r.data)).catch(() => {})
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [dryRun])

  const reset = async () => {
    if (!confirm('Reset paper account back to $10.00?')) return
    await api.post('/paper/reset')
    api.get('/paper/stats').then((r) => setStats(r.data)).catch(() => {})
  }

  const switchToLive = async () => {
    if (!confirm('Switch to LIVE trading? Real orders will be placed on MEXC with your API keys!')) return
    await api.post('/paper/disable')
    window.location.reload()
  }

  if (!dryRun) return null

  const pnl = stats?.total_pnl_usdt ?? 0
  const pnlPos = pnl >= 0
  const balance = stats?.current_balance ?? 10

  return (
    <div className="bg-amber-950/60 border border-amber-700 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-amber-300 font-bold text-sm">PAPER TRADING MODE</span>
        <span className="text-amber-500 text-xs">No real money is at risk — all orders are simulated</span>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-amber-500 text-xs mr-1">Paper Balance:</span>
          <span className="text-amber-200 font-mono font-bold">${balance.toFixed(4)}</span>
        </div>
        <div>
          <span className="text-amber-500 text-xs mr-1">P&L:</span>
          <span className={`font-mono font-bold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
            {pnlPos ? '+' : ''}${pnl.toFixed(4)}
          </span>
        </div>
        {stats && (
          <div>
            <span className="text-amber-500 text-xs mr-1">Trades:</span>
            <span className="text-amber-200 font-mono">{stats.total_trades}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={reset}
          className="text-xs bg-amber-800 hover:bg-amber-700 text-amber-200 px-3 py-1 rounded"
        >
          Reset Account
        </button>
        <button
          onClick={switchToLive}
          className="text-xs bg-red-800 hover:bg-red-700 text-red-200 px-3 py-1 rounded"
        >
          Go Live
        </button>
      </div>
    </div>
  )
}
