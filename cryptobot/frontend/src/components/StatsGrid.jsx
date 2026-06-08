export default function StatsGrid({ botState }) {
  const {
    session_pnl_usdt, session_trades, session_wins, running,
    signals_today = 0,
    trades_today = 0,
    wins_today = 0,
    losses_today = 0,
    pnl_today_usdt = 0,
    trade_opened_today = false,
    grade,
    rr_ratio,
    daily_halted = false,
    usdt_balance = 0,
  } = botState

  const winRate = session_trades > 0
    ? ((session_wins / session_trades) * 100).toFixed(1)
    : '—'
  const pnl = (session_pnl_usdt || 0).toFixed(4)
  const pnlPos = (session_pnl_usdt || 0) >= 0
  const todayPnl = (pnl_today_usdt || 0).toFixed(4)
  const todayPnlPos = (pnl_today_usdt || 0) >= 0

  const tradeTakenColor = trade_opened_today
    ? 'text-yellow-400'
    : daily_halted ? 'text-red-400' : 'text-green-400'
  const tradeTakenLabel = trade_opened_today
    ? 'Taken'
    : daily_halted ? 'Halted' : 'Scanning'

  const cards = [
    {
      label: 'USDT Balance',
      value: `$${(usdt_balance || 0).toFixed(2)}`,
      color: 'text-white',
      sub: running ? 'Live balance' : 'Last known',
      icon: '💰',
    },
    {
      label: 'Session P&L',
      value: `${pnlPos ? '+' : ''}$${pnl}`,
      color: pnlPos ? 'text-green-400' : 'text-red-400',
      sub: `${session_wins}W / ${session_trades - session_wins}L this session`,
      icon: '📈',
    },
    {
      label: "Today's P&L",
      value: `${todayPnlPos ? '+' : ''}$${todayPnl}`,
      color: todayPnlPos ? 'text-green-400' : 'text-red-400',
      sub: `${wins_today}W / ${losses_today}L today`,
      icon: '📅',
    },
    {
      label: 'Win Rate',
      value: winRate !== '—' ? `${winRate}%` : '—',
      color: 'text-blue-400',
      sub: `${session_trades} closed trade${session_trades !== 1 ? 's' : ''}`,
      icon: '🎯',
    },
    {
      label: 'Trade Today',
      value: tradeTakenLabel,
      color: tradeTakenColor,
      sub: `${signals_today} signal${signals_today !== 1 ? 's' : ''} found`,
      icon: '🔍',
    },
    {
      label: 'Last Signal',
      value: grade ? `Grade ${grade}` : '—',
      color: grade === 'A+' ? 'text-green-400' : grade === 'A' ? 'text-blue-400' : 'text-gray-400',
      sub: rr_ratio ? `R:R ${rr_ratio.toFixed(1)}:1` : running ? 'Scanning...' : 'Bot stopped',
      icon: '⚡',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{c.label}</p>
            <span className="text-base leading-none">{c.icon}</span>
          </div>
          <p className={`text-xl font-bold ${c.color} truncate`}>{c.value}</p>
          {c.sub && <p className="text-xs text-gray-600 mt-1 truncate">{c.sub}</p>}
        </div>
      ))}
    </div>
  )
}
