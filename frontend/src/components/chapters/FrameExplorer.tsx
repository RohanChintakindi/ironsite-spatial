import { useState } from 'react'
import { motion } from 'framer-motion'
import { usePipelineStore } from '../../store/pipeline'
import FrameViz from '../viz/FrameViz'
import StatusBadge from '../ui/StatusBadge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { SceneGraph } from '../../api/types'

export default function FrameExplorer() {
  const sceneGraphs = usePipelineStore((s) => s.sceneGraphs) as SceneGraph[] | null
  const sceneGraphStep = usePipelineStore((s) => s.steps.scene_graphs)
  const reconstructionStep = usePipelineStore((s) => s.steps.reconstruction)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)
  const [frameIdx, setFrameIdx] = useState(0)

  const isReconDone = reconstructionStep.status === 'completed'
  const hasFullViz = sceneGraphStep.status === 'completed' && sceneGraphs && sceneGraphs.length > 0
  const total = sceneGraphs?.length ?? 0
  const current = sceneGraphs?.[frameIdx]

  // Only show after reconstruction is done
  if (pipelineStatus === 'idle' || !isReconDone) return null

  return (
    <section id="chapter-scene_graphs" className="py-16 scroll-mt-14">
      <div className="flex items-center gap-4 mb-2">
        <h2 className="text-2xl font-semibold text-[#e4e4e7]">
          3D-Fused Frame Explorer
        </h2>
        <StatusBadge status={sceneGraphStep.status} />
      </div>
      <p className="text-[#a1a1aa] mb-8 max-w-2xl">
        Detections enriched with VGGT-X metric depth and COLMAP world coordinates. Each frame shows annotated RGB, depth map with overlays, and a top-down spatial view.
      </p>

      {!hasFullViz && (
        <div className="flex items-center gap-3 py-8">
          <div className="w-5 h-5 border-2 border-[#52525b] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#52525b] text-sm">
            Building scene graphs with 3D coordinates...
          </span>
        </div>
      )}

      {hasFullViz && current && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Frame scrubber */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setFrameIdx((i) => Math.max(0, i - 1))}
              disabled={frameIdx === 0}
              className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                className="w-full accent-[#f59e0b]"
              />
            </div>
            <button
              onClick={() => setFrameIdx((i) => Math.min(total - 1, i + 1))}
              disabled={frameIdx >= total - 1}
              className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="font-data text-sm text-[#52525b] w-28 text-right">
              {frameIdx + 1} / {total}
            </span>
          </div>

          <FrameViz frameIndex={frameIdx} sceneGraph={current} />
        </motion.div>
      )}
    </section>
  )
}
