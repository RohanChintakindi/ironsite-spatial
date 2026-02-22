import { useState, useEffect, useRef, useCallback } from 'react'
import { usePipelineStore } from '../../store/pipeline'
import { annotatedFrameUrl, depthFrameUrl } from '../../api/client'
import { getClassColor, type SceneGraph } from '../../api/types'

interface FrameVizProps {
  frameIndex: number
  sceneGraph: SceneGraph
  pointCloudData?: { positions: { x: number; z: number }[]; colors: string[] }
}

export default function FrameViz({ frameIndex, sceneGraph, pointCloudData }: FrameVizProps) {
  const runId = usePipelineStore((s) => s.runId)
  const trajectoryData = usePipelineStore((s) => s.trajectoryData)

  if (!runId) return null

  const camPos = sceneGraph.camera_pose?.position
  const footer = `Frame ${frameIndex} | ${sceneGraph.timestamp_str} | ${sceneGraph.num_objects} detections`

  return (
    <div className="bg-[#0d0d0d] rounded-xl border border-[#222] overflow-hidden">
      <div className="grid grid-cols-3 gap-px bg-[#222]">
        {/* Panel 1: YOLO-World annotated frame */}
        <div className="bg-[#0d0d0d]">
          <div className="px-3 py-2 text-xs font-data text-[#a1a1aa] border-b border-[#222]">
            YOLO-World | {sceneGraph.timestamp_str}
          </div>
          <img
            src={annotatedFrameUrl(runId, frameIndex)}
            alt={`Annotated frame ${frameIndex}`}
            className="w-full aspect-video object-contain bg-black"
            loading="lazy"
          />
        </div>

        {/* Panel 2: Depth map */}
        <div className="bg-[#0d0d0d]">
          <div className="px-3 py-2 text-xs font-data text-[#a1a1aa] border-b border-[#222]">
            VGGT-X Depth Map
          </div>
          <img
            src={depthFrameUrl(runId, frameIndex)}
            alt={`Depth map ${frameIndex}`}
            className="w-full aspect-video object-contain bg-black"
            loading="lazy"
          />
        </div>

        {/* Panel 3: Top-down world coordinates */}
        <div className="bg-[#0d0d0d]">
          <div className="px-3 py-2 text-xs font-data text-[#a1a1aa] border-b border-[#222]">
            COLMAP World Coords (Top-Down)
          </div>
          <TopDownPanel
            sceneGraph={sceneGraph}
            cameraPos={camPos}
            trajectoryData={trajectoryData}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-xs font-data text-[#52525b] border-t border-[#222] bg-[#0d0d0d]">
        {footer}
      </div>
    </div>
  )
}

interface TopDownPanelProps {
  sceneGraph: SceneGraph
  cameraPos?: number[]
  trajectoryData: { positions: { x: number; y: number; z: number }[]; total_distance: number } | null
}

function TopDownPanel({ sceneGraph, cameraPos, trajectoryData }: TopDownPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const W = 400
  const H = 300
  const PAD = 40

  // Compute bounds from trajectory + object positions
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
      <div className="aspect-video flex items-center justify-center text-xs text-[#52525b]">
        No 3D data
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
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full aspect-video"
      style={{ background: '#1a1a1a' }}
    >
      {/* Grid */}
      {Array.from({ length: 5 }).map((_, i) => {
        const x = PAD + (i / 4) * (W - 2 * PAD)
        const z = PAD + (i / 4) * (H - 2 * PAD)
        return (
          <g key={i}>
            <line x1={x} y1={PAD} x2={x} y2={H - PAD} stroke="#222" strokeWidth={0.5} />
            <line x1={PAD} y1={z} x2={W - PAD} y2={z} stroke="#222" strokeWidth={0.5} />
          </g>
        )
      })}

      {/* Trajectory background points */}
      {trajectoryData?.positions.map((p, i) => (
        <circle
          key={`traj-${i}`}
          cx={sx(p.x)}
          cy={sz(p.z)}
          r={1.5}
          fill="rgba(150,150,150,0.2)"
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
            {/* Dashed line from camera */}
            {cameraPos && (
              <line
                x1={sx(cameraPos[0])}
                y1={sz(cameraPos[2])}
                x2={px}
                y2={pz}
                stroke={color}
                strokeWidth={0.5}
                strokeDasharray="3,3"
                opacity={0.5}
              />
            )}
            <circle cx={px} cy={pz} r={5} fill={color} opacity={0.7} />
            <text x={px + 7} y={pz + 3} fontSize={7} fill="#aaa" fontFamily="monospace">
              {obj.label}
            </text>
          </g>
        )
      })}

      {/* Camera position */}
      {cameraPos && (
        <rect
          x={sx(cameraPos[0]) - 5}
          y={sz(cameraPos[2]) - 5}
          width={10}
          height={10}
          fill="#FFD700"
          stroke="#fff"
          strokeWidth={0.5}
        />
      )}

      {/* Axis labels */}
      <text x={W / 2} y={H - 8} fontSize={9} fill="#888" textAnchor="middle" fontFamily="monospace">
        X (m)
      </text>
      <text
        x={12}
        y={H / 2}
        fontSize={9}
        fill="#888"
        textAnchor="middle"
        fontFamily="monospace"
        transform={`rotate(-90, 12, ${H / 2})`}
      >
        Z (m)
      </text>
    </svg>
  )
}
