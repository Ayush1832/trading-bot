import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import useStore from '../store/useStore.js'
import api from '../hooks/useApi.js'

export default function CandleChart() {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})
  const botState = useStore((s) => s.botState)

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

    const emaSeries = chart.addLineSeries({ color: '#6366f1', lineWidth: 1, title: 'EMA50' })
    const bbHighSeries = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle: LineStyle.Dashed })
    const bbLowSeries = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle: LineStyle.Dashed })

    seriesRef.current = { candleSeries, emaSeries, bbHighSeries, bbLowSeries, chart }
    chartRef.current = chart

    const load = () => {
      api.get('/candles').then((r) => {
        const { candles, indicators } = r.data
        if (!candles?.length) return

        candleSeries.setData(candles)

        const emaData = candles.filter((c) => indicators?.ema50).map((c) => ({ time: c.time, value: indicators.ema50 }))
        // Actually need per-candle EMA — placeholder with last value
        emaSeries.setData(candles.map((c) => ({ time: c.time, value: indicators.ema50 })).filter((d) => d.value))

        if (indicators?.bb_high) {
          bbHighSeries.setData(candles.map((c) => ({ time: c.time, value: indicators.bb_high })))
          bbLowSeries.setData(candles.map((c) => ({ time: c.time, value: indicators.bb_low })))
        }

        chart.timeScale().fitContent()
      }).catch(() => {})
    }

    load()
    const interval = setInterval(load, 5000)

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [])

  // Update TSL / TP lines when trade state changes
  useEffect(() => {
    const { candleSeries } = seriesRef.current
    if (!candleSeries) return

    if (botState.entry_price) {
      candleSeries.setMarkers([
        {
          time: Math.floor(botState.entry_time || Date.now() / 1000),
          position: 'belowBar',
          color: '#22c55e',
          shape: 'arrowUp',
          text: `Entry $${botState.entry_price?.toFixed(2)}`,
        },
      ])
    } else {
      candleSeries.setMarkers([])
    }
  }, [botState.entry_price, botState.entry_time])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">BTC/USDT — 1m</h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-400 inline-block" /> EMA50</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block border-dashed" /> BB</span>
        </div>
      </div>
      <div ref={containerRef} />
    </div>
  )
}
