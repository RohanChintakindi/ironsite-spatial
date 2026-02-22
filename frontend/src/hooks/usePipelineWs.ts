import { useEffect, useRef } from 'react'
import { connectWs } from '../api/websocket'
import { getPipelineStatus } from '../api/client'
import { usePipelineStore, type StepName, STEP_ORDER } from '../store/pipeline'
import type { WsMessage } from '../api/types'

const STAGGER_MS = 400

/**
 * Fetch the full pipeline status via REST and push it into the store.
 * Steps are revealed one-by-one with a stagger delay so the UI flows
 * sequentially even when multiple steps completed while WS was disconnected.
 */
async function syncStatus(runId: string) {
  const store = usePipelineStore.getState()
  try {
    const data = await getPipelineStatus(runId)

    // Collect steps that need updating, in pipeline order
    const pending: { name: StepName; info: typeof data.steps[string] }[] = []
    for (const name of STEP_ORDER) {
      const info = data.steps[name]
      if (!info || info.status === 'pending') continue
      const current = store.steps[name]
      if (current.status === info.status && current.progress === info.progress) continue
      pending.push({ name, info })
    }

    // Stagger updates if multiple steps need catching up
    for (let i = 0; i < pending.length; i++) {
      const { name, info } = pending[i]
      const delay = pending.length > 1 ? i * STAGGER_MS : 0
      if (delay > 0) {
        await new Promise((r) => setTimeout(r, STAGGER_MS))
      }
      usePipelineStore.getState().updateStep(name, {
        status: info.status,
        progress: info.progress ?? (info.status === 'completed' ? 1 : 0),
        metadata: info.metadata,
        error: info.error,
      })
    }

    if (data.status === 'completed' && usePipelineStore.getState().pipelineStatus !== 'completed') {
      usePipelineStore.getState().setPipelineStatus('completed')
    } else if (data.status === 'error' && usePipelineStore.getState().pipelineStatus !== 'error') {
      usePipelineStore.getState().setPipelineStatus('error')
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
      // Sync with stagger to reveal steps one-by-one
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
