import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import AnimatedNumber from '../ui/AnimatedNumber'
import { Download } from 'lucide-react'

export default function Summary() {
  const runId = usePipelineStore((s) => s.runId)
  const preprocessData = usePipelineStore((s) => s.preprocessData)
  const sceneGraphs = usePipelineStore((s) => s.sceneGraphs)
  const trajectoryData = usePipelineStore((s) => s.trajectoryData)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  if (pipelineStatus !== 'completed') return null

  const totalObjects = sceneGraphs?.reduce((sum, sg) => sum + sg.num_objects, 0) ?? 0

  return (
    <section className="py-16 border-t border-[#222] mt-8">
      <h2 className="text-2xl font-semibold text-[#e4e4e7] mb-2">Pipeline Complete</h2>
      <p className="text-[#a1a1aa] mb-8">
        Full spatial awareness pipeline finished successfully.
      </p>

      {/* Final stats grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Keyframes" value={preprocessData?.num_keyframes ?? 0} />
        <StatCard label="Objects Tracked" value={totalObjects} />
        <StatCard label="3D Points" value={30000} suffix="+" />
        <StatCard
          label="Distance"
          value={trajectoryData?.total_distance ?? 0}
          decimals={1}
          suffix="m"
        />
      </div>

      {/* Export buttons */}
      <div className="flex gap-3">
        <ExportButton
          label="Scene Graphs"
          href={`/api/results/${runId}/scene-graphs`}
          filename="scene_graphs.json"
        />
        <ExportButton
          label="Point Cloud"
          href={`/api/results/${runId}/pointcloud`}
          filename="pointcloud.bin"
        />
        <ExportButton
          label="Dashboard Data"
          href={`/api/results/${runId}/dashboard-data`}
          filename="dashboard.json"
        />
      </div>
    </section>
  )
}

function StatCard({
  label,
  value,
  decimals = 0,
  suffix = '',
}: {
  label: string
  value: number
  decimals?: number
  suffix?: string
}) {
  return (
    <div className="bg-[#111] rounded-lg p-5 border border-[#222] text-center">
      <div className="text-xs text-[#52525b] uppercase tracking-wider mb-2">{label}</div>
      <AnimatedNumber
        value={value}
        decimals={decimals}
        suffix={suffix}
        className="text-3xl text-[#f59e0b]"
      />
    </div>
  )
}

function ExportButton({
  label,
  href,
  filename,
}: {
  label: string
  href: string
  filename: string
}) {
  return (
    <a
      href={href}
      download={filename}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111] border border-[#222] text-sm text-[#a1a1aa] hover:text-[#e4e4e7] hover:border-[#333] transition-colors"
    >
      <Download className="w-4 h-4" />
      {label}
    </a>
  )
}
