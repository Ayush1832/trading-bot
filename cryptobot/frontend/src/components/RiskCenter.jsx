import useStore from '../store/useStore.js'

function RiskRow({ label, value, status = 'ok', detail }) {
  const color = status === 'ok' ? 'text-emerald-400' : status === 'warn' ? 'text-amber-400' : 'text-red-400'
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '!' : '✗'
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div>
        <span className="text-sm text-gray-300">{label}</span>
        {detail && <p className="text-xs text-gray-600 mt-0.5">{detail}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-mono ${color}`}>{value}</span>
        <span className={`text-xs ${color}`}>{icon}</span>
      </div>
    </div>
  )
}

export default function RiskCenter() {
  const botState = useStore((s) => s.botState)

  const {
    usdt_balance = 0,
    pnl_today_usdt = 0,
    daily_halted = false,
    trade_open = false,
    trade_opened_today = false,
    max_trades_per_day,
    dry_run = false,
  } = botState

  const drawdownPct = usdt_balance > 0
    ? Math.max(0, (-pnl_today_usdt / Math.max(usdt_balance, 0.01)) * 100)
    : 0
  const drawdownStatus = daily_halted ? 'error' : drawdownPct >= 4 ? 'warn' : 'ok'

  const balanceStatus = usdt_balance < 1.1 ? 'error' : usdt_balance < 5 ? 'warn' : 'ok'
  const tradeStatus = trade_opened_today ? 'warn' : daily_halted ? 'error' : 'ok'
  const tradeLabel = trade_opened_today ? 'Taken' : daily_halted ? 'Halted' : 'Available'

  const PROTECTIONS = [
    { label: '$1.00 max trade size', active: true },
    { label: 'Hard stop-loss', active: true },
    { label: 'ATR trailing stop', active: true },
    { label: '5% daily drawdown cap', active: true },
    { label: '1 trade per day max', active: true },
    { label: '72h hold timeout', active: true },
  ]

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Risk Center</h3>
        {dry_run && (
          <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700/50 px-2 py-0.5 rounded-full">
            PAPER
          </span>
        )}
      </div>
      <div className="px-4 py-1">
        <RiskRow
          label="Balance"
          value={`$${usdt_balance.toFixed(2)}`}
          status={balanceStatus}
          detail={balanceStatus === 'error' ? 'Too low to trade ($1.10 min)' : null}
        />
        <RiskRow
          label="Daily Drawdown"
          value={`${drawdownPct.toFixed(2)}% / 5%`}
          status={drawdownStatus}
          detail={daily_halted ? 'Limit reached — bot halted' : null}
        />
        <RiskRow
          label="Today's Trade"
          value={tradeLabel}
          status={tradeStatus}
          detail={trade_open ? 'Position currently open' : null}
        />
        <RiskRow
          label="Exposure"
          value={trade_open ? '$1.00' : '$0.00'}
          status={trade_open ? 'warn' : 'ok'}
        />
      </div>
      <div className="px-4 py-3 border-t border-gray-800">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Protections Active</p>
        <div className="grid grid-cols-2 gap-1">
          {PROTECTIONS.map((p) => (
            <div key={p.label} className="flex items-center gap-1.5">
              <span className="text-emerald-400 text-xs">✓</span>
              <span className="text-xs text-gray-500">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
