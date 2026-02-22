import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell,
} from 'recharts'
import { usePipelineStore } from '../../store/pipeline'
import { getClassColor, type DashboardData } from '../../api/types'

export default function Dashboard() {
  const dashboardData = usePipelineStore((s) => s.dashboardData) as DashboardData | null
  const preprocessData = usePipelineStore((s) => s.preprocessData)

  if (!dashboardData) return null

  const totalFrames = preprocessData?.num_keyframes ?? 0

  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="text-center text-sm font-data text-[#a1a1aa] py-2">
        Masonry Site Spatial Analytics | {totalFrames} frames | VGGT-X
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Top-left: Detections per class */}
        <DetectionsPerClass data={dashboardData.detections_per_class} />

        {/* Top-right: Depth distribution */}
        <DepthHistogram depths={dashboardData.depth_values} />

        {/* Bottom-left: Depth over time scatter */}
        <DepthOverTime data={dashboardData.depth_timestamps} />

        {/* Bottom-right: Spatial heatmap */}
        <SpatialHeatmap
          data={dashboardData.heatmap_data}
          cameraPath={dashboardData.camera_path}
        />
      </div>
    </div>
  )
}

function DetectionsPerClass({ data }: { data: Record<string, number> }) {
  const sorted = useMemo(
    () =>
      Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, count, color: getClassColor(label) })),
    [data],
  )

  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d12] p-4">
      <div className="text-xs font-data text-white mb-3">Detections per Class</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sorted} layout="vertical" margin={{ left: 80, right: 20, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#aaa', fontSize: 10, fontFamily: 'monospace' }} axisLine={{ stroke: '#333' }} />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#aaa', fontSize: 10, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#333' }}
            width={75}
          />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#e4e4e7' }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {sorted.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function DepthHistogram({ depths }: { depths: number[] }) {
  const bins = useMemo(() => {
    if (depths.length === 0) return []
    const min = Math.min(...depths)
    const max = Math.max(...depths)
    const numBins = 30
    const binWidth = (max - min) / numBins || 1
    const counts = new Array(numBins).fill(0)
    depths.forEach((d) => {
      const idx = Math.min(Math.floor((d - min) / binWidth), numBins - 1)
      counts[idx]++
    })
    return counts.map((count, i) => ({
      depth: +(min + (i + 0.5) * binWidth).toFixed(2),
      count,
    }))
  }, [depths])

  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d12] p-4">
      <div className="text-xs font-data text-white mb-3">Depth Distribution (m)</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={bins} margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
          <XAxis
            dataKey="depth"
            tick={{ fill: '#aaa', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#333' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#aaa', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#333' }}
          />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, fontSize: 11 }}
          />
          <Bar dataKey="count" fill="#3fa7ff" opacity={0.85} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function DepthOverTime({ data }: { data: { label: string; depth: number; time_idx: number }[] }) {
  // Get top 6 classes by frequency
  const classCounts: Record<string, number> = {}
  data.forEach((d) => {
    classCounts[d.label] = (classCounts[d.label] || 0) + 1
  })
  const topClasses = Object.entries(classCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label]) => label)

  const filtered = data.filter((d) => topClasses.includes(d.label))

  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d12] p-4">
      <div className="text-xs font-data text-white mb-3">Object Depth over Time</div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis
            dataKey="time_idx"
            name="Frame"
            tick={{ fill: '#aaa', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#333' }}
          />
          <YAxis
            dataKey="depth"
            name="Depth (m)"
            tick={{ fill: '#aaa', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={{ stroke: '#333' }}
          />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, fontSize: 11 }}
          />
          <Scatter data={filtered} opacity={0.5}>
            {filtered.map((entry, i) => (
              <Cell key={i} fill={getClassColor(entry.label)} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        {topClasses.map((cls) => (
          <div key={cls} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: getClassColor(cls) }} />
            <span className="text-[10px] font-data text-[#aaa]">{cls}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpatialHeatmap({
  data,
  cameraPath,
}: {
  data: { x_bins: number[]; z_bins: number[]; counts: number[][] }
  cameraPath: { x: number; z: number }[]
}) {
  const W = 300
  const H = 220
  const PAD = 35

  if (!data?.counts || data.counts.length === 0) {
    return (
      <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d12] p-4">
        <div className="text-xs font-data text-white mb-3">Spatial Heatmap (X vs Z)</div>
        <div className="h-[220px] flex items-center justify-center text-xs text-[#52525b]">
          No spatial data available
        </div>
      </div>
    )
  }

  const maxCount = Math.max(...data.counts.flat())
  const rows = data.counts.length
  const cols = data.counts[0]?.length ?? 0
  const cellW = (W - 2 * PAD) / cols
  const cellH = (H - 2 * PAD) / rows

  // Plasma-ish color function
  const plasmaColor = (t: number): string => {
    const r = Math.round(255 * Math.min(1, 1.5 * t))
    const g = Math.round(255 * Math.sin(Math.PI * t * 0.8))
    const b = Math.round(255 * Math.max(0, 1 - 2.5 * t))
    return `rgb(${r},${g},${b})`
  }

  // Map camera path to SVG coords
  const xBins = data.x_bins
  const zBins = data.z_bins
  const xMin = xBins[0] ?? 0
  const xMax = xBins[xBins.length - 1] ?? 1
  const zMin = zBins[0] ?? 0
  const zMax = zBins[zBins.length - 1] ?? 1
  const xRange = xMax - xMin || 1
  const zRange = zMax - zMin || 1

  const sx = (x: number) => PAD + ((x - xMin) / xRange) * (W - 2 * PAD)
  const sz = (z: number) => PAD + ((z - zMin) / zRange) * (H - 2 * PAD)

  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d12] p-4">
      <div className="text-xs font-data text-white mb-3">Spatial Heatmap (X vs Z)</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Heatmap cells */}
        {data.counts.map((row, ri) =>
          row.map((count, ci) => (
            <rect
              key={`${ri}-${ci}`}
              x={PAD + ci * cellW}
              y={PAD + ri * cellH}
              width={cellW}
              height={cellH}
              fill={count > 0 ? plasmaColor(count / maxCount) : '#111'}
              opacity={0.9}
            />
          )),
        )}

        {/* Camera path overlay */}
        {cameraPath.length > 1 && (
          <polyline
            points={cameraPath.map((p) => `${sx(p.x)},${sz(p.z)}`).join(' ')}
            fill="none"
            stroke="#ff3333"
            strokeWidth={1.5}
            opacity={0.8}
          />
        )}

        {/* Axis labels */}
        <text x={W / 2} y={H - 5} fontSize={9} fill="#888" textAnchor="middle" fontFamily="monospace">
          X (m)
        </text>
        <text x={10} y={H / 2} fontSize={9} fill="#888" textAnchor="middle" fontFamily="monospace" transform={`rotate(-90, 10, ${H / 2})`}>
          Z (m)
        </text>
      </svg>
    </div>
  )
}
