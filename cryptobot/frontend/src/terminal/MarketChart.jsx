import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import useStore from '../store/useStore.js'
import api from '../hooks/useApi.js'
import { Chip, fmtPx } from '../ui/kit.jsx'

const TF = ['1h', '4h', '1d']
const FALLBACK_SYMBOLS = ['ETH/USDT', 'SOL/USDT', 'AVAX/USDT', 'BTC/USDT']

const THEME = {
  bg: '#0b0d12',
  grid: '#11141c',
  border: '#1b2030',
  text: '#5e6778',
  up: '#19c685',
  down: '#f0445c',
  ema20: '#7aa2ff',
  ema50: '#e7a13d',
  bb: '#3b4254',
}

export default function MarketChart() {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})
  const priceLinesRef = useRef({})

  const botState = useStore((s) => s.botState)
  const scanner = useStore((s) => s.scanner)
  const selectedSymbol = useStore((s) => s.selectedSymbol)
  const setSelectedSymbol = useStore((s) => s.setSelectedSymbol)
  const [tf, setTf] = useState('1h')
  const [lastPrice, setLastPrice] = useState(null)

  const watchlist = Object.keys(scanner).length ? Object.keys(scanner) : FALLBACK_SYMBOLS
  // Priority: open position symbol > user pin > first watchlist entry
  const symbol = botState.trade_open && botState.current_symbol
    ? botState.current_symbol
    : selectedSymbol || watchlist[0]

  /* Chart init — sized by ResizeObserver so it always fills the panel */
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    const chart = createChart(el, {
      layout: { background: { color: THEME.bg }, textColor: THEME.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 },
      grid: { vertLines: { color: THEME.grid }, horzLines: { color: THEME.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#2b3349', labelBackgroundColor: '#1a1f2c' },
        horzLine: { color: '#2b3349', labelBackgroundColor: '#1a1f2c' },
      },
      rightPriceScale: { borderColor: THEME.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: THEME.border, timeVisible: true, secondsVisible: false },
      width: el.clientWidth,
      height: el.clientHeight || 380,
    })

    const candles = chart.addCandlestickSeries({
      upColor: THEME.up, downColor: THEME.down,
      borderVisible: false,
      wickUpColor: THEME.up, wickDownColor: THEME.down,
    })
    const ema20 = chart.addLineSeries({ color: THEME.ema20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    const ema50 = chart.addLineSeries({ color: THEME.ema50, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    const bbHigh = chart.addLineSeries({ color: THEME.bb, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    const bbLow = chart.addLineSeries({ color: THEME.bb, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })

    seriesRef.current = { candles, ema20, ema50, bbHigh, bbLow }
    chartRef.current = chart

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight })
      }
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  /* Data load */
  useEffect(() => {
    const { candles, ema20, ema50, bbHigh, bbLow } = seriesRef.current
    if (!candles) return

    let cancelled = false
    const load = () => {
      api.get('/candles', { params: { symbol, timeframe: tf } }).then((r) => {
        if (cancelled) return
        const d = r.data
        if (!d.candles?.length) return
        candles.setData(d.candles)
        ema20.setData(d.ema20 || [])
        ema50.setData(d.ema50 || [])
        bbHigh.setData(d.bb_high || [])
        bbLow.setData(d.bb_low || [])
        setLastPrice(d.candles[d.candles.length - 1]?.close ?? null)
        chartRef.current?.timeScale().fitContent()
      }).catch(() => {})
    }

    load()
    const t = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(t) }
  }, [symbol, tf])

  /* Position overlay — SL/TP/TSL lines + entry marker */
  useEffect(() => {
    const { candles } = seriesRef.current
    if (!candles) return

    Object.values(priceLinesRef.current).forEach((l) => { try { candles.removePriceLine(l) } catch {} })
    priceLinesRef.current = {}

    const positionOnThisChart = botState.trade_open && botState.current_symbol === symbol
    if (!positionOnThisChart) {
      try { candles.setMarkers([]) } catch {}
      return
    }

    if (botState.entry_price && botState.entry_time) {
      try {
        candles.setMarkers([{
          time: Math.floor(botState.entry_time),
          position: 'belowBar', color: THEME.up, shape: 'arrowUp',
          text: `ENTRY ${fmtPx(botState.entry_price)}`,
        }])
      } catch {}
    }

    const mkLine = (key, price, color, title) => {
      if (!price) return
      priceLinesRef.current[key] = candles.createPriceLine({
        price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title,
      })
    }

    mkLine('sl', botState.sl_price, THEME.down, botState.half_exited ? 'BE-SL' : 'SL')
    if (botState.trailing_sl && botState.trailing_sl !== botState.sl_price) {
      mkLine('tsl', botState.trailing_sl, '#e7a13d', 'TSL')
    }
    if (!botState.half_exited) mkLine('tp1', botState.tp1_price, THEME.up, 'TP1')
    mkLine('tp2', botState.tp2_price, '#7aa2ff', 'TP2')
  }, [
    symbol, botState.trade_open, botState.current_symbol, botState.entry_price, botState.entry_time,
    botState.sl_price, botState.trailing_sl, botState.tp1_price, botState.tp2_price, botState.half_exited,
  ])

  const pinned = botState.trade_open && botState.current_symbol

  return (
    <section className="panel overflow-hidden flex flex-col h-full">
      {/* Header: symbol tabs + TF + legend */}
      <header className="flex items-center px-3 h-10 border-b border-line-soft gap-1 shrink-0">
        <div className="flex items-center gap-0.5">
          {watchlist.map((s) => {
            const active = s === symbol
            const hasSignal = scanner[s]?.signal
            return (
              <button
                key={s}
                onClick={() => !pinned && setSelectedSymbol(s)}
                disabled={!!pinned && s !== symbol}
                className={`relative px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors duration-150 ${
                  active ? 'bg-ink-750 text-tx' : 'text-tx-dim hover:text-tx-2 hover:bg-ink-800'
                } disabled:opacity-30`}
              >
                {s.replace('/USDT', '')}
                {hasSignal && <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-up animate-pulse-soft" />}
              </button>
            )
          })}
        </div>

        {pinned && (
          <Chip tone="up" className="ml-1">POSITION</Chip>
        )}

        <div className="flex-1" />

        {lastPrice != null && (
          <span className="font-mono text-sm font-semibold text-tx mr-3">{fmtPx(lastPrice)}</span>
        )}

        <div className="flex items-center gap-0.5 mr-3">
          {TF.map((t) => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-2 py-0.5 rounded text-2xs font-mono font-semibold transition-colors duration-150 ${
                tf === t ? 'bg-accent/15 text-accent' : 'text-tx-dim hover:text-tx-2'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-3 text-3xs text-tx-faint font-medium">
          <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-accent inline-block" />EMA20</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-px bg-warn inline-block" />EMA50</span>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 min-h-0" />
    </section>
  )
}
