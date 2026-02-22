export interface PipelineConfig {
  video_path: string
  backend: 'vggtx' | 'fastvggt'
  keyframe_interval: number
  max_frames: number
  grok_key?: string
  skip_vlm: boolean
}

export interface PipelineStartResponse {
  run_id: string
}

export type StepStatusType = 'pending' | 'started' | 'progress' | 'completed' | 'error'

export interface StepStatus {
  step: string
  status: StepStatusType
  progress: number
  metadata?: Record<string, unknown>
  error?: string
}

export interface PipelineStatus {
  run_id: string
  status: 'running' | 'completed' | 'error'
  current_step?: string
  steps: Record<string, StepStatus>
}

export interface WsMessage {
  type?: string
  step?: string
  status?: StepStatusType
  progress?: number
  metadata?: Record<string, unknown>
  error?: string
}

export interface DetectionObject {
  id: number
  label: string
  bbox: number[]
  depth_m?: number
  position_3d?: number[]
  confidence?: number
}

export interface FrameDetections {
  frame_index: number
  timestamp: number
  timestamp_str: string
  objects: DetectionObject[]
}

export interface PreprocessData {
  num_keyframes: number
  fps: number
  width: number
  height: number
  timestamps: number[]
  duration: number
}

export interface CameraPosition {
  x: number
  y: number
  z: number
  frame_index?: number
}

export interface TrajectoryData {
  positions: CameraPosition[]
  total_distance: number
}

export interface SceneGraph {
  frame_index: number
  original_frame: number
  timestamp: number
  timestamp_str: string
  camera_pose: { position: number[] }
  num_objects: number
  objects: DetectionObject[]
  spatial_relations: unknown[][]
  hand_state: Record<string, string>
  colmap_frame: string
}

export interface MemoryQuery {
  query_type: 'label' | 'depth_range' | 'proximity'
  label?: string
  label_a?: string
  label_b?: string
  min_depth?: number
  max_depth?: number
  max_distance?: number
}

export interface MemoryResult {
  query: MemoryQuery
  count: number
  entries: Record<string, unknown>[]
}

export interface DashboardData {
  detections_per_class: Record<string, number>
  depth_values: number[]
  depth_timestamps: { label: string; depth: number; time_idx: number }[]
  spatial_positions: { x: number; z: number; label: string }[]
  camera_path: { x: number; z: number }[]
  heatmap_data: { x_bins: number[]; z_bins: number[]; counts: number[][] }
}

export interface VlmAnalysis {
  activity_timeline?: { start: string; end: string; activity: string; description: string }[]
  summary?: Record<string, number>
  productivity?: Record<string, unknown>
  safety?: Record<string, unknown>
}

export const CLASS_COLORS: Record<string, string> = {
  person: 'rgb(0,200,100)',
  worker: 'rgb(0,200,100)',
  'cinder block': 'rgb(50,150,255)',
  'concrete block': 'rgb(30,120,220)',
  'safety vest': 'rgb(255,165,0)',
  'hard hat': 'rgb(0,255,255)',
  'head protection': 'rgb(0,255,255)',
  crane: 'rgb(220,50,50)',
  scaffolding: 'rgb(180,50,220)',
  trowel: 'rgb(255,255,0)',
  'hand protection': 'rgb(255,200,0)',
  'gloved hand': 'rgb(255,200,0)',
  rebar: 'rgb(255,100,50)',
  bucket: 'rgb(100,200,255)',
  wall: 'rgb(150,150,150)',
  mortar: 'rgb(200,180,140)',
  ladder: 'rgb(180,120,60)',
}

export const DEFAULT_COLOR = 'rgb(200,200,200)'

export function getClassColor(label: string): string {
  const lower = label.toLowerCase()
  return CLASS_COLORS[lower] ?? DEFAULT_COLOR
}
