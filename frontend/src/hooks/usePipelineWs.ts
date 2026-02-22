import { useEffect, useRef } from 'react'
import { connectWs } from '../api/websocket'
import { usePipelineStore, type StepName, STEP_ORDER } from '../store/pipeline'
import type { WsMessage } from '../api/types'

export function usePipelineWs() {
  const runId = usePipelineStore((s) => s.runId)
  const setConnected = usePipelineStore((s) => s.setConnected)
  const updateStep = usePipelineStore((s) => s.updateStep)
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!runId) return

    const handler = (msg: WsMessage) => {
      if (msg.type === 'pipeline_complete') {
        setPipelineStatus('completed')
        return
      }

      if (msg.type === 'step_status') {
        const step = msg.step as StepName
        if (!step || !STEP_ORDER.includes(step)) return

        if (msg.status === 'error') {
          updateStep(step, { status: 'error', error: msg.error })
          return
        }

        updateStep(step, {
          status: msg.status,
          progress: msg.progress ?? (msg.status === 'completed' ? 1 : 0),
          metadata: msg.metadata,
          error: msg.error,
        })
      }
    }

    const ws = connectWs(runId, handler)
    wsRef.current = ws

    ws.addEventListener('open', () => setConnected(true))
    ws.addEventListener('close', () => setConnected(false))

    return () => {
      ws.close(1000)
      wsRef.current = null
    }
  }, [runId, setConnected, updateStep, setPipelineStatus])
}
