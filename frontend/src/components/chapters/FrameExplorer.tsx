import { useState } from 'react'
import { motion } from 'framer-motion'
import { usePipelineStore } from '../../store/pipeline'
import StatusBadge from '../ui/StatusBadge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { annotatedFrameUrl, depthFrameUrl } from '../../api/client'
import { getClassColor, type SceneGraph } from '../../api/types'

export default function FrameExplorer() {
  const runId = usePipelineStore((s) => s.runId)
  const sceneGraphs = usePipelineStore((s) => s.sceneGraphs) as SceneGraph[] | null
  const trajectoryData = usePipelineStore((s) => s.trajectoryData)
  const sceneGraphStep = usePipelineStore((s) => s.steps.scene_graphs)
  const reconstructionStep = usePipelineStore((s) => s.steps.reconstruction)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)
  const [frameIdx, setFrameIdx] = useState(0)

  const isReconDone = reconstructionStep.status === 'completed'
  const hasFullViz = sceneGraphStep.status === 'completed' && sceneGraphs && sceneGraphs.length > 0
  const total = sceneGraphs?.length ?? 0
  const current = sceneGraphs?.[frameIdx]

  if (pipelineStatus === 'idle' || !isReconDone) return null

  const prev = () => setFrameIdx((i) => Math.max(0, i - 1))
  const next = () => setFrameIdx((i) => Math.min(total - 1, i + 1))
  const camPos = current?.camera_pose?.position

  return (
    <section id="chapter-scene_graphs" className="py-16 scroll-mt-14 space-y-20">
      <div>
        {/* Section divider */}
        <div
          className="mb-10 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, #333 30%, #f59e0b15 50%, #333 70%, transparent)',
          }}
        />

        <div className="flex items-center gap-4 mb-2">
          <h2 className="text-2xl font-bold tracking-tight text-[#e4e4e7] scan-line">
            3D-Fused Frame Explorer
          </h2>
          <StatusBadge status={sceneGraphStep.status} />
        </div>
        <p className="text-[#a1a1aa] text-[15px] mb-6 max-w-2xl leading-relaxed">
          Browse each frame with detection overlays, metric depth, and COLMAP world coordinates. Use the scrubber to navigate.
        </p>

        {!hasFullViz && (
          <div className="flex items-center gap-3 py-8">
            <div className="relative">
              <div className="w-5 h-5 border-2 border-[#52525b] border-t-transparent rounded-full animate-spin" />
            </div>
            <span className="text-[#52525b] text-sm">
              Building scene graphs with 3D coordinates...
            </span>
          </div>
        )}

        {/* Shared frame scrubber */}
        {hasFullViz && (
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={prev}
              disabled={frameIdx === 0}
              className="p-2.5 rounded-lg bg-[#0f0f14] border border-[#1a1a1a] text-[#52525b] hover:text-[#e4e4e7] hover:border-[#333] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={total - 1}
                value={frameIdx}
                onChange={(e) => setFrameIdx(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <button
              onClick={next}
              disabled={frameIdx >= total - 1}
              className="p-2.5 rounded-lg bg-[#0f0f14] border border-[#1a1a1a] text-[#52525b] hover:text-[#e4e4e7] hover:border-[#333] disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-200"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="font-data text-sm text-[#52525b] w-28 text-right">
              Frame {frameIdx + 1} / {total}
            </span>
          </div>
        )}

        {hasFullViz && current && (
          <div className="text-xs font-data text-[#3f3f46] mb-2">
            {current.timestamp_str} | {current.num_objects} detections
          </div>
        )}
      </div>

      {/* ─── Panel 1: Detection Overlay ─── */}
      {hasFullViz && current && runId && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h3 className="text-xl font-bold text-[#e4e4e7] mb-2 tracking-tight">
            Detection Overlay
          </h3>
          <p className="text-[#a1a1aa] text-sm mb-4 max-w-2xl leading-relaxed">
            Grounding DINO detections with class-colored bounding boxes, confidence scores, and metric depth labels.
          </p>
          <div className="relative rounded-xl overflow-hidden border border-[#1a1a1a] bg-black">
            <img
              src={annotatedFrameUrl(runId, frameIdx)}
              alt={`Annotated frame ${frameIdx}`}
              className="w-full object-contain"
              loading="lazy"
            />
            <div className="absolute top-4 right-4 bg-[#0a0a0f]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#222]/50">
              <span className="font-data text-sm text-[#f59e0b]">
                {current.timestamp_str}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Panel 2: VGGT-X Depth Map ─── */}
      {hasFullViz && current && runId && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <h3 className="text-xl font-bold text-[#e4e4e7] mb-2 tracking-tight">
            VGGT-X Depth Map
          </h3>
          <p className="text-[#a1a1aa] text-sm mb-4 max-w-2xl leading-relaxed">
            Per-frame metric depth from VGGT-X, plasma colormap. Closer objects appear warmer (yellow), distant objects cooler (purple).
          </p>
          <div className="relative rounded-xl overflow-hidden border border-[#1a1a1a] bg-black">
            <img
              src={depthFrameUrl(runId, frameIdx)}
              alt={`Depth map ${frameIdx}`}
              className="w-full object-contain"
              loading="lazy"
            />
            <div className="absolute top-4 right-4 bg-[#0a0a0f]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-[#222]/50">
              <span className="font-data text-sm text-[#06b6d4]">
                Depth Frame {frameIdx + 1}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Panel 3: COLMAP World Coordinates (Top-Down) ─── */}
      {hasFullViz && current && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h3 className="text-xl font-bold text-[#e4e4e7] mb-2 tracking-tight">
            COLMAP World Coordinates
          </h3>
          <p className="text-[#a1a1aa] text-sm mb-4 max-w-2xl leading-relaxed">
            Top-down view of object positions in COLMAP world space. Gold square is the camera, colored dots are detected objects with dashed sightlines.
          </p>
          <div className="rounded-xl overflow-hidden border border-[#1a1a1a]">
            <TopDownPanel
              sceneGraph={current}
              cameraPos={camPos}
              trajectoryData={trajectoryData}
            />
          </div>
        </motion.div>
      )}
    </section>
  )
}


