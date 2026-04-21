function fmt(v, decimals = 2) {
  return v != null ? Number(v).toFixed(decimals) : '—'
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

const EXIT_COLORS = {
  TAKE_PROFIT: 'bg-green-900/60 text-green-300',
  TRAILING_SL: 'bg-teal-900/60 text-teal-300',
  HARD_SL: 'bg-red-900/60 text-red-300',
  TIMEOUT: 'bg-yellow-900/60 text-yellow-300',
}

export default function TradeTable({ trades }) {
  if (!trades.length) {
    return <p className="text-gray-600 text-sm py-8 text-center">No trades found</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-800">
            {['#', 'Date', 'Pair', 'Entry', 'Exit', 'Peak', 'P&L %', 'P&L USDT', 'Reason', 'Hold'].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const pnlPos = (t.pnl_usdt || 0) >= 0
            const holdMin = t.entry_time && t.exit_time
              ? ((new Date(t.exit_time) - new Date(t.entry_time)) / 60000).toFixed(1)
              : '—'

            return (
              <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-3 py-2 text-gray-500">{t.id}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtTime(t.entry_time)}</td>
                <td className="px-3 py-2">{t.symbol}</td>
                <td className="px-3 py-2 font-mono">${fmt(t.entry_price)}</td>
                <td className="px-3 py-2 font-mono">${fmt(t.exit_price)}</td>
                <td className="px-3 py-2 font-mono">${fmt(t.peak_price)}</td>
                <td className={`px-3 py-2 font-mono font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                  {pnlPos ? '+' : ''}{fmt(t.pnl_pct, 3)}%
                </td>
                <td className={`px-3 py-2 font-mono font-semibold ${pnlPos ? 'text-green-400' : 'text-red-400'}`}>
                  {pnlPos ? '+' : ''}${fmt(t.pnl_usdt, 4)}
                </td>
                <td className="px-3 py-2">
                  {t.exit_reason ? (
                    <span className={`px-2 py-0.5 rounded text-xs ${EXIT_COLORS[t.exit_reason] || 'bg-gray-800 text-gray-400'}`}>
                      {t.exit_reason}
                    </span>
                  ) : (
                    <span className="text-gray-600">OPEN</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-400">{holdMin}m</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
