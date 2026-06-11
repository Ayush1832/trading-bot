import useStore from '../store/useStore.js'
import MarketChart from '../terminal/MarketChart.jsx'
import PositionPanel from '../terminal/PositionPanel.jsx'
import StrategyIntel from '../terminal/StrategyIntel.jsx'
import ActivityFeed from '../terminal/ActivityFeed.jsx'
import Watchlist from '../terminal/Watchlist.jsx'
import { Stat, fmtSigned } from '../ui/kit.jsx'

/* The 6 numbers a trader needs in the first 3 seconds */
function StatStrip({ s }) {
  const {
    pnl_today_usdt = 0, wins_today = 0, losses_today = 0,
    session_pnl_usdt = 0, session_trades = 0, session_wins = 0,
    signals_today = 0, trade_opened_today = false, daily_halted = false,
    usdt_balance = 0,
  } = s

  const winRate = session_trades > 0 ? (session_wins / session_trades) * 100 : null
  const drawdownPct = usdt_balance > 0 ? Math.max(0, (-pnl_today_usdt / Math.max(usdt_balance, 0.01)) * 100) : 0

  const slot = daily_halted
    ? { value: 'HALTED', tone: 'down', sub: 'drawdown cap hit' }
    : trade_opened_today
    ? { value: 'USED', tone: 'warn', sub: 'resets 00:00 UTC' }
    : { value: 'OPEN', tone: 'up', sub: '1 per day max' }

  return (
    <div className="panel grid grid-cols-3 lg:grid-cols-6 divide-x divide-line-soft">
      <Stat
        className="px-4 py-2.5"
        label="Today P&L"
        value={fmtSigned(pnl_today_usdt)}
        tone={pnl_today_usdt > 0 ? 'up' : pnl_today_usdt < 0 ? 'down' : undefined}
        sub={`${wins_today}W · ${losses_today}L`}
      />
      <Stat
        className="px-4 py-2.5"
        label="Session P&L"
        value={fmtSigned(session_pnl_usdt)}
        tone={session_pnl_usdt > 0 ? 'up' : session_pnl_usdt < 0 ? 'down' : undefined}
        sub={`${session_trades} trade${session_trades === 1 ? '' : 's'}`}
      />
      <Stat
        className="px-4 py-2.5"
        label="Win rate"
        value={winRate != null ? `${winRate.toFixed(0)}%` : '—'}
        tone={winRate != null ? (winRate >= 50 ? 'up' : 'down') : undefined}
        sub={`${session_wins}W · ${session_trades - session_wins}L`}
      />
      <Stat
        className="px-4 py-2.5"
        label="Signals today"
        value={String(signals_today)}
        tone={signals_today > 0 ? 'accent' : undefined}
        sub="full confluence hits"
      />
      <Stat
        className="px-4 py-2.5"
        label="Trade slot"
        value={slot.value}
        tone={slot.tone}
        sub={slot.sub}
      />
      <Stat
        className="px-4 py-2.5"
        label="Daily guard"
        value={`${drawdownPct.toFixed(1)}%`}
        tone={daily_halted ? 'down' : drawdownPct >= 4 ? 'warn' : undefined}
        sub="of 5% drawdown cap"
      />
    </div>
  )
}

export default function Terminal() {
  const botState = useStore((s) => s.botState)

  return (
    <div className="p-3 flex flex-col gap-3 min-h-full xl:h-full animate-enter">
      <StatStrip s={botState} />

      {/* Core: chart + decision column */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-3 flex-1 min-h-0">
        <div className="min-h-[420px] xl:min-h-0">
          <MarketChart />
        </div>
        <div className="grid grid-rows-[auto_1fr] gap-3 min-h-0">
          <PositionPanel />
          <StrategyIntel />
        </div>
      </div>

      {/* Ground floor: watchlist + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 h-[220px] shrink-0">
        <Watchlist />
        <ActivityFeed />
      </div>
    </div>
  )
}
