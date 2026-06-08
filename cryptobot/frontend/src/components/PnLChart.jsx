import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../hooks/useApi.js'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{d.time}</p>
      <p className={`font-mono font-semibold ${d.win ? 'text-emerald-400' : 'text-red-400'}`}>
        {d.equity_usdt >= 0 ? '+' : ''}${d.equity_usdt.toFixed(4)} cumulative
      </p>
      {d.pnl_usdt != null && (
        <p className={`font-mono text-xs mt-0.5 ${d.win ? 'text-emerald-500' : 'text-red-500'}`}>
          trade: {d.pnl_usdt >= 0 ? '+' : ''}${d.pnl_usdt.toFixed(4)}
        </p>
      )}
      {d.symbol && <p className="text-gray-500 mt-0.5">{d.symbol} · {d.exit_reason}</p>}
    </div>
  )
}

export default function PnLChart({ compact = false }) {
  const [data, setData] = useState([])

  useEffect(() => {
    const load = () => api.get('/stats/equity-curve').then(r => setData(r.data)).catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const displayed = data.map(d => ({
    ...d,
    time: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  const last = displayed[displayed.length - 1]
  const totalPnl = last?.equity_usdt ?? 0
  const isPositive = totalPnl >= 0
  const strokeColor = isPositive ? '#10b981' : '#ef4444'
  const height = compact ? 140 : 220

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-300">Equity Curve</h3>
          {displayed.length > 0 && (
            <p className={`text-xs font-mono mt-0.5 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}${totalPnl.toFixed(4)} · {displayed.length} trade{displayed.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      <div className="p-3">
        {displayed.length === 0 ? (
          <div className={`flex items-center justify-center text-gray-600 text-sm`} style={{ height }}>
            No completed trades yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={displayed} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              {!compact && <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 10 }} />}
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} width={55}
                tickFormatter={v => `$${v.toFixed(2)}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="equity_usdt"
                stroke={strokeColor}
                fill="url(#pnlGrad)"
                strokeWidth={2}
                dot={(props) => {
                  const { cx, cy, payload } = props
                  return <circle key={payload.trade_id} cx={cx} cy={cy} r={3}
                    fill={payload.win ? '#10b981' : '#ef4444'} stroke="none" />
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
