import useStore from '../store/useStore.js'
import { Panel, GradeBadge, Meter, Empty, fmtPx } from '../ui/kit.jsx'

/* Humanize machine reason codes coming from strategy.py */
const REASONS = {
  ok: null,
  insufficient_data: 'Insufficient candle history',
  ema200_nan: 'Weekly EMA200 still warming up',
  below_ema200: 'Price is below the weekly EMA200',
  no_higher_highs: 'Weekly structure lacks higher highs',
  ema_nan: 'Daily EMAs still warming up',
  invalid_swing: 'No valid daily swing for Fibonacci anchor',
  no_fib_zone: 'Price has not pulled back into the Fib zone',
  no_ema_uptrend: 'Daily EMAs are not stacked bullishly',
  window_too_small: 'Not enough 4H candles in lookback window',
  no_minima: 'No RSI swing lows found in window',
  rsi_nan: 'RSI still warming up',
  no_bos: 'Waiting for a 1H close above structure',
}

function humanize(code) {
  if (!code || code === 'ok') return null
  return REASONS[code] || code.replaceAll('_', ' ')
}

/* The 4 required gates + 1 advisory, in evaluation order */
const GATES = [
  { key: 'weekly_trend', flag: 'weekly_ok', tf: '1W', label: 'Macro trend', desc: 'Above EMA200, higher highs', weight: 25, required: true },
  { key: 'daily_structure', flag: 'daily_ok', tf: '1D', label: 'Fib pullback', desc: '38.2–61.8% retracement zone', weight: 25, required: true },
  { key: 'h4_divergence', flag: 'h4_div_ok', tf: '4H', label: 'RSI divergence', desc: 'Price LL + RSI HL reversal', weight: 25, required: true },
  { key: 'h1_bos', flag: 'h1_bos_ok', tf: '1H', label: 'Break of structure', desc: 'Close above swing high', weight: 15, required: true },
  { key: 'h4_momentum', flag: 'h4_mom_ok', tf: '4H', label: 'Momentum', desc: 'MACD cross + seller exhaustion', weight: 10, required: false },
]

const TF_TONE = {
  '1W': 'text-purple-300 bg-purple-400/10',
  '1D': 'text-accent bg-accent/10',
  '4H': 'text-warn bg-warn/10',
  '1H': 'text-up bg-up/10',
}

function strength(s) {
  if (!s) return 0
  let score = 0
  if (s.weekly_ok) score += 25
  if (s.daily_ok) score += 25
  if (s.h4_div_ok) score += 25
  if (s.h1_bos_ok) score += 15
  const mom = s.conditions?.h4_momentum || {}
  if (mom.macd_cross) score += 5
  if (mom.weak_sellers) score += 5
  return score
}

