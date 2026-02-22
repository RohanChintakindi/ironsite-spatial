import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { usePipelineStore } from '../../store/pipeline'
import AnimatedNumber from '../ui/AnimatedNumber'
import StatusBadge from '../ui/StatusBadge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dinoFrameUrl, detectedFrameUrl } from '../../api/client'
import { getClassColor } from '../../api/types'

export default function Detection() {
  const runId = usePipelineStore((s) => s.runId)
  const dinoData = usePipelineStore((s) => s.dinoData)
  const rawDetections = usePipelineStore((s) => s.rawDetections)
  const preprocessData = usePipelineStore((s) => s.preprocessData)
  const dinoStep = usePipelineStore((s) => s.steps.dino)
  const trackingStep = usePipelineStore((s) => s.steps.tracking)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)
  const [dinoIdx, setDinoIdx] = useState(0)
  const [trackIdx, setTrackIdx] = useState(0)

  const isDinoActive = dinoStep.status === 'started' || dinoStep.status === 'progress'
  const isDinoDone = dinoStep.status === 'completed'
  const isTrackingDone = trackingStep.status === 'completed'
  const isTrackingActive = trackingStep.status === 'started' || trackingStep.status === 'progress'

  // All hooks MUST be above any early return (React Rules of Hooks)
  const dinoFrameIndices = useMemo(() => {
    if (!dinoData) return []
    return dinoData.frames.map((f) => f.frame_index)
  }, [dinoData])

  const trackingTotal = rawDetections?.frames_tracked ?? preprocessData?.num_keyframes ?? 0

  // Don't render anything if pipeline hasn't started or dino hasn't begun
  if (pipelineStatus === 'idle' || dinoStep.status === 'pending') return null

  const dinoTotal = dinoFrameIndices.length
  const currentDinoFrame = dinoData?.frames.find((f) => f.frame_index === dinoFrameIndices[dinoIdx])
  const currentTrackFrame = rawDetections?.frames[trackIdx]

  return (
    <section id="chapter-dino" className="py-16 scroll-mt-14 space-y-20">
      {/* ─── Section 1: DINO Detection ─── */}
      <div>
        <div className="flex items-center gap-4 mb-2">
          <h2 className="text-2xl font-semibold text-[#e4e4e7]">
            Grounding DINO Detection
          </h2>
          <StatusBadge status={dinoStep.status} />
        </div>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          Zero-shot object detection using Grounding DINO — finds construction objects without any training.
        </p>

        {isDinoActive && (
          <div className="flex items-center gap-3 py-8">
            <div className="w-5 h-5 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#06b6d4] font-data text-sm">
              Running Grounding DINO... {Math.round(dinoStep.progress * 100)}%
            </span>
          </div>
        )}

        {isDinoDone && dinoData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-8"
          >
            {/* DINO stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
                <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Detections</div>
                <AnimatedNumber value={dinoData.total_detections} className="text-2xl text-[#e4e4e7]" />
              </div>
              <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
                <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Frames Detected</div>
                <AnimatedNumber value={dinoData.frames_detected} className="text-2xl text-[#e4e4e7]" />
              </div>
              <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
                <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Classes Found</div>
                <AnimatedNumber value={dinoData.unique_labels.length} className="text-2xl text-[#e4e4e7]" />
              </div>
            </div>

            {/* Class labels with colors */}
            <div className="flex flex-wrap gap-2">
              {dinoData.unique_labels.map((label) => (
                <span
                  key={label}
                  className="px-3 py-1.5 rounded-full text-xs font-data border"
                  style={{
                    borderColor: getClassColor(label),
                    color: getClassColor(label),
                    backgroundColor: `${getClassColor(label).replace('rgb', 'rgba').replace(')', ',0.1)')}`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Large DINO frame viewer */}
            {runId && dinoTotal > 0 && (
              <div>
                <div className="relative rounded-xl overflow-hidden border border-[#222] bg-[#111]">
                  <img
                    src={dinoFrameUrl(runId, dinoFrameIndices[dinoIdx])}
                    alt={`DINO frame ${dinoFrameIndices[dinoIdx]}`}
                    className="w-full aspect-video object-contain bg-black"
                  />
                  <div className="absolute top-4 right-4 bg-[#0a0a0f]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                    <span className="font-data text-sm text-[#f59e0b]">
                      t={currentDinoFrame?.timestamp.toFixed(1)}s
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4 bg-[#0a0a0f]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                    <span className="font-data text-sm text-[#a1a1aa]">
                      {currentDinoFrame?.num_detections ?? 0} detections | Frame {dinoIdx + 1} / {dinoTotal}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4">
                  <button
                    onClick={() => setDinoIdx((i) => Math.max(0, i - 1))}
                    disabled={dinoIdx === 0}
                    className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex-1">
                    <input
                      type="range"
                      min={0}
                      max={dinoTotal - 1}
                      value={dinoIdx}
                      onChange={(e) => setDinoIdx(Number(e.target.value))}
                      className="w-full accent-[#f59e0b]"
                    />
                  </div>
                  <button
                    onClick={() => setDinoIdx((i) => Math.min(dinoTotal - 1, i + 1))}
                    disabled={dinoIdx >= dinoTotal - 1}
                    className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* ─── Section 2: SAM2 Tracking ─── */}
      {(isDinoDone || isTrackingDone) && (
        <div className="pt-8 border-t border-[#222]">
          <div className="flex items-center gap-4 mb-2">
            <h2 className="text-2xl font-semibold text-[#e4e4e7]">
              SAM2 Video Tracking
            </h2>
            <StatusBadge status={trackingStep.status} />
          </div>
          <p className="text-[#a1a1aa] mb-8 max-w-2xl">
            Segment Anything 2 propagates detections across all frames with consistent object IDs and colored segmentation masks.
          </p>

          {isTrackingActive && (
            <div className="flex items-center gap-3 py-8">
              <div className="w-5 h-5 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
              <span className="text-[#06b6d4] font-data text-sm">
                Tracking objects across video... {Math.round(trackingStep.progress * 100)}%
              </span>
            </div>
          )}

          {isTrackingDone && rawDetections && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-8"
            >
              {/* Tracking stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
                  <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Total Tracked</div>
                  <AnimatedNumber value={rawDetections.total_detections} className="text-2xl text-[#e4e4e7]" />
                </div>
                <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
                  <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Unique Objects</div>
                  <AnimatedNumber value={rawDetections.unique_objects} className="text-2xl text-[#e4e4e7]" />
                </div>
                <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
                  <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">All Frames</div>
                  <AnimatedNumber value={rawDetections.frames_tracked} className="text-2xl text-[#e4e4e7]" />
                </div>
              </div>

              {/* Large SAM2 frame viewer */}
              {runId && trackingTotal > 0 && (
                <div>
                  <div className="relative rounded-xl overflow-hidden border border-[#222] bg-[#111]">
                    <img
                      src={detectedFrameUrl(runId, trackIdx)}
                      alt={`Tracked frame ${trackIdx}`}
                      className="w-full aspect-video object-contain bg-black"
                    />
                    <div className="absolute top-4 right-4 bg-[#0a0a0f]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                      <span className="font-data text-sm text-[#06b6d4]">
                        t={currentTrackFrame?.timestamp.toFixed(1)}s
                      </span>
                    </div>
                    <div className="absolute bottom-4 left-4 bg-[#0a0a0f]/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                      <span className="font-data text-sm text-[#a1a1aa]">
                        {currentTrackFrame?.num_detections ?? 0} tracked | Frame {trackIdx + 1} / {trackingTotal}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4">
                    <button
                      onClick={() => setTrackIdx((i) => Math.max(0, i - 1))}
                      disabled={trackIdx === 0}
                      className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1">
                      <input
                        type="range"
                        min={0}
                        max={trackingTotal - 1}
                        value={trackIdx}
                        onChange={(e) => setTrackIdx(Number(e.target.value))}
                        className="w-full accent-[#06b6d4]"
                      />
                    </div>
                    <button
                      onClick={() => setTrackIdx((i) => Math.min(trackingTotal - 1, i + 1))}
                      disabled={trackIdx >= trackingTotal - 1}
                      className="p-2.5 rounded-lg bg-[#111] border border-[#222] text-[#a1a1aa] hover:text-[#e4e4e7] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </section>
  )
}
