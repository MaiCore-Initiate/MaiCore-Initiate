import { useState, useEffect, useRef } from 'react'
import type { SystemResources } from '../types'

export function useSystemResources(): SystemResources | null {
  const [data, setData] = useState<SystemResources | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function connect() {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'process_resources' }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'system_resources' && msg.data) {
            setData(msg.data)
          }
        } catch {}
      }

      ws.onclose = () => {
        reconnectTimer.current = setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      clearTimeout(reconnectTimer.current!)
      wsRef.current?.close()
    }
  }, [])

  return data
}
