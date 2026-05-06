import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import useStore from '../store/useStore.js'
import api from '../hooks/useApi.js'

export default function CandleChart({ symbol }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})
  const botState = useStore((s) => s.botState)
  const displaySymbol = symbol || 'BTC/USDT'

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#111827' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 320,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    // EMA20 — blue, faster trend
    const ema20Series = chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 1,
      title: 'EMA20',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    // EMA50 — orange, slower trend
    const ema50Series = chart.addLineSeries({
      color: '#f97316',
      lineWidth: 1,
      title: 'EMA50',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const bbHighSeries = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'BB Upper',
    })

    const bbLowSeries = chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'BB Lower',
    })

    seriesRef.current = { candleSeries, ema20Series, ema50Series, bbHighSeries, bbLowSeries, chart }
    chartRef.current = chart

    const load = () => {
      api.get('/candles', { params: { symbol: displaySymbol, timeframe: '1h' } }).then((r) => {
        const { candles, ema20, ema50, bb_high, bb_low } = r.data
        if (!candles?.length) return

        candleSeries.setData(candles)

        if (ema20?.length)   ema20Series.setData(ema20)
        if (ema50?.length)   ema50Series.setData(ema50)
        if (bb_high?.length) bbHighSeries.setData(bb_high)
        if (bb_low?.length)  bbLowSeries.setData(bb_low)

        chart.timeScale().fitContent()
      }).catch(() => {})
    }

    load()
    const interval = setInterval(load, 60000)  // refresh every 60s (1H candle = 3600s)

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // Update entry marker when trade state changes
  useEffect(() => {
    const { candleSeries, chart } = seriesRef.current
    if (!candleSeries || !chart) return

    if (botState.entry_price && botState.entry_time) {
      candleSeries.setMarkers([{
        time: Math.floor(botState.entry_time),
        position: 'belowBar',
        color: '#22c55e',
        shape: 'arrowUp',
        text: `Entry $${botState.entry_price?.toFixed(2)}`,
      }])
    } else {
      candleSeries.setMarkers([])
    }
  }, [botState.entry_price, botState.entry_time])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">{displaySymbol} — 1H</h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-blue-400 inline-block rounded" />
            EMA20
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-orange-400 inline-block rounded" />
            EMA50
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-amber-400 inline-block rounded border-dashed" />
            BB
          </span>
          {botState.trade_open && (
            <span className="flex items-center gap-1.5 text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
              Trade Open
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef} />
      {botState.trade_open && (
        <div className="px-4 py-2 border-t border-gray-800 flex gap-6 text-xs font-mono">
          <span className="text-green-400">Entry: ${botState.entry_price?.toFixed(2)}</span>
          <span className="text-red-400">TSL: ${botState.trailing_sl?.toFixed(2)}</span>
          <span className="text-blue-400">TP: ${botState.take_profit_price?.toFixed(2)}</span>
        </div>
      )}
    </div>
  )
}
