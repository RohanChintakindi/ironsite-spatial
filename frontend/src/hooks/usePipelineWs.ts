import { useEffect, useRef } from 'react'
import { connectWs } from '../api/websocket'
import { getPipelineStatus } from '../api/client'
import { usePipelineStore, type StepName, STEP_ORDER } from '../store/pipeline'
import type { WsMessage } from '../api/types'

/**
 * Fetch the full pipeline status via REST and push it into the store.
 * This catches any step events the WebSocket missed (e.g. cached steps
 * that completed before the WS connection was established).
 */
async function syncStatus(runId: string) {
  const { updateStep, setPipelineStatus, steps, pipelineStatus } = usePipelineStore.getState()
  try {
    const data = await getPipelineStatus(runId)
    for (const [name, info] of Object.entries(data.steps)) {
      if (!STEP_ORDER.includes(name as StepName)) continue
      const current = steps[name as StepName]
      // Skip if nothing changed (avoids unnecessary re-renders / re-fetches)
      if (current.status === info.status && current.progress === info.progress) continue
      if (info.status !== 'pending') {
        updateStep(name as StepName, {
          status: info.status,
          progress: info.progress ?? (info.status === 'completed' ? 1 : 0),
          metadata: info.metadata,
          error: info.error,
        })
      }
    }
    if (data.status === 'completed' && pipelineStatus !== 'completed') {
      setPipelineStatus('completed')
    } else if (data.status === 'error' && pipelineStatus !== 'error') {
      setPipelineStatus('error')
    }
  } catch {
    // Ignore poll failures — WS events are the primary channel
  }
}

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

    ws.addEventListener('open', () => {
      setConnected(true)
      // Immediately sync to catch any steps that completed before WS connected
      syncStatus(runId)
    })
    ws.addEventListener('close', () => setConnected(false))

    // Poll every 2s as a safety net (self-terminates when pipeline finishes)
    const poll = setInterval(() => {
      const { pipelineStatus } = usePipelineStore.getState()
      if (pipelineStatus === 'completed' || pipelineStatus === 'error' || pipelineStatus === 'idle') {
        clearInterval(poll)
        return
      }
      syncStatus(runId)
    }, 2000)

    return () => {
      ws.close(1000)
      wsRef.current = null
      clearInterval(poll)
    }
  }, [runId, setConnected, updateStep, setPipelineStatus])
}
