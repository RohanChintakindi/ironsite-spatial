import { useMemo } from 'react'
import { usePipelineStore } from '../../store/pipeline'

export default function TrajectoryMap() {
  const trajectoryData = usePipelineStore((s) => s.trajectoryData)

  const W = 500
  const H = 400
  const PAD = 50

  const { positions, bounds } = useMemo(() => {
    if (!trajectoryData) return { positions: [], bounds: { xMin: 0, xMax: 1, zMin: 0, zMax: 1 } }
    const pos = trajectoryData.positions
    const xs = pos.map((p) => p.x)
    const zs = pos.map((p) => p.z)
    return {
      positions: pos,
      bounds: {
        xMin: Math.min(...xs),
        xMax: Math.max(...xs),
        zMin: Math.min(...zs),
        zMax: Math.max(...zs),
      },
    }
  }, [trajectoryData])

  if (!trajectoryData || positions.length === 0) return null

  const { xMin, xMax, zMin, zMax } = bounds
  const xRange = xMax - xMin || 1
  const zRange = zMax - zMin || 1

  const sx = (x: number) => PAD + ((x - xMin) / xRange) * (W - 2 * PAD)
  const sz = (z: number) => PAD + ((z - zMin) / zRange) * (H - 2 * PAD)

  // Generate plasma-like colors based on time index
  const getTimeColor = (t: number): string => {
    // Simplified plasma: purple → blue → cyan → yellow
    const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 * t - 0.5)))
    const g = Math.round(255 * Math.sin(Math.PI * t))
    const b = Math.round(255 * Math.max(0, 1 - 2 * t))
    return `rgb(${r},${g},${b})`
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left: Camera trajectory with time coloring */}
      <div className="rounded-xl border border-[#222] overflow-hidden">
        <div className="px-3 py-2 text-xs font-data text-[#a1a1aa] border-b border-[#222] bg-[#111]">
          Camera Trajectory (Time-Colored)
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: '#111' }}>
          {/* Grid */}
          {Array.from({ length: 5 }).map((_, i) => (
            <g key={i}>
              <line
                x1={PAD + (i / 4) * (W - 2 * PAD)}
                y1={PAD}
                x2={PAD + (i / 4) * (W - 2 * PAD)}
                y2={H - PAD}
                stroke="#222"
                strokeWidth={0.5}
              />
              <line
                x1={PAD}
                y1={PAD + (i / 4) * (H - 2 * PAD)}
                x2={W - PAD}
                y2={PAD + (i / 4) * (H - 2 * PAD)}
                stroke="#222"
                strokeWidth={0.5}
              />
            </g>
          ))}
          {/* Trajectory points */}
          {positions.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sz(p.z)}
              r={3}
              fill={getTimeColor(i / (positions.length - 1))}
              opacity={0.7}
            />
          ))}
          {/* Axis labels */}
          <text x={W / 2} y={H - 10} fontSize={10} fill="#888" textAnchor="middle" fontFamily="monospace">
            X (m)
          </text>
          <text x={14} y={H / 2} fontSize={10} fill="#888" textAnchor="middle" fontFamily="monospace" transform={`rotate(-90, 14, ${H / 2})`}>
            Z (m)
          </text>
        </svg>
      </div>

      {/* Right: Point cloud top-down with camera dots */}
      <div className="rounded-xl border border-[#222] overflow-hidden">
        <div className="px-3 py-2 text-xs font-data text-[#a1a1aa] border-b border-[#222] bg-[#111]">
          Point Cloud + Camera Path
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: '#1a1a1a' }}>
          {/* Grid */}
          {Array.from({ length: 5 }).map((_, i) => (
            <g key={i}>
              <line
                x1={PAD + (i / 4) * (W - 2 * PAD)}
                y1={PAD}
                x2={PAD + (i / 4) * (W - 2 * PAD)}
                y2={H - PAD}
                stroke="#222"
                strokeWidth={0.5}
              />
              <line
                x1={PAD}
                y1={PAD + (i / 4) * (H - 2 * PAD)}
                x2={W - PAD}
                y2={PAD + (i / 4) * (H - 2 * PAD)}
                stroke="#222"
                strokeWidth={0.5}
              />
            </g>
          ))}
          {/* Camera positions as red dots */}
          {positions.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sz(p.z)}
              r={4}
              fill="#ff3333"
              opacity={0.8}
            />
          ))}
          <text x={W / 2} y={H - 10} fontSize={10} fill="#888" textAnchor="middle" fontFamily="monospace">
            X (m)
          </text>
          <text x={14} y={H / 2} fontSize={10} fill="#888" textAnchor="middle" fontFamily="monospace" transform={`rotate(-90, 14, ${H / 2})`}>
            Z (m)
          </text>
        </svg>
      </div>
    </div>
  )
}
