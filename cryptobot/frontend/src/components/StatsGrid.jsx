export default function StatsGrid({ botState }) {
  const {
    session_pnl_usdt, session_trades, session_wins, running,
    signals_today = 0,
    trades_today = 0,
    trade_opened_today = false,
    grade,
    rr_ratio,
    daily_halted = false,
  } = botState

  const MAX_DAILY = 1  // swing: 1 trade per day maximum

  const winRate = session_trades > 0
    ? ((session_wins / session_trades) * 100).toFixed(1)
    : '0.0'
  const pnl = (session_pnl_usdt || 0).toFixed(4)
  const pnlPos = (session_pnl_usdt || 0) >= 0

  const tradeTakenColor = trade_opened_today
    ? 'text-yellow-400'
    : daily_halted ? 'text-red-400' : 'text-green-400'

  const tradeTakenLabel = trade_opened_today
    ? 'Yes — waiting for close'
    : daily_halted ? 'Halted' : 'No — scanning'

  const cards = [
    {
      label: "Session P&L",
      value: `${pnlPos ? '+' : ''}$${pnl}`,
      color: pnlPos ? 'text-green-400' : 'text-red-400',
      sub: `${session_wins}W / ${session_trades - session_wins}L`,
    },
    {
      label: 'Win Rate',
      value: `${winRate}%`,
      color: 'text-blue-400',
      sub: `${session_trades} closed trade${session_trades !== 1 ? 's' : ''}`,
    },
    {
      label: 'Trade Taken Today',
      value: tradeTakenLabel,
      color: tradeTakenColor,
      sub: `${signals_today} signal${signals_today !== 1 ? 's' : ''} found`,
    },
    {
      label: 'Last Signal',
      value: grade ? `Grade ${grade}` : '—',
      color: grade === 'A+' ? 'text-green-400' : grade === 'A' ? 'text-blue-400' : 'text-gray-400',
      sub: rr_ratio ? `R:R ${rr_ratio.toFixed(1)}:1` : running ? 'Scanning...' : 'Bot stopped',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{c.label}</p>
          <p className={`text-xl font-bold ${c.color} truncate`}>{c.value}</p>
          {c.sub && <p className="text-xs text-gray-600 mt-0.5">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
