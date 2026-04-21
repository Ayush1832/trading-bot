export default function StatsGrid({ botState }) {
  const { session_pnl_usdt, session_trades, session_wins, running } = botState
  const winRate = session_trades > 0 ? ((session_wins / session_trades) * 100).toFixed(1) : '0.0'
  const pnl = (session_pnl_usdt || 0).toFixed(4)
  const pnlPos = (session_pnl_usdt || 0) >= 0

  const cards = [
    {
      label: "Today's P&L",
      value: `${pnlPos ? '+' : ''}$${pnl}`,
      color: pnlPos ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Win Rate',
      value: `${winRate}%`,
      color: 'text-blue-400',
    },
    {
      label: 'Total Trades',
      value: session_trades,
      color: 'text-gray-200',
    },
    {
      label: 'Bot Status',
      value: running ? 'RUNNING' : 'STOPPED',
      color: running ? 'text-green-400' : 'text-gray-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{c.label}</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}
