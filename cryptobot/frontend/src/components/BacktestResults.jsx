import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import TradeTable from './TradeTable.jsx'
import api from '../hooks/useApi.js'

function StatCard({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

export default function BacktestResults({ result, onApply }) {
  if (!result) return null

  const isPositive = result.total_pnl_usdt >= 0

  const applySettings = async () => {
    try {
      await api.post('/config', {
        trail_pct: result.trail_pct,
        take_profit_pct: result.take_profit_pct,
        hard_sl_pct: result.hard_sl_pct,
        max_hold_minutes: result.max_hold_minutes,
      })
      alert('Settings applied!')
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Trades" value={result.total_trades} />
        <StatCard
          label="Win Rate"
          value={`${(result.win_rate * 100).toFixed(1)}%`}
          color={result.win_rate >= 0.5 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          label="Total P&L"
          value={`${result.total_pnl_usdt >= 0 ? '+' : ''}$${result.total_pnl_usdt.toFixed(4)}`}
          color={isPositive ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard label="Max Drawdown" value={`${result.max_drawdown_pct.toFixed(2)}%`} color="text-red-400" />
        <StatCard
          label="Profit Factor"
          value={result.profit_factor === Infinity ? '∞' : result.profit_factor.toFixed(2)}
          color={result.profit_factor > 1 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard label="Sharpe" value={result.sharpe_ratio.toFixed(2)} />
      </div>

      {result.equity_curve?.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Equity Curve</h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={result.equity_curve}>
              <defs>
                <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="timestamp" hide />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(v) => [`$${Number(v).toFixed(4)}`, 'Equity']}
              />
              <Area type="monotone" dataKey="equity_usdt" stroke={isPositive ? '#22c55e' : '#ef4444'} fill="url(#btGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
          <h4 className="text-sm font-semibold text-gray-300">Trade List</h4>
          <button
            onClick={applySettings}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded"
          >
            Apply These Settings
          </button>
        </div>
        <TradeTable trades={result.trades?.slice(0, 100) || []} />
      </div>
    </div>
  )
}
