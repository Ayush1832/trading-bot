import useStore from '../store/useStore.js'
import StatsGrid from '../components/StatsGrid.jsx'
import CandleChart from '../components/CandleChart.jsx'
import LiveTradeCard from '../components/LiveTradeCard.jsx'
import PnLChart from '../components/PnLChart.jsx'
import LogFeed from '../components/LogFeed.jsx'

export default function Dashboard() {
  const botState = useStore((s) => s.botState)

  return (
    <div className="space-y-5">
      <StatsGrid botState={botState} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <CandleChart />
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
