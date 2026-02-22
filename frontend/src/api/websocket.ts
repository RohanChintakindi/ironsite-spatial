import type { WsMessage } from './types'

export type WsHandler = (msg: WsMessage) => void

export function connectWs(runId: string, onMessage: WsHandler): WebSocket {
  const apiUrl = import.meta.env.VITE_API_URL?.trim() || window.location.origin
  const wsUrl = apiUrl.replace(/^http/, 'ws').replace(/\/+$/, '') + `/ws/${runId}`
  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log(`[WS] Connected to run ${runId}`)
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as WsMessage
      onMessage(data)
    } catch (e) {
      console.warn('[WS] Failed to parse message:', event.data)
    }
  }

  ws.onerror = (err) => {
    console.error('[WS] Error:', err)
  }

  ws.onclose = (event) => {
    console.log(`[WS] Closed (code=${event.code})`)
    // Auto-reconnect after 2s if not a clean close
    if (event.code !== 1000) {
      setTimeout(() => {
        console.log('[WS] Reconnecting...')
        connectWs(runId, onMessage)
      }, 2000)
    }
  }

  return ws
}
