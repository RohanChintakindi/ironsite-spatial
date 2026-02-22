import { create } from 'zustand'
import type { StepStatusType, PreprocessData, DashboardData, TrajectoryData, SceneGraph } from '../api/types'

export interface StepState {
  status: StepStatusType
  progress: number
  metadata?: Record<string, unknown>
  error?: string
}

export const STEP_ORDER = [
  'preprocess',
  'detection',
  'reconstruction',
  'scene_graphs',
  'graph',
  'memory',
  'vlm',
] as const

export type StepName = (typeof STEP_ORDER)[number]

export const STEP_LABELS: Record<StepName, string> = {
  preprocess: 'Preprocessing',
  detection: 'Detection & Tracking',
  reconstruction: '3D Reconstruction',
  scene_graphs: 'Scene Graphs',
  graph: 'Spatial Graph',
  memory: 'Spatial Memory',
  vlm: 'VLM Analysis',
}

interface PipelineStore {
  // Connection state
  runId: string | null
  connected: boolean
  pipelineStatus: 'idle' | 'running' | 'completed' | 'error'

  // Step states
  steps: Record<StepName, StepState>

  // Fetched data cache
  preprocessData: PreprocessData | null
  detections: SceneGraph[] | null
  trajectoryData: TrajectoryData | null
  dashboardData: DashboardData | null
  sceneGraphs: SceneGraph[] | null
  vlmData: Record<string, unknown> | null

  // Actions
  setRunId: (id: string) => void
  setConnected: (v: boolean) => void
  setPipelineStatus: (s: 'idle' | 'running' | 'completed' | 'error') => void
  updateStep: (step: StepName, update: Partial<StepState>) => void
  setPreprocessData: (d: PreprocessData) => void
  setDetections: (d: SceneGraph[]) => void
  setTrajectoryData: (d: TrajectoryData) => void
  setDashboardData: (d: DashboardData) => void
  setSceneGraphs: (d: SceneGraph[]) => void
  setVlmData: (d: Record<string, unknown>) => void
  reset: () => void
}

const initialSteps: Record<StepName, StepState> = {
  preprocess: { status: 'pending', progress: 0 },
  detection: { status: 'pending', progress: 0 },
  reconstruction: { status: 'pending', progress: 0 },
  scene_graphs: { status: 'pending', progress: 0 },
  graph: { status: 'pending', progress: 0 },
  memory: { status: 'pending', progress: 0 },
  vlm: { status: 'pending', progress: 0 },
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  runId: null,
  connected: false,
  pipelineStatus: 'idle',
  steps: { ...initialSteps },
  preprocessData: null,
  detections: null,
  trajectoryData: null,
  dashboardData: null,
  sceneGraphs: null,
  vlmData: null,

  setRunId: (id) => set({ runId: id }),
  setConnected: (v) => set({ connected: v }),
  setPipelineStatus: (s) => set({ pipelineStatus: s }),
  updateStep: (step, update) =>
    set((state) => ({
      steps: {
        ...state.steps,
        [step]: { ...state.steps[step], ...update },
      },
    })),
  setPreprocessData: (d) => set({ preprocessData: d }),
  setDetections: (d) => set({ detections: d }),
  setTrajectoryData: (d) => set({ trajectoryData: d }),
  setDashboardData: (d) => set({ dashboardData: d }),
  setSceneGraphs: (d) => set({ sceneGraphs: d }),
  setVlmData: (d) => set({ vlmData: d }),
  reset: () =>
    set({
      runId: null,
      connected: false,
      pipelineStatus: 'idle',
      steps: { ...initialSteps },
      preprocessData: null,
      detections: null,
      trajectoryData: null,
      dashboardData: null,
      sceneGraphs: null,
      vlmData: null,
    }),
}))
