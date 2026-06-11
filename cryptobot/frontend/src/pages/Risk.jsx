import useStore from '../store/useStore.js'
import { Panel, Chip, ArcGauge, Meter, Stat, fmtUsd, fmtSigned } from '../ui/kit.jsx'

const PROTECTIONS = [
  { name: 'Position cap', rule: '$1.00 hard maximum per trade', always: true },
  { name: 'Hard stop-loss', rule: 'Structural stop below entry on every position', always: true },
  { name: 'ATR trailing stop', rule: '1H ATR × multiplier, ratchets up only', always: true },
  { name: 'Breakeven lock', rule: 'Stop moves to entry after TP1 fills', always: true },
  { name: 'Daily drawdown halt', rule: 'Trading stops at −5% on the day', always: true },
  { name: 'Trade frequency gate', rule: 'Maximum 1 entry per UTC day', always: true },
  { name: 'Hold timeout', rule: 'Forced exit after 72h in position', always: true },
  { name: 'Signal quality floor', rule: 'Minimum 3:1 reward-to-risk to enter', always: true },
]

function VerdictBanner({ s, drawdownPct }) {
  const verdict = s.daily_halted
    ? { tone: 'down', title: 'TRADING HALTED', body: 'Daily drawdown cap was hit. The engine stands down until 00:00 UTC.' }
    : drawdownPct >= 4
    ? { tone: 'warn', title: 'APPROACHING LIMIT', body: `Drawdown at ${drawdownPct.toFixed(1)}% of balance — halt triggers at 5%.` }
    : s.trade_open
    ? { tone: 'accent', title: 'CAPITAL DEPLOYED', body: 'One position open, protected by hard stop and trailing stop.' }
    : { tone: 'up', title: 'ALL CLEAR', body: 'No exposure. All protection systems armed.' }

  const toneBg = {
    up: 'border-up/25 bg-up/5',
    down: 'border-down/25 bg-down/5',
    warn: 'border-warn/25 bg-warn/5',
    accent: 'border-accent/25 bg-accent/5',
  }[verdict.tone]

  return (
    <div className={`rounded-panel border px-5 py-4 flex items-center gap-4 ${toneBg}`}>
      <Chip tone={verdict.tone} pulse={verdict.tone !== 'up'}>{verdict.title}</Chip>
      <p className="text-sm text-tx-2">{verdict.body}</p>
    </div>
  )
}

export default function Risk() {
  const s = useStore((st) => st.botState)
  const {
    usdt_balance = 0, pnl_today_usdt = 0, daily_halted = false,
    trade_open = false, trade_opened_today = false, dry_run = false,
    qty_remaining, current_price,
  } = s

  const drawdownPct = usdt_balance > 0 ? Math.max(0, (-pnl_today_usdt / Math.max(usdt_balance, 0.01)) * 100) : 0
  const exposure = trade_open && qty_remaining && current_price ? qty_remaining * current_price : 0
  const exposurePct = usdt_balance > 0 ? (exposure / usdt_balance) * 100 : 0

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-4 animate-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-tx">Risk Command Center</h1>
          <p className="text-2xs text-tx-dim mt-0.5">Every limit, guard, and exposure — in one place</p>
        </div>
        {dry_run && <Chip tone="warn">PAPER — NO REAL CAPITAL</Chip>}
      </div>

      <VerdictBanner s={s} drawdownPct={drawdownPct} />

      {/* Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Panel title="Daily drawdown" bodyClass="flex flex-col items-center justify-center py-2">
          <ArcGauge
            value={drawdownPct} max={5}
            display={`${drawdownPct.toFixed(1)}%`}
            label="of 5% halt"
            tone={daily_halted ? 'down' : drawdownPct >= 4 ? 'warn' : drawdownPct > 2 ? 'warn' : 'up'}
          />
          <p className="text-2xs font-mono text-tx-dim">
            {fmtSigned(pnl_today_usdt)} today on {fmtUsd(usdt_balance)}
          </p>
        </Panel>

        <Panel title="Exposure" bodyClass="flex flex-col items-center justify-center py-2">
          <ArcGauge
            value={Math.min(exposurePct, 100)} max={100}
            display={fmtUsd(exposure)}
            label={trade_open ? `${exposurePct.toFixed(0)}% of equity` : 'no position'}
            tone={trade_open ? 'accent' : 'up'}
          />
          <p className="text-2xs font-mono text-tx-dim">
            cap $1.00 per position
          </p>
        </Panel>

        <Panel title="Trade frequency" bodyClass="flex flex-col items-center justify-center py-2">
          <ArcGauge
            value={trade_opened_today ? 1 : 0} max={1}
            display={trade_opened_today ? '1/1' : '0/1'}
            label={trade_opened_today ? 'slot used' : 'slot open'}
            tone={trade_opened_today ? 'warn' : 'up'}
          />
          <p className="text-2xs font-mono text-tx-dim">resets 00:00 UTC</p>
        </Panel>
      </div>

      {/* Capital snapshot */}
      <Panel title="Capital">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Stat label="Equity" value={fmtUsd(usdt_balance)} />
          <Stat
            label="At risk now"
            value={fmtUsd(exposure)}
            tone={trade_open ? 'warn' : undefined}
            sub={trade_open ? 'protected by stop' : 'fully in reserve'}
          />
          <Stat
            label="Today's swing"
            value={fmtSigned(pnl_today_usdt)}
            tone={pnl_today_usdt > 0 ? 'up' : pnl_today_usdt < 0 ? 'down' : undefined}
          />
          <Stat
            label="Halt distance"
            value={daily_halted ? 'HIT' : `${Math.max(0, 5 - drawdownPct).toFixed(1)}%`}
            tone={daily_halted ? 'down' : undefined}
            sub="drawdown headroom"
          />
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-3xs font-mono text-tx-faint mb-1.5">
            <span>DRAWDOWN PROGRESS</span><span>5% HALT</span>
          </div>
          <Meter value={drawdownPct} max={5} tone={daily_halted ? 'down' : drawdownPct >= 4 ? 'warn' : 'up'} className="h-1.5" />
        </div>
      </Panel>

      {/* Protection inventory */}
      <Panel title="Protection systems" flush>
        <div className="grid grid-cols-1 md:grid-cols-2">
          {PROTECTIONS.map((p, i) => (
            <div
              key={p.name}
              className={`flex items-start gap-3 px-4 py-3 border-line-soft ${i % 2 === 0 ? 'md:border-r' : ''} ${i < PROTECTIONS.length - 2 ? 'border-b' : i === PROTECTIONS.length - 2 ? 'border-b md:border-b-0' : ''}`}
            >
              <span className="mt-0.5 w-4 h-4 rounded-full bg-up/10 border border-up/30 flex items-center justify-center text-up text-3xs font-bold shrink-0">✓</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-tx">{p.name}</p>
                <p className="text-2xs text-tx-dim mt-0.5">{p.rule}</p>
              </div>
              <span className="ml-auto text-3xs font-mono text-up/70 shrink-0 mt-0.5">ARMED</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
