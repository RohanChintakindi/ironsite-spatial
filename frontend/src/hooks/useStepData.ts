import { useEffect } from 'react'
import { usePipelineStore, type StepName } from '../store/pipeline'
import {
  getPreprocessData,
  getDinoDetections,
  getDetections,
  getRawDetections,
  getTrajectory,
  getDashboardData,
  getSceneGraphs,
  getEvents,
  getVlmAnalysis,
} from '../api/client'

export function useStepData() {
  const runId = usePipelineStore((s) => s.runId)
  const steps = usePipelineStore((s) => s.steps)
  const setPreprocessData = usePipelineStore((s) => s.setPreprocessData)
  const setDinoData = usePipelineStore((s) => s.setDinoData)
  const setRawDetections = usePipelineStore((s) => s.setRawDetections)
  const setDetections = usePipelineStore((s) => s.setDetections)
  const setTrajectoryData = usePipelineStore((s) => s.setTrajectoryData)
  const setDashboardData = usePipelineStore((s) => s.setDashboardData)
  const setSceneGraphs = usePipelineStore((s) => s.setSceneGraphs)
  const setEventsData = usePipelineStore((s) => s.setEventsData)
  const setVlmData = usePipelineStore((s) => s.setVlmData)

  const fetchOnComplete = (step: StepName, fetcher: () => void) => {
    if (steps[step].status === 'completed') {
      fetcher()
    }
  }

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('preprocess', async () => {
      try {
        const data = await getPreprocessData(runId)
        setPreprocessData(data)
      } catch (e) {
        console.error('Failed to fetch preprocess data:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.preprocess.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('dino', async () => {
      try {
        const data = await getDinoDetections(runId)
        setDinoData(data)
      } catch (e) {
        console.error('Failed to fetch DINO detections:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.dino.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('tracking', async () => {
      try {
        const data = await getRawDetections(runId)
        setRawDetections(data)
      } catch (e) {
        console.error('Failed to fetch tracking data:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.tracking.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('scene_graphs', async () => {
      try {
        const [det, sg] = await Promise.all([
          getDetections(runId),
          getSceneGraphs(runId),
        ])
        setDetections(det as never)
        setSceneGraphs(sg as never)
      } catch (e) {
        console.error('Failed to fetch detections:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.scene_graphs.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('reconstruction', async () => {
      try {
        const traj = await getTrajectory(runId)
        setTrajectoryData(traj)
      } catch (e) {
        console.error('Failed to fetch trajectory:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.reconstruction.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('memory', async () => {
      try {
        const data = await getDashboardData(runId)
        setDashboardData(data)
      } catch (e) {
        console.error('Failed to fetch dashboard data:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.memory.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('events', async () => {
      try {
        const data = await getEvents(runId)
        setEventsData(data)
      } catch (e) {
        console.error('Failed to fetch events data:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.events.status])

  useEffect(() => {
    if (!runId) return
    fetchOnComplete('vlm', async () => {
      try {
        const data = await getVlmAnalysis(runId)
        setVlmData(data)
      } catch (e) {
        console.error('Failed to fetch VLM data:', e)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, steps.vlm.status])
}
