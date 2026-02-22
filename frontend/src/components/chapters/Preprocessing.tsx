import { useState } from 'react'
import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import { frameUrl } from '../../api/client'
import AnimatedNumber from '../ui/AnimatedNumber'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function Preprocessing() {
  const runId = usePipelineStore((s) => s.runId)
  const data = usePipelineStore((s) => s.preprocessData)
  const [frameIdx, setFrameIdx] = useState(0)

  const totalFrames = data?.num_keyframes ?? 0
  const prev = () => setFrameIdx((i) => Math.max(0, i - 1))
  const next = () => setFrameIdx((i) => Math.min(totalFrames - 1, i + 1))

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
          <div className="grid grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Keyframes', value: data.num_keyframes },
              { label: 'FPS', value: data.fps, decimals: 1 },
              { label: 'Resolution', value: 0, custom: `${data.width}x${data.height}` },
              { label: 'Duration', value: 0, custom: `${formatTimestamp(data.duration)}` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#111] rounded-lg p-5 border border-[#222]"
              >
                <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">
                  {stat.label}
                </div>
                <div className="text-2xl text-[#e4e4e7]">
                  {stat.custom ? (
                    <span className="font-data">{stat.custom}</span>
                  ) : (
                    <AnimatedNumber
                      value={stat.value}
                      decimals={stat.decimals ?? 0}
                      className="text-2xl text-[#e4e4e7]"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Large single-frame viewer with navigation */}
          <div className="relative rounded-xl overflow-hidden border border-[#222] bg-[#111]">
            <img
              src={frameUrl(runId, frameIdx)}
              alt={`Undistorted keyframe ${frameIdx}`}
              className="w-full aspect-video object-contain bg-black"
            />
            {/* Timestamp badge */}
            <div className="absolute top-4 right-4 bg-[#0a0a0f]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="font-data text-sm text-[#f59e0b]">
                t={formatTimestamp(data.timestamps[frameIdx] ?? 0)}
              </span>
            </div>
            {/* Frame counter */}
            <div className="absolute bottom-4 left-4 bg-[#0a0a0f]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <span className="font-data text-sm text-[#a1a1aa]">
                Frame {frameIdx + 1} / {totalFrames}
              </span>
            </div>
          </div>

          {/* Navigation controls */}
          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={prev}
              disabled={frameIdx === 0}
              className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <input
                type="range"
                min={0}
                max={totalFrames - 1}
                value={frameIdx}
                onChange={(e) => setFrameIdx(Number(e.target.value))}
                className="w-full accent-[#f59e0b]"
              />
            </div>
            <button
              onClick={next}
              disabled={frameIdx >= totalFrames - 1}
              className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </>
      )}
    </Chapter>
  )
}
