import useStore from '../store/useStore.js'
import CandleChart from '../components/CandleChart.jsx'
import LiveTradeCard from '../components/LiveTradeCard.jsx'
import PnLChart from '../components/PnLChart.jsx'
import LogFeed from '../components/LogFeed.jsx'
import PaperTradingBanner from '../components/PaperTradingBanner.jsx'
import ScannerPanel from '../components/ScannerPanel.jsx'
import SystemHealth from '../components/SystemHealth.jsx'
import RiskCenter from '../components/RiskCenter.jsx'

// ── Top metrics strip ────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = 'text-white', accent }) {
  return (
    <div className={`bg-gray-900 rounded-xl px-4 py-3 border flex flex-col gap-1 min-w-0 ${accent || 'border-gray-800'}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-lg font-bold font-mono truncate ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 truncate">{sub}</p>}
    </div>
  )
}

function TopMetrics({ botState }) {
  const {
    usdt_balance = 0,
    session_pnl_usdt = 0, session_trades = 0, session_wins = 0,
    pnl_today_usdt = 0, wins_today = 0, losses_today = 0,
    signals_today = 0, trade_opened_today = false, daily_halted = false,
    grade, rr_ratio, running,
  } = botState

  const sessionPnlPos = session_pnl_usdt >= 0
  const todayPnlPos = pnl_today_usdt >= 0
  const winRate = session_trades > 0 ? ((session_wins / session_trades) * 100).toFixed(0) : '—'

  const tradeStatus = daily_halted ? { label: 'Halted', color: 'text-red-400' }
    : trade_opened_today ? { label: 'Taken', color: 'text-amber-400' }
    : { label: 'Ready', color: 'text-emerald-400' }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
      <MetricCard
        label="Balance"
        value={`$${usdt_balance.toFixed(2)}`}
        sub="USDT available"
        color="text-white"
        accent="border-gray-700"
      />
      <MetricCard
        label="Today P&L"
        value={`${todayPnlPos ? '+' : ''}$${pnl_today_usdt.toFixed(4)}`}
        sub={`${wins_today}W / ${losses_today}L`}
        color={todayPnlPos ? 'text-emerald-400' : 'text-red-400'}
      />
      <MetricCard
        label="Session P&L"
        value={`${sessionPnlPos ? '+' : ''}$${session_pnl_usdt.toFixed(4)}`}
        sub={`${session_trades} trade${session_trades !== 1 ? 's' : ''}`}
        color={sessionPnlPos ? 'text-emerald-400' : 'text-red-400'}
      />
      <MetricCard
        label="Win Rate"
        value={winRate !== '—' ? `${winRate}%` : '—'}
        sub={`${session_wins}W / ${session_trades - session_wins}L total`}
        color="text-blue-400"
      />
      <MetricCard
        label="Trade Today"
        value={tradeStatus.label}
        sub={`${signals_today} signal${signals_today !== 1 ? 's' : ''} found`}
        color={tradeStatus.color}
      />
      <MetricCard
        label="Last Grade"
        value={grade ? `Grade ${grade}` : '—'}
        sub={rr_ratio ? `R:R ${rr_ratio.toFixed(1)}:1` : running ? 'Scanning…' : 'Bot off'}
        color={grade === 'A+' ? 'text-emerald-400' : grade === 'A' ? 'text-blue-400' : 'text-gray-400'}
      />
      <MetricCard
        label="Max Trade"
        value="$1.00"
        sub="Hard cap"
        color="text-gray-400"
      />
      <MetricCard
        label="Daily Limit"
        value={daily_halted ? 'HALTED' : '1 / day'}
        sub={daily_halted ? 'Drawdown cap hit' : 'Swing strategy'}
        color={daily_halted ? 'text-red-400' : 'text-gray-400'}
      />
    </div>
  )
}

// ── Hero status banner ────────────────────────────────────────────────────────

function HeroBanner({ botState }) {
  const {
    running, dry_run, trade_open, current_symbol,
    entry_price, current_price, unrealized_pnl_pct,
    grade, rr_ratio, half_exited,
    tp1_price, tp2_price, trailing_sl, sl_price,
  } = botState

  if (!running) return null

  const pnlColor = unrealized_pnl_pct == null ? 'text-gray-400'
    : unrealized_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'

  const bannerColor = trade_open
    ? 'border-emerald-700/50 bg-emerald-950/20'
    : 'border-indigo-700/40 bg-indigo-950/10'

  return (
    <div className={`rounded-xl border px-5 py-4 transition-colors ${bannerColor}`}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${trade_open ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-indigo-400 animate-pulse'}`} />
          <div>
            <p className="text-sm font-semibold text-white">
              {trade_open ? `In Trade — ${current_symbol?.replace('/USDT', '')}` : 'Scanning Markets'}
            </p>
            <p className="text-xs text-gray-500">
              {dry_run ? 'Paper trading' : 'Live — real money'} · 1W/1D/4H/1H confluence
            </p>
          </div>
        </div>

        {trade_open && current_price && entry_price && (
          <>
            <div className="text-xs font-mono">
              <p className="text-gray-500">Entry</p>
              <p className="text-gray-200 font-semibold">${entry_price.toFixed(4)}</p>
            </div>
            <div className="text-xs font-mono">
              <p className="text-gray-500">Current</p>
              <p className="text-white font-semibold">${current_price.toFixed(4)}</p>
            </div>
            {unrealized_pnl_pct != null && (
              <div className="text-xs font-mono">
                <p className="text-gray-500">Unrealized</p>
                <p className={`font-bold text-base ${pnlColor}`}>
                  {unrealized_pnl_pct >= 0 ? '+' : ''}{unrealized_pnl_pct.toFixed(2)}%
                </p>
              </div>
            )}
            {grade && (
              <div className="text-xs font-mono">
                <p className="text-gray-500">Grade</p>
                <p className={`font-bold ${grade === 'A+' ? 'text-emerald-400' : grade === 'A' ? 'text-blue-400' : 'text-gray-300'}`}>
                  {grade} · {rr_ratio?.toFixed(1)}:1 R:R
                </p>
              </div>
            )}
          </>
        )}

        {trade_open && sl_price && (
          <div className="flex gap-4 text-xs font-mono ml-auto">
            <span className="text-red-400">SL ${sl_price.toFixed(4)}</span>
            {trailing_sl && trailing_sl !== sl_price && <span className="text-orange-400">TSL ${trailing_sl.toFixed(4)}</span>}
            {!half_exited && tp1_price && <span className="text-emerald-400">TP1 ${tp1_price.toFixed(4)}</span>}
            {tp2_price && <span className="text-blue-400">TP2 ${tp2_price.toFixed(4)}</span>}
            {half_exited && <span className="text-emerald-500 font-semibold">✓ TP1 hit — running to TP2</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const botState = useStore((s) => s.botState)

  return (
    <div className="space-y-4">
      <PaperTradingBanner dryRun={botState.dry_run} />
      <TopMetrics botState={botState} />
      <HeroBanner botState={botState} />

      {/* Chart + Position Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CandleChart symbol={botState.current_symbol} />
        </div>
        <div>
          <LiveTradeCard />
        </div>
      </div>

      <ScannerPanel />

      {/* System Health + Risk + P&L */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SystemHealth />
        <RiskCenter />
        <PnLChart compact />
      </div>

      <LogFeed />
    </div>
  )
}
