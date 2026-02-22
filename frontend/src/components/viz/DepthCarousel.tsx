import { usePipelineStore } from '../../store/pipeline'
import { depthFrameUrl } from '../../api/client'

export default function DepthCarousel() {
  const runId = usePipelineStore((s) => s.runId)
  const data = usePipelineStore((s) => s.preprocessData)

  if (!runId || !data) return null

  const count = Math.min(data.num_keyframes, 8)

  return (
    <div className="scroll-x flex gap-4 pb-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex-shrink-0 rounded-lg overflow-hidden border border-[#222] bg-[#111]"
        >
          <img
            src={depthFrameUrl(runId, i)}
            alt={`Depth map ${i}`}
            className="h-48 w-auto object-contain"
            loading="lazy"
          />
          <div className="px-3 py-2 text-xs text-[#52525b] font-data">
            {String(i).padStart(6, '0')}.jpg
          </div>
        </div>
      ))}
    </div>
  )
}
