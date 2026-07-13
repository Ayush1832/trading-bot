import { useEffect, useRef } from 'react'
import useStore from '../store/useStore.js'
import { getApiKey } from '../lib/apiKey.js'
import api from './useApi.js'

// If the frontend and backend are on different origins in production, set
// VITE_WS_BASE_URL to the backend's WebSocket URL, e.g. wss://bot.example.com/ws
function wsUrl() {
  const configured = import.meta.env.VITE_WS_BASE_URL
  const base = configured || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  return `${base}?api_key=${encodeURIComponent(getApiKey())}`
}

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
    // WS only pushes bot_state/scanner_update from inside the bot's scan
    // loop, so panels stay empty until the bot is started. Hydrate once via
    // REST on mount so the dashboard shows current status immediately.
    api.get('/bot/status').then((r) => setBotState(r.data)).catch(() => {})

    function connect() {
      if (wsRef.current?.readyState === WebSocket.OPEN) return

      const ws = new WebSocket(wsUrl())
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
