import { create } from 'zustand'
import type { StepStatusType, PreprocessData, DashboardData, TrajectoryData, SceneGraph, EventsData, RawDetectionData, DinoDetectionData } from '../api/types'

export interface StepState {
  status: StepStatusType
  progress: number
  metadata?: Record<string, unknown>
  error?: string
}

export const STEP_ORDER = [
  'preprocess',
  'dino',
  'tracking',
  'reconstruction',
  'scene_graphs',
  'graph',
  'events',
  'memory',
  'vlm',
] as const

export type StepName = (typeof STEP_ORDER)[number]

export const STEP_LABELS: Record<StepName, string> = {
  preprocess: 'Preprocessing',
  dino: 'DINO Detection',
  tracking: 'SAM2 Tracking',
  reconstruction: '3D Reconstruction',
  scene_graphs: 'Scene Graphs',
  graph: 'Spatial Graph',
  events: 'Event Analysis',
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
  dinoData: DinoDetectionData | null
  detections: SceneGraph[] | null
  trajectoryData: TrajectoryData | null
  dashboardData: DashboardData | null
  sceneGraphs: SceneGraph[] | null
  rawDetections: RawDetectionData | null
  graphData: { nodes: { id: string; type: string; label: string; color: string; [k: string]: unknown }[]; edges: { source: string; target: string; relation: string; weight: number; color: string }[]; stats?: { total_nodes: number; total_edges: number; node_types: Record<string, number>; edge_types: Record<string, number> } } | null
  eventsData: EventsData | null
  vlmData: Record<string, unknown> | null

  // Actions
  setRunId: (id: string) => void
  setConnected: (v: boolean) => void
  setPipelineStatus: (s: 'idle' | 'running' | 'completed' | 'error') => void
  updateStep: (step: StepName, update: Partial<StepState>) => void
  setPreprocessData: (d: PreprocessData) => void
  setDinoData: (d: DinoDetectionData) => void
  setRawDetections: (d: RawDetectionData) => void
  setDetections: (d: SceneGraph[]) => void
  setTrajectoryData: (d: TrajectoryData) => void
  setDashboardData: (d: DashboardData) => void
  setSceneGraphs: (d: SceneGraph[]) => void
  setGraphData: (d: PipelineStore['graphData']) => void
  setEventsData: (d: EventsData) => void
  setVlmData: (d: Record<string, unknown>) => void
  reset: () => void
}

const initialSteps: Record<StepName, StepState> = {
  preprocess: { status: 'pending', progress: 0 },
  dino: { status: 'pending', progress: 0 },
  tracking: { status: 'pending', progress: 0 },
  reconstruction: { status: 'pending', progress: 0 },
  scene_graphs: { status: 'pending', progress: 0 },
  graph: { status: 'pending', progress: 0 },
  events: { status: 'pending', progress: 0 },
  memory: { status: 'pending', progress: 0 },
  vlm: { status: 'pending', progress: 0 },
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  runId: null,
  connected: false,
  pipelineStatus: 'idle',
  steps: { ...initialSteps },
  preprocessData: null,
  dinoData: null,
  rawDetections: null,
  graphData: null,
  detections: null,
  trajectoryData: null,
  dashboardData: null,
  sceneGraphs: null,
  eventsData: null,
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
  setDinoData: (d) => set({ dinoData: d }),
  setRawDetections: (d) => set({ rawDetections: d }),
  setDetections: (d) => set({ detections: d }),
  setTrajectoryData: (d) => set({ trajectoryData: d }),
  setDashboardData: (d) => set({ dashboardData: d }),
  setSceneGraphs: (d) => set({ sceneGraphs: d }),
  setGraphData: (d) => set({ graphData: d }),
  setEventsData: (d) => set({ eventsData: d }),
  setVlmData: (d) => set({ vlmData: d }),
  reset: () =>
    set({
      runId: null,
      connected: false,
      pipelineStatus: 'idle',
      steps: { ...initialSteps },
      preprocessData: null,
      dinoData: null,
      rawDetections: null,
      graphData: null,
      detections: null,
      trajectoryData: null,
      dashboardData: null,
      sceneGraphs: null,
      eventsData: null,
      vlmData: null,
    }),
}))
