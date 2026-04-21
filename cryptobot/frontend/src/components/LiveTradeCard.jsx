import { useState, useEffect } from 'react'
import useStore from '../store/useStore.js'

function elapsed(entryTime) {
  if (!entryTime) return '—'
  const secs = Math.floor(Date.now() / 1000 - entryTime)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s}s`
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
    return (
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <p className="text-gray-500 text-sm font-medium mb-4">Waiting for signal...</p>
        <div className="grid grid-cols-2 gap-3">
          <Indicator label="RSI(14)" value={botState.last_rsi?.toFixed(2)} target="< 30" ok={botState.last_rsi < 30} />
          <Indicator label="Vol Ratio" value={botState.last_volume_ratio?.toFixed(2)} target="> 1.5" ok={botState.last_volume_ratio > 1.5} />
          <Indicator label="BB Low" value={botState.last_bb_low?.toFixed(2)} target="price ≤ BB" />
          <Indicator label="EMA 50" value={botState.last_ema50?.toFixed(2)} target="price > EMA" />
        </div>
      </div>
    )
  }

  const pnlPct = botState.unrealized_pnl_pct || 0
  const pnlPos = pnlPct >= 0

  return (
    <div className={`bg-gray-900 rounded-xl p-5 border ${tslPulse ? 'border-teal-500 animate-pulse' : 'border-gray-800'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-green-400 uppercase">Trade Open</span>
        <span className="text-xs text-gray-500">{elapsed(botState.entry_time)}</span>
      </div>

      <div className={`text-4xl font-bold mb-4 ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
        {pnlPos ? '+' : ''}{pnlPct.toFixed(3)}%
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <Row label="Entry" value={`$${botState.entry_price?.toFixed(2)}`} />
        <Row label="Current" value={`$${botState.current_price?.toFixed(2)}`} />
        <Row label="Peak" value={`$${botState.peak_price?.toFixed(2)}`} />
        <Row label="TSL" value={`$${botState.trailing_sl?.toFixed(2)}`} color="text-red-400" />
        <Row label="TP" value={`$${botState.take_profit_price?.toFixed(2)}`} color="text-blue-400" />
        <Row label="Qty" value={botState.trade_qty?.toFixed(8)} />
      </div>
    </div>
  )
}

function Indicator({ label, value, target, ok }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-sm font-mono font-semibold ${ok ? 'text-green-400' : 'text-gray-300'}`}>
        {value ?? '—'}
      </p>
      <p className="text-xs text-gray-600">{target}</p>
    </div>
  )
}

function Row({ label, value, color = 'text-gray-200' }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className={`font-mono text-right ${color}`}>{value ?? '—'}</span>
    </>
  )
}
