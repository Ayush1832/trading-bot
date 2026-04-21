import { useState, useEffect, useCallback } from 'react'
import TradeTable from '../components/TradeTable.jsx'
import api from '../hooks/useApi.js'

export default function Trades() {
  const [trades, setTrades] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({ status: '', exit_reason: '', date_from: '', date_to: '' })
  const [stats, setStats] = useState(null)
  const limit = 20

  const load = useCallback(async () => {
    const params = {
      limit,
      offset: page * limit,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    }
    const [tradesRes, statsRes] = await Promise.all([
      api.get('/trades', { params }),
      api.get('/stats'),
    ])
    setTrades(tradesRes.data)
    setStats(statsRes.data)
  }, [page, filters])

  useEffect(() => { load() }, [load])

  const exportCsv = () => window.open('/api/trades/export', '_blank')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Trade History</h2>
        <button
          onClick={exportCsv}
          className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded"
        >
          Export CSV
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-sm">
            <p className="text-gray-500 text-xs">Total Trades</p>
            <p className="font-bold text-lg">{stats.total_trades}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-sm">
            <p className="text-gray-500 text-xs">Win Rate</p>
            <p className="font-bold text-lg">{((stats.win_rate || 0) * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-800 text-sm">
            <p className="text-gray-500 text-xs">Total P&L</p>
            <p className={`font-bold text-lg ${(stats.total_pnl_usdt || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(stats.total_pnl_usdt || 0) >= 0 ? '+' : ''}${(stats.total_pnl_usdt || 0).toFixed(4)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[{ value: '', label: 'All Status' }, { value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }]}
        />
        <FilterSelect
          label="Exit Reason"
          value={filters.exit_reason}
          onChange={(v) => setFilters((f) => ({ ...f, exit_reason: v }))}
          options={[
            { value: '', label: 'All Reasons' },
            { value: 'TAKE_PROFIT', label: 'Take Profit' },
            { value: 'TRAILING_SL', label: 'Trailing SL' },
            { value: 'HARD_SL', label: 'Hard SL' },
            { value: 'TIMEOUT', label: 'Timeout' },
          ]}
        />
        <input
          type="date"
          className="input text-xs"
          value={filters.date_from}
          onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
        />
        <input
          type="date"
          className="input text-xs"
          value={filters.date_to}
          onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
        />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <TradeTable trades={trades} />
      </div>

      <div className="flex items-center justify-between">
        <button
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="text-xs px-3 py-1.5 bg-gray-800 rounded disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-xs text-gray-500">Page {page + 1}</span>
        <button
          disabled={trades.length < limit}
          onClick={() => setPage((p) => p + 1)}
          className="text-xs px-3 py-1.5 bg-gray-800 rounded disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select
      className="input text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
