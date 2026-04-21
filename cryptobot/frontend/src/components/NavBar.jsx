import { Link, useLocation } from 'react-router-dom'
import BotStatusBadge from './BotStatusBadge.jsx'
import useStore from '../store/useStore.js'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/trades', label: 'Trades' },
  { to: '/backtest', label: 'Backtest' },
  { to: '/settings', label: 'Settings' },
]

export default function NavBar() {
  const { pathname } = useLocation()
  const running = useStore((s) => s.botState.running)

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg text-indigo-400">CryptoBot Pro</span>
          <div className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  pathname === l.to
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <BotStatusBadge running={running} />
      </div>
    </nav>
  )
}