function GateRow({ gate, scan }) {
  const passed = scan[gate.flag] ?? false
  const cond = scan.conditions?.[gate.key] || {}
  const reason = humanize(cond.reason)

  // Momentum is advisory: show its sub-checks instead of pass/fail blocking
  const isMomentum = gate.key === 'h4_momentum'
  const momDetail = isMomentum
    ? [cond.macd_cross && 'MACD ✓', cond.weak_sellers && 'sellers exhausted ✓'].filter(Boolean).join(' · ')
    : null

  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-line-soft last:border-0">
      <span className={`mt-0.5 text-3xs font-mono font-bold px-1 py-px rounded ${TF_TONE[gate.tf]}`}>{gate.tf}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-medium ${passed ? 'text-tx' : 'text-tx-dim'}`}>
            {gate.label}
            {!gate.required && <span className="text-tx-faint ml-1.5 text-3xs">(grade only)</span>}
          </span>
          <span className={`text-xs font-bold shrink-0 ${passed ? 'text-up' : 'text-tx-faint'}`}>
            {passed ? '✓' : '·'}
          </span>
        </div>
        <p className="text-3xs text-tx-faint mt-0.5 truncate">
          {isMomentum && momDetail ? momDetail : (!passed && reason) ? reason : gate.desc}
        </p>
      </div>
    </div>
  )
}

export default function StrategyIntel() {
  const scanner = useStore((s) => s.scanner)
  const botState = useStore((s) => s.botState)
  const selectedSymbol = useStore((s) => s.selectedSymbol)

  const symbols = Object.keys(scanner)
  const symbol = botState.trade_open && botState.current_symbol
    ? botState.current_symbol
    : selectedSymbol || symbols[0]
  const scan = scanner[symbol]

  if (!botState.running) {
    return (
      <Panel title="Strategy Intelligence">
        <Empty>Engine stopped — start it to begin scanning</Empty>
      </Panel>
    )
  }

  if (!scan) {
    return (
      <Panel title="Strategy Intelligence">
        <Empty>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 border-[1.5px] border-tx-dim border-t-transparent rounded-full animate-spin" />
            First scan in progress…
          </span>
        </Empty>
      </Panel>
    )
  }

  const score = strength(scan)
  const blocker = GATES.find((g) => g.required && !scan[g.flag])
  const tone = scan.signal ? 'up' : score >= 50 ? 'warn' : 'idle'

  return (
    <Panel
      title="Strategy Intelligence"
      right={
        <div className="flex items-center gap-2">
          <span className="text-2xs font-mono font-semibold text-tx-2">{symbol?.replace('/USDT', '')}</span>
          <GradeBadge grade={scan.grade} />
        </div>
      }
      flush
    >
      {/* Signal strength */}
      <div className="px-4 pt-3.5 pb-3 border-b border-line-soft">
        <div className="flex items-baseline justify-between mb-2">
          <span className="microlabel">Signal strength</span>
          <span className={`font-mono text-lg font-bold leading-none ${
            scan.signal ? 'text-up' : score >= 50 ? 'text-warn' : 'text-tx-2'
          }`}>
            {score}%
          </span>
        </div>
        <Meter value={score} max={100} tone={tone === 'idle' ? 'accent' : tone} />
      </div>

      {/* Condition gates */}
      <div className="px-4 py-1">
        {GATES.map((g) => <GateRow key={g.key} gate={g} scan={scan} />)}
      </div>

      {/* Verdict line */}
      <div className={`px-4 py-2.5 border-t ${
        scan.signal ? 'border-up/20 bg-up/5' : 'border-line-soft bg-ink-850/60'
      }`}>
        {scan.signal ? (
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold tracking-wider text-up">SIGNAL ACTIVE</span>
            <span className="text-2xs font-mono text-tx-2">
              R:R {scan.rr_ratio?.toFixed(1)}:1 · TP1 {fmtPx(scan.tp1_price)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-warn animate-pulse-soft shrink-0" />
            <span className="text-2xs text-tx-2 truncate">
              <span className="font-semibold text-tx-dim">WAITING:</span>{' '}
              {blocker ? humanize(scan.conditions?.[blocker.key]?.reason) || blocker.desc : 'Final validation'}
            </span>
          </div>
        )}
      </div>

      {/* Context values */}
      <div className="px-4 py-2.5 border-t border-line-soft grid grid-cols-3 gap-2">
        <div>
          <p className="microlabel">Fib zone</p>
          <p className="text-2xs font-mono text-tx-2 mt-0.5">{scan.fib_zone || scan.nearest_fib || '—'}</p>
        </div>
        <div>
          <p className="microlabel">RSI @ low</p>
          <p className="text-2xs font-mono text-tx-2 mt-0.5">{scan.rsi_at_low != null ? scan.rsi_at_low.toFixed(1) : '—'}</p>
        </div>
        <div>
          <p className="microlabel">Div strength</p>
          <p className="text-2xs font-mono text-tx-2 mt-0.5">{scan.divergence_strength > 0 ? `+${scan.divergence_strength.toFixed(1)}` : '—'}</p>
        </div>
      </div>
    </Panel>
  )
}
