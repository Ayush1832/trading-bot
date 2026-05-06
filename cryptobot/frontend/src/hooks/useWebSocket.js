import { useEffect, useRef } from 'react'
import useStore from '../store/useStore.js'

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef(null)
  const setBotState = useStore((s) => s.setBotState)
  const addLog = useStore((s) => s.addLog)
  const setCandles = useStore((s) => s.setCandles)
  const setTslPulse = useStore((s) => s.setTslPulse)

  const setScanner = useStore((s) => s.setScanner)

  useEffect(() => {
    let reconnectTimer = null

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          switch (msg.type) {
            case 'bot_state':
              setBotState(msg.data)
              break
            case 'log_entry':
              addLog(msg.data)
              break
            case 'candle_update':
              setCandles(msg.data.candles, msg.data.indicators)
              break
            case 'tsl_updated':
              setTslPulse(true)
              setTimeout(() => setTslPulse(false), 2000)
              break
            case 'scanner_update':
              setScanner(msg.data)
              break
          }
        } catch {}
      }

      let pingInterval = null

      ws.onopen = () => {
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])
}
