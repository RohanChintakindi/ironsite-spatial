import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import { frameUrl } from '../../api/client'
import AnimatedNumber from '../ui/AnimatedNumber'

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Preprocessing() {
  const runId = usePipelineStore((s) => s.runId)
  const data = usePipelineStore((s) => s.preprocessData)

  return (
    <Chapter
      step="preprocess"
      title="Video Preprocessing"
      subtitle={
        data
          ? `Extracted ${data.num_keyframes} keyframes from body camera footage, correcting for fisheye lens distortion.`
          : undefined
      }
    >
      {data && runId && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Keyframes', value: data.num_keyframes },
              { label: 'FPS', value: data.fps, decimals: 1 },
              { label: 'Resolution', value: 0, custom: `${data.width}x${data.height}` },
              { label: 'Duration', value: 0, custom: `${formatTimestamp(data.duration)}` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#111] rounded-lg p-4 border border-[#222]"
              >
                <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">
                  {stat.label}
                </div>
                <div className="text-xl text-[#e4e4e7]">
                  {stat.custom ? (
                    <span className="font-data">{stat.custom}</span>
                  ) : (
                    <AnimatedNumber
                      value={stat.value}
                      decimals={stat.decimals ?? 0}
                      className="text-xl text-[#e4e4e7]"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Keyframe gallery */}
          <div className="scroll-x flex gap-4 pb-4">
            {data.timestamps.slice(0, 8).map((ts, i) => (
              <div
                key={i}
                className="flex-shrink-0 rounded-lg overflow-hidden border border-[#222] bg-[#111] group"
              >
                <div className="relative">
                  <img
                    src={frameUrl(runId, i)}
                    alt={`Keyframe ${i}`}
                    className="h-48 w-auto object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-2 right-2 bg-[#0a0a0f]/80 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-data text-[#f59e0b]">
                    t={formatTimestamp(ts)}
                  </div>
                </div>
                <div className="px-3 py-2 text-xs text-[#52525b] font-data">
                  Frame {i}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Chapter>
  )
}
