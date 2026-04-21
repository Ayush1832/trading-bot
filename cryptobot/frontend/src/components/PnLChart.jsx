import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts'
import api from '../hooks/useApi.js'

export default function PnLChart() {
  const [data, setData] = useState([])
  const [sessionOnly, setSessionOnly] = useState(false)

  useEffect(() => {
    api.get('/stats/equity-curve').then((r) => setData(r.data)).catch(() => {})
    const t = setInterval(() => {
      api.get('/stats/equity-curve').then((r) => setData(r.data)).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const displayed = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleDateString(),
  }))

  const isPositive = displayed.length === 0 || displayed[displayed.length - 1]?.equity_usdt >= 0

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Cumulative P&L</h3>
        <button
          onClick={() => setSessionOnly((v) => !v)}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          {sessionOnly ? 'All Time' : 'Session Only'}
        </button>
      </div>

      {displayed.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-8">No completed trades yet</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={displayed} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af' }}
              formatter={(v) => [`$${v.toFixed(4)}`, 'P&L']}
            />
            <Area
              type="monotone"
              dataKey="equity_usdt"
              stroke={isPositive ? '#22c55e' : '#ef4444'}
              fill="url(#pnlGrad)"
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload } = props
                return (
                  <circle
                    key={payload.trade_id}
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={payload.win ? '#22c55e' : '#ef4444'}
                  />
                )
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
