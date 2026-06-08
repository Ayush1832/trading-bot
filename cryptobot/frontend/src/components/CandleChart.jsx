import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode, LineStyle, PriceLineSource } from 'lightweight-charts'
import useStore from '../store/useStore.js'
import api from '../hooks/useApi.js'

const TF_OPTIONS = ['1h', '4h', '1d']

export default function CandleChart({ symbol }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef({})
  const priceLinesRef = useRef({})
  const botState = useStore((s) => s.botState)
  const [tf, setTf] = useState('1h')
  const displaySymbol = symbol || 'ETH/USDT'

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0d1117' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#161b22' },
        horzLines: { color: '#161b22' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#21262d', scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: { borderColor: '#21262d', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 360,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a641',
      downColor: '#da3633',
      borderVisible: false,
      wickUpColor: '#26a641',
      wickDownColor: '#da3633',
    })

    const ema20Series = chart.addLineSeries({
      color: '#388bfd',
      lineWidth: 1,
      title: 'EMA20',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const ema50Series = chart.addLineSeries({
      color: '#f78166',
      lineWidth: 1,
      title: 'EMA50',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const bbHighSeries = chart.addLineSeries({
      color: '#d29922',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const bbLowSeries = chart.addLineSeries({
      color: '#d29922',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    seriesRef.current = { candleSeries, ema20Series, ema50Series, bbHighSeries, bbLowSeries }
    chartRef.current = chart

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = {}
    }
  }, [])

  // Load candles when symbol or timeframe changes
  useEffect(() => {
    const { candleSeries, ema20Series, ema50Series, bbHighSeries, bbLowSeries } = seriesRef.current
    if (!candleSeries) return

    const load = () => {
      api.get('/candles', { params: { symbol: displaySymbol, timeframe: tf } }).then((r) => {
        const { candles, ema20, ema50, bb_high, bb_low } = r.data
        if (!candles?.length) return
        candleSeries.setData(candles)
        if (ema20?.length)   ema20Series.setData(ema20)
        if (ema50?.length)   ema50Series.setData(ema50)
        if (bb_high?.length) bbHighSeries.setData(bb_high)
        if (bb_low?.length)  bbLowSeries.setData(bb_low)
        chartRef.current?.timeScale().fitContent()
      }).catch(() => {})
    }

    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [displaySymbol, tf])

  // Update price lines + entry marker when trade state changes
  useEffect(() => {
    const { candleSeries } = seriesRef.current
    if (!candleSeries) return

    // Remove old price lines
    Object.values(priceLinesRef.current).forEach(line => {
      try { candleSeries.removePriceLine(line) } catch {}
    })
    priceLinesRef.current = {}

    if (botState.trade_open) {
      // Entry marker
      if (botState.entry_price && botState.entry_time) {
        try {
          candleSeries.setMarkers([{
            time: Math.floor(botState.entry_time),
            position: 'belowBar',
            color: '#26a641',
            shape: 'arrowUp',
            text: `Entry $${botState.entry_price.toFixed(4)}`,
          }])
        } catch {}
      }

      // SL price line (red)
      if (botState.sl_price) {
        priceLinesRef.current.sl = candleSeries.createPriceLine({
          price: botState.sl_price,
          color: '#da3633',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: botState.half_exited ? 'Breakeven SL' : 'Hard SL',
        })
      }

      // TSL price line (orange)
      if (botState.trailing_sl && botState.trailing_sl !== botState.sl_price) {
        priceLinesRef.current.tsl = candleSeries.createPriceLine({
          price: botState.trailing_sl,
          color: '#e3b341',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TSL',
        })
      }

      // TP1 price line (emerald) — fixed: use tp1_price not take_profit_price
      if (botState.tp1_price && !botState.half_exited) {
        priceLinesRef.current.tp1 = candleSeries.createPriceLine({
          price: botState.tp1_price,
          color: '#26a641',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP1',
        })
      }

      // TP2 price line (blue)
      if (botState.tp2_price) {
        priceLinesRef.current.tp2 = candleSeries.createPriceLine({
          price: botState.tp2_price,
          color: '#388bfd',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP2',
        })
      }
    } else {
      // Clear markers when no trade
      try { candleSeries.setMarkers([]) } catch {}
    }
  }, [
    botState.trade_open, botState.entry_price, botState.entry_time,
    botState.sl_price, botState.trailing_sl, botState.tp1_price,
    botState.tp2_price, botState.half_exited,
  ])

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-300">{displaySymbol}</h3>
          <div className="flex gap-1">
            {TF_OPTIONS.map(t => (
              <button key={t} onClick={() => setTf(t)}
                className={`text-xs px-2 py-0.5 rounded font-mono transition-colors ${
                  tf === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-400 inline-block" />EMA20</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" />EMA50</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 inline-block border-dashed" />BB</span>
          {botState.trade_open && (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Open
            </span>
          )}
        </div>
      </div>
      <div ref={containerRef} />
      {botState.trade_open && (
        <div className="px-4 py-2 border-t border-gray-800 flex flex-wrap gap-4 text-xs font-mono">
          <span className="text-gray-400">Entry <span className="text-white">${botState.entry_price?.toFixed(4)}</span></span>
          <span className="text-red-400">SL ${botState.sl_price?.toFixed(4)}</span>
          {botState.trailing_sl && <span className="text-amber-400">TSL ${botState.trailing_sl?.toFixed(4)}</span>}
          {!botState.half_exited && botState.tp1_price && <span className="text-emerald-400">TP1 ${botState.tp1_price?.toFixed(4)}</span>}
          {botState.tp2_price && <span className="text-blue-400">TP2 ${botState.tp2_price?.toFixed(4)}</span>}
        </div>
      )}
    </div>
  )
}
