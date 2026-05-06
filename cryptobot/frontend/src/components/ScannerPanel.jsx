import { useEffect, useState } from 'react'
import useStore from '../store/useStore.js'
import api from '../hooks/useApi.js'

// 5 conditions with timeframe badges
const CONDITIONS = [
  { key: 'weekly_ok',  label: 'EMA200',    tf: '1W', title: 'Price above weekly EMA200 + higher highs' },
  { key: 'daily_ok',   label: 'Fib Zone',  tf: '1D', title: 'Price in 38.2%/50%/61.8% Fibonacci pullback zone' },
  { key: 'h4_div_ok',  label: 'Divergence',tf: '4H', title: 'RSI bullish divergence (price lower low, RSI higher low)' },
  { key: 'h4_mom_ok',  label: 'Momentum',  tf: '4H', title: 'MACD cross + weak sellers (advisory — determines grade only)' },
  { key: 'h1_bos_ok',  label: 'BOS',       tf: '1H', title: 'Break of Structure — close above swing high' },
]

const GRADE_COLOR = {
  'A+': 'text-green-300 bg-green-900/60 border-green-700',
  'A':  'text-blue-300  bg-blue-900/60  border-blue-700',
  'B':  'text-gray-300  bg-gray-800     border-gray-700',
}

function TfBadge({ tf }) {
  const colors = {
    '1W': 'bg-purple-900/60 text-purple-300',
    '1D': 'bg-blue-900/60   text-blue-300',
    '4H': 'bg-yellow-900/60 text-yellow-300',
    '1H': 'bg-green-900/60  text-green-300',
  }
  return (
    <span className={`text-xs px-1 py-0 rounded font-mono ${colors[tf] || 'bg-gray-800 text-gray-400'}`}>
      {tf}
    </span>
  )
}

function ConditionPill({ condition, value }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={condition.title}>
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${
        value ? 'bg-green-900/50 border-green-700 text-green-300' : 'bg-gray-800/80 border-gray-700 text-gray-600'
      }`}>
        <TfBadge tf={condition.tf} />
        <span>{value ? '✓' : '·'}</span>
      </div>
      <span className="text-gray-600 text-xs truncate leading-tight">{condition.label}</span>
    </div>
  )
}

function ConditionsRow({ data }) {
  return (
    <div className="grid grid-cols-5 gap-1 mt-2">
      {CONDITIONS.map((c) => (
        <ConditionPill key={c.key} condition={c} value={data[c.key] ?? false} />
      ))}
    </div>
  )
}

function SymbolCard({ data, isActive }) {
  if (!data) return null
  const { symbol, signal, grade, rr_ratio, price, rsi_at_low, fib_zone, nearest_fib,
          bos_level, divergence_strength, weekly_ema200, atr_1h, sl_price, tp1_price } = data

  const passCount = CONDITIONS.filter((c) => data[c.key]).length
  const isNear = passCount >= 4 && !signal   // 4/5 conditions = near signal

  const gradeBadge = grade ? (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${GRADE_COLOR[grade] || GRADE_COLOR['B']}`}>
      {grade}
    </span>
  ) : null

  return (
    <div className={`p-3 rounded-xl border transition-colors ${
      signal   ? 'border-green-500 bg-green-950/40 shadow-green-900/30 shadow-lg' :
      isNear   ? 'border-yellow-700/60 bg-yellow-950/20' :
      isActive ? 'border-indigo-700/60 bg-indigo-950/20' :
                 'border-gray-800 bg-gray-900/40'
    }`}>

      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-bold text-gray-200">{symbol.replace('/USDT', '')}</span>
          {isActive && (
            <span className="text-xs bg-indigo-700 text-indigo-100 px-1.5 py-0.5 rounded">IN TRADE</span>
          )}
          {signal && (
            <span className="text-xs bg-green-700 text-green-100 px-1.5 py-0.5 rounded animate-pulse">SIGNAL</span>
          )}
          {isNear && !signal && (
            <span className="text-xs bg-yellow-800 text-yellow-300 px-1.5 py-0.5 rounded">NEAR</span>
          )}
          {gradeBadge}
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
          {price && (
            <span>${price.toFixed(price > 1000 ? 2 : price > 10 ? 3 : 4)}</span>
          )}
          {rr_ratio > 0 && (
            <span className={`font-semibold ${rr_ratio >= 3 ? 'text-green-400' : 'text-gray-500'}`}>
              {rr_ratio.toFixed(1)}:1
            </span>
          )}
        </div>
      </div>

      {/* 5-condition pills */}
      <ConditionsRow data={data} />

      {/* Key values */}
      <div className="flex flex-wrap gap-2 mt-2 text-xs font-mono text-gray-500">
        {fib_zone && (
          <span className="text-yellow-400">Fib {fib_zone}</span>
        )}
        {!fib_zone && nearest_fib && (
          <span>Near {nearest_fib}</span>
        )}
        {rsi_at_low != null && (
          <span className={rsi_at_low < 40 ? 'text-green-400' : ''}>
            RSI {rsi_at_low.toFixed(1)}
          </span>
        )}
        {divergence_strength > 0 && (
          <span className="text-blue-400">Div +{divergence_strength.toFixed(1)}</span>
        )}
        {atr_1h != null && price != null && (
          <span>ATR {((atr_1h / price) * 100).toFixed(2)}%</span>
        )}
      </div>

      {/* Trade levels (only when signal fires) */}
      {signal && sl_price && tp1_price && (
        <div className="mt-2 pt-2 border-t border-gray-700/50 grid grid-cols-2 gap-1 text-xs font-mono">
          <span className="text-red-400">SL ${sl_price.toFixed(sl_price > 100 ? 2 : 4)}</span>
          <span className="text-green-400">TP1 ${tp1_price.toFixed(tp1_price > 100 ? 2 : 4)}</span>
        </div>
      )}
    </div>
  )
}

export default function ScannerPanel() {
  const scanner  = useStore((s) => s.scanner)
  const botState = useStore((s) => s.botState)
  const [meta, setMeta] = useState({ signals_today: 0 })

  useEffect(() => {
    api.get('/scanner').then((r) => {
      setMeta({ signals_today: r.data.signals_today || 0 })
    }).catch(() => {})
  }, [scanner])

  const entries = Object.values(scanner).sort((a, b) => {
    // Sort: signal first → near second → conditions count
    if (a.signal !== b.signal) return a.signal ? -1 : 1
    const aPass = CONDITIONS.filter((c) => a[c.key]).length
    const bPass = CONDITIONS.filter((c) => b[c.key]).length
    return bPass - aPass
  })

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-300">Swing Scanner — 1W/1D/4H/1H</h3>
          {botState.running && (
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          )}
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Signals today: <span className="text-green-400 font-mono">{meta.signals_today}</span></span>
          <span className="text-gray-600">Scan every 15 min</span>
        </div>
      </div>

      <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        {entries.length === 0 && (
          <p className="text-gray-600 text-sm col-span-3 py-4 text-center">
            {botState.running ? 'Running next scan...' : 'Start the bot to begin scanning'}
          </p>
        )}
        {entries.map((s) => (
          <SymbolCard
            key={s.symbol}
            data={s}
            isActive={botState.trade_open && botState.current_symbol === s.symbol}
          />
        ))}
      </div>

      {/* Condition legend */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {CONDITIONS.map((c) => (
          <div key={c.key} className="flex items-center gap-1 text-xs text-gray-600" title={c.title}>
            <TfBadge tf={c.tf} />
            <span>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