/* ── Top-Down SVG Panel ── */

interface TopDownPanelProps {
  sceneGraph: SceneGraph
  cameraPos?: number[]
  trajectoryData: { positions: { x: number; y: number; z: number }[]; total_distance: number } | null
}

function TopDownPanel({ sceneGraph, cameraPos, trajectoryData }: TopDownPanelProps) {
  const W = 800
  const H = 600
  const PAD = 60

  const allX: number[] = []
  const allZ: number[] = []

  if (trajectoryData) {
    trajectoryData.positions.forEach((p) => {
      allX.push(p.x)
      allZ.push(p.z)
    })
  }

  sceneGraph.objects.forEach((obj) => {
    if (obj.position_3d) {
      allX.push(obj.position_3d[0])
      allZ.push(obj.position_3d[2])
    }
  })

  if (cameraPos) {
    allX.push(cameraPos[0])
    allZ.push(cameraPos[2])
  }

  if (allX.length === 0) {
    return (
      <div className="aspect-[4/3] flex items-center justify-center text-sm text-[#3f3f46] bg-[#0f0f14]">
        No 3D position data available
      </div>
    )
  }

  const xMin = Math.min(...allX)
  const xMax = Math.max(...allX)
  const zMin = Math.min(...allZ)
  const zMax = Math.max(...allZ)
  const xRange = xMax - xMin || 1
  const zRange = zMax - zMin || 1

  const sx = (x: number) => PAD + ((x - xMin) / xRange) * (W - 2 * PAD)
  const sz = (z: number) => PAD + ((z - zMin) / zRange) * (H - 2 * PAD)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full aspect-[4/3]"
      style={{ background: '#0f0f14' }}
    >
      {/* Grid lines */}
      {Array.from({ length: 9 }).map((_, i) => {
        const x = PAD + (i / 8) * (W - 2 * PAD)
        const z = PAD + (i / 8) * (H - 2 * PAD)
        return (
          <g key={i}>
            <line x1={x} y1={PAD} x2={x} y2={H - PAD} stroke="#1a1a1a" strokeWidth={0.5} />
            <line x1={PAD} y1={z} x2={W - PAD} y2={z} stroke="#1a1a1a" strokeWidth={0.5} />
          </g>
        )
      })}

      {/* Trajectory background path */}
      {trajectoryData?.positions.map((p, i) => (
        <circle
          key={`traj-${i}`}
          cx={sx(p.x)}
          cy={sz(p.z)}
          r={2}
          fill="rgba(150,150,150,0.25)"
        />
      ))}

      {/* Detection objects */}
      {sceneGraph.objects.map((obj) => {
        if (!obj.position_3d) return null
        const color = getClassColor(obj.label)
        const px = sx(obj.position_3d[0])
        const pz = sz(obj.position_3d[2])
        return (
          <g key={obj.id}>
            {cameraPos && (
              <line
                x1={sx(cameraPos[0])}
                y1={sz(cameraPos[2])}
                x2={px}
                y2={pz}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.4}
              />
            )}
            <circle cx={px} cy={pz} r={8} fill={color} opacity={0.7} />
            <text x={px + 12} y={pz + 4} fontSize={11} fill="#999" fontFamily="'JetBrains Mono', monospace">
              {obj.label}
            </text>
          </g>
        )
      })}

      {/* Camera position */}
      {cameraPos && (
        <rect
          x={sx(cameraPos[0]) - 8}
          y={sz(cameraPos[2]) - 8}
          width={16}
          height={16}
          fill="#FFD700"
          stroke="#fff"
          strokeWidth={1}
        />
      )}

      {/* Axis labels */}
      <text x={W / 2} y={H - 15} fontSize={13} fill="#52525b" textAnchor="middle" fontFamily="'JetBrains Mono', monospace">
        X (m)
      </text>
      <text
        x={18}
        y={H / 2}
        fontSize={13}
        fill="#52525b"
        textAnchor="middle"
        fontFamily="'JetBrains Mono', monospace"
        transform={`rotate(-90, 18, ${H / 2})`}
      >
        Z (m)
      </text>
    </svg>
  )
}
