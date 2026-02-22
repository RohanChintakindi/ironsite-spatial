import { useState } from 'react'
import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import type { SceneGraph } from '../../api/types'

export default function SceneGraphs() {
  const sceneGraphs = usePipelineStore((s) => s.sceneGraphs) as SceneGraph[] | null
  const [selectedIdx, setSelectedIdx] = useState(0)

  const current = sceneGraphs?.[selectedIdx]

  return (
    <Chapter
      step="scene_graphs"
      title="Scene Graphs"
      subtitle="Per-frame structured representations combining detections, 3D positions, spatial relations, and hand state."
    >
      {sceneGraphs && current && (
        <div className="grid grid-cols-[200px_1fr] gap-4">
          {/* Frame list */}
          <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] overflow-y-auto max-h-[500px]">
            {sceneGraphs.map((sg, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`w-full px-3 py-2.5 text-left text-xs font-data border-b border-[#1a1a1a] transition-all duration-200 ${
                  i === selectedIdx
                    ? 'bg-[#f59e0b]/8 text-[#f59e0b] border-l-2 border-l-[#f59e0b]'
                    : 'text-[#a1a1aa] hover:bg-[#111] border-l-2 border-l-transparent'
                }`}
              >
                Frame {sg.frame_index} | {sg.timestamp_str}
                <span className="ml-2 text-[#3f3f46]">{sg.num_objects} obj</span>
              </button>
            ))}
          </div>

          {/* JSON viewer */}
          <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-4 overflow-auto max-h-[500px]">
            <pre className="text-xs font-data text-[#a1a1aa] whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(current, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Chapter>
  )
}
