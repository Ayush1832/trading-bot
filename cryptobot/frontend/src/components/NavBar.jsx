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
  const dryRun = useStore((s) => s.botState.dry_run)
  const balance = useStore((s) => s.botState.usdt_balance)
  const sandboxMode = useStore((s) => s.botState.sandbox_mode)
  const wsConnected = useStore((s) => s.wsConnected)

  const modeBadge = dryRun
    ? { label: 'PAPER', cls: 'bg-amber-800/60 text-amber-300 border-amber-700' }
    : sandboxMode
    ? { label: 'TESTNET', cls: 'bg-blue-900/60 text-blue-300 border-blue-700' }
    : { label: 'LIVE', cls: 'bg-red-900/60 text-red-300 border-red-700' }

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-indigo-400">CryptoBot Pro</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${modeBadge.cls}`}>
              {modeBadge.label}
            </span>
          </div>
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
        <div className="flex items-center gap-4">
          {/* WebSocket connection indicator */}
          <div className="flex items-center gap-1.5" title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}>
            <span className={`w-2 h-2 rounded-full transition-colors ${
              wsConnected ? 'bg-emerald-400 shadow-[0_0_6px_#10b981]' : 'bg-gray-600'
            } ${wsConnected ? 'animate-pulse' : ''}`} />
            <span className="text-xs text-gray-600 hidden sm:inline">{wsConnected ? 'Live' : 'Offline'}</span>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-500 leading-none mb-0.5">USDT Balance</p>
            <p className="text-sm font-bold font-mono text-white">
              ${(balance || 0).toFixed(2)}
            </p>
          </div>
          <BotStatusBadge running={running} />
        </div>
      </div>
    </nav>
  )
}
