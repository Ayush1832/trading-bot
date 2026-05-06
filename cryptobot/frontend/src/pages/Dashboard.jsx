import useStore from '../store/useStore.js'
import StatsGrid from '../components/StatsGrid.jsx'
import CandleChart from '../components/CandleChart.jsx'
import LiveTradeCard from '../components/LiveTradeCard.jsx'
import PnLChart from '../components/PnLChart.jsx'
import LogFeed from '../components/LogFeed.jsx'
import PaperTradingBanner from '../components/PaperTradingBanner.jsx'
import ScannerPanel from '../components/ScannerPanel.jsx'

export default function Dashboard() {
  const botState = useStore((s) => s.botState)

  return (
    <div className="space-y-5">
      <PaperTradingBanner dryRun={botState.dry_run} />
      <StatsGrid botState={botState} />
      <ScannerPanel />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <CandleChart symbol={botState.current_symbol} />
        </div>
        <div>
          <LiveTradeCard />
        </div>
      </div>

      <PnLChart />
      <LogFeed />
    </div>
  )
}
