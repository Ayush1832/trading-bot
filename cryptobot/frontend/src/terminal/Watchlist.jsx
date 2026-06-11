import useStore from '../store/useStore.js'
import { Panel, GradeBadge, Meter, Empty, fmtPx } from '../ui/kit.jsx'

const GATE_FLAGS = ['weekly_ok', 'daily_ok', 'h4_div_ok', 'h1_bos_ok']

function score(s) {
  let v = 0
  if (s.weekly_ok) v += 25
  if (s.daily_ok) v += 25
  if (s.h4_div_ok) v += 25
  if (s.h1_bos_ok) v += 15
  const mom = s.conditions?.h4_momentum || {}
  if (mom.macd_cross) v += 5
  if (mom.weak_sellers) v += 5
  return v
}

function Row({ s, active, inPosition, onSelect }) {
  const sc = score(s)
  const gates = GATE_FLAGS.filter((f) => s[f]).length
  const tone = s.signal ? 'up' : sc >= 50 ? 'warn' : 'accent'

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 rounded-md transition-colors duration-150 border ${
        active ? 'bg-ink-800 border-line-strong' : 'border-transparent hover:bg-ink-800/60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-bold text-tx">{s.symbol.replace('/USDT', '')}</span>
          {inPosition && <span className="text-3xs font-bold text-up">●</span>}
          {s.signal && <span className="text-3xs font-bold text-up tracking-wider animate-pulse-soft">SIGNAL</span>}
          <GradeBadge grade={s.grade} />
        </div>
        <span className="text-2xs font-mono text-tx-2 shrink-0">{fmtPx(s.price)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <Meter value={sc} max={100} tone={tone} className="flex-1" />
        <span className="text-3xs font-mono text-tx-faint w-7 text-right">{gates}/4</span>
      </div>
    </button>
  )
}

export default function Watchlist() {
  const scanner = useStore((s) => s.scanner)
  const botState = useStore((s) => s.botState)
  const setSelectedSymbol = useStore((s) => s.setSelectedSymbol)
  const selectedSymbol = useStore((s) => s.selectedSymbol)

  const items = Object.values(scanner).sort((a, b) => {
    if (a.signal !== b.signal) return a.signal ? -1 : 1
    return score(b) - score(a)
  })

  const activeSymbol = botState.trade_open && botState.current_symbol
    ? botState.current_symbol
    : selectedSymbol || items[0]?.symbol

  return (
    <Panel
      title="Watchlist"
      right={<span className="text-3xs font-mono text-tx-faint">15M SCAN CYCLE</span>}
      flush
      className="h-full"
    >
      <div className="p-1.5 space-y-0.5 overflow-y-auto h-full">
        {items.length === 0 ? (
          <Empty className="h-full">
            {botState.running ? 'Awaiting first scan…' : 'Engine stopped'}
          </Empty>
        ) : (
          items.map((s) => (
            <Row
              key={s.symbol}
              s={s}
              active={s.symbol === activeSymbol}
              inPosition={botState.trade_open && botState.current_symbol === s.symbol}
              onSelect={() => setSelectedSymbol(s.symbol)}
            />
          ))
        )}
      </div>
    </Panel>
  )
}
