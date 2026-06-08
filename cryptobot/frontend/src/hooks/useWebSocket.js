import { useEffect, useRef } from 'react'
import useStore from '../store/useStore.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const pingRef = useRef(null)

  const setBotState = useStore((s) => s.setBotState)
  const addLog = useStore((s) => s.addLog)
  const setCandles = useStore((s) => s.setCandles)
  const setTslPulse = useStore((s) => s.setTslPulse)
  const setScanner = useStore((s) => s.setScanner)
  const setWsConnected = useStore((s) => s.setWsConnected)

  useEffect(() => {
    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          switch (msg.type) {
            case 'bot_state':    setBotState(msg.data); break
            case 'log_entry':   addLog(msg.data); break
            case 'candle_update': setCandles(msg.data.candles, msg.data.indicators); break
            case 'tsl_updated':
              setTslPulse(true)
              setTimeout(() => setTslPulse(false), 2000)
              break
            case 'scanner_update': setScanner(msg.data); break
            case 'pong': break  // heartbeat ack — no-op
            default: break
          }
        } catch {}
      }

      ws.onerror = () => {
        setWsConnected(false)
      }

      ws.onclose = () => {
        setWsConnected(false)
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
        reconnectRef.current = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (pingRef.current) clearInterval(pingRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])
}
