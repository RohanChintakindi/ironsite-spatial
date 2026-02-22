import { useState } from 'react'
import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import FrameViz from '../viz/FrameViz'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { SceneGraph } from '../../api/types'

export default function Detection() {
  const sceneGraphs = usePipelineStore((s) => s.sceneGraphs) as SceneGraph[] | null
  const [frameIdx, setFrameIdx] = useState(0)

  const total = sceneGraphs?.length ?? 0
  const current = sceneGraphs?.[frameIdx]

  const prev = () => setFrameIdx((i) => Math.max(0, i - 1))
  const next = () => setFrameIdx((i) => Math.min(total - 1, i + 1))

  return (
    <Chapter
      step="scene_graphs"
      title="Object Detection & 3D Fusion"
      subtitle="DINO detections tracked with SAM2, fused with VGGT-X depth and COLMAP world coordinates."
    >
      {current && (
        <div>
          {/* Frame scrubber */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={prev}
              disabled={frameIdx === 0}
              className="p-2 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
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
              onClick={next}
              disabled={frameIdx >= total - 1}
              className="p-2 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="font-data text-xs text-[#52525b] w-24 text-right">
              {frameIdx + 1} / {total}
            </span>
          </div>

          {/* 3-panel viz */}
          <FrameViz frameIndex={frameIdx} sceneGraph={current} />
        </div>
      )}
    </Chapter>
  )
}
