const BASE = '/api'

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function startPipeline(config: {
  video_path: string
  backend: string
  keyframe_interval: number
  max_frames: number
  grok_key?: string
  skip_vlm: boolean
}) {
  return request<{ run_id: string }>('/pipeline/run', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export async function getPipelineStatus(runId: string) {
  return request<{
    run_id: string
    status: string
    current_step?: string
    steps: Record<string, unknown>
  }>(`/pipeline/status/${runId}`)
}

export async function getPreprocessData(runId: string) {
  return request<{
    num_keyframes: number
    fps: number
    width: number
    height: number
    timestamps: number[]
    duration: number
  }>(`/results/${runId}/preprocess`)
}

export function frameUrl(runId: string, idx: number) {
  return `${BASE}/results/${runId}/frame/${idx}`
}

export function annotatedFrameUrl(runId: string, idx: number) {
  return `${BASE}/results/${runId}/frame/${idx}/annotated`
}

export function depthFrameUrl(runId: string, idx: number) {
  return `${BASE}/results/${runId}/frame/${idx}/depth`
}

export async function getDetections(runId: string) {
  return request<{
    frame_index: number
    timestamp: number
    timestamp_str: string
    objects: {
      id: number
      label: string
      bbox: number[]
      depth_m?: number
      position_3d?: number[]
      confidence?: number
    }[]
  }[]>(`/results/${runId}/detections`)
}

export async function getPointCloud(runId: string): Promise<Float32Array> {
  const res = await fetch(`${BASE}/results/${runId}/pointcloud`)
  if (!res.ok) throw new Error(`API ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Float32Array(buf)
}

export async function getTrajectory(runId: string) {
  return request<{
    positions: { x: number; y: number; z: number; frame_index?: number }[]
    total_distance: number
  }>(`/results/${runId}/trajectory`)
}

export async function getSceneGraphs(runId: string) {
  return request<unknown[]>(`/results/${runId}/scene-graphs`)
}

export async function getVlmAnalysis(runId: string) {
  return request<Record<string, unknown>>(`/results/${runId}/vlm`)
}

export async function getDashboardData(runId: string) {
  return request<{
    detections_per_class: Record<string, number>
    depth_values: number[]
    depth_timestamps: { label: string; depth: number; time_idx: number }[]
    spatial_positions: { x: number; z: number; label: string }[]
    camera_path: { x: number; z: number }[]
    heatmap_data: { x_bins: number[]; z_bins: number[]; counts: number[][] }
  }>(`/results/${runId}/dashboard-data`)
}

export async function queryMemory(
  runId: string,
  query: {
    query_type: string
    label?: string
    label_a?: string
    label_b?: string
    min_depth?: number
    max_depth?: number
    max_distance?: number
  },
) {
  return request<{ query: typeof query; count: number; entries: Record<string, unknown>[] }>(
    `/memory/${runId}/query`,
    { method: 'POST', body: JSON.stringify(query) },
  )
}
