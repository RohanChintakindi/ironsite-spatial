import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { usePipelineStore } from '../../store/pipeline'
import FrameViz from '../viz/FrameViz'
import AnimatedNumber from '../ui/AnimatedNumber'
import StatusBadge from '../ui/StatusBadge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dinoFrameUrl, detectedFrameUrl } from '../../api/client'
import { getClassColor } from '../../api/types'
import type { SceneGraph } from '../../api/types'

export default function Detection() {
  const runId = usePipelineStore((s) => s.runId)
  const dinoData = usePipelineStore((s) => s.dinoData)
  const rawDetections = usePipelineStore((s) => s.rawDetections)
  const sceneGraphs = usePipelineStore((s) => s.sceneGraphs) as SceneGraph[] | null
  const preprocessData = usePipelineStore((s) => s.preprocessData)
  const dinoStep = usePipelineStore((s) => s.steps.dino)
  const trackingStep = usePipelineStore((s) => s.steps.tracking)
  const reconstructionStep = usePipelineStore((s) => s.steps.reconstruction)
  const sceneGraphStep = usePipelineStore((s) => s.steps.scene_graphs)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)
  const [frameIdx, setFrameIdx] = useState(0)

  const isDinoActive = dinoStep.status === 'started' || dinoStep.status === 'progress'
  const isDinoDone = dinoStep.status === 'completed'
  const isTrackingDone = trackingStep.status === 'completed'
  const isTrackingActive = trackingStep.status === 'started' || trackingStep.status === 'progress'
  const isReconDone = reconstructionStep.status === 'completed'
  const hasFullViz = sceneGraphStep.status === 'completed' && sceneGraphs && sceneGraphs.length > 0

  // Don't render anything if pipeline hasn't started or preprocess isn't done
  if (pipelineStatus === 'idle' || dinoStep.status === 'pending') return null

  // Sample 6 evenly-spaced frame indices for preview grids
  const dinoSampleIndices = useMemo(() => {
    if (!dinoData) return []
    const frames = dinoData.frames
    if (frames.length === 0) return []
    const n = Math.min(6, frames.length)
    return Array.from({ length: n }, (_, i) =>
      frames[Math.floor((i * (frames.length - 1)) / Math.max(n - 1, 1))].frame_index
    )
  }, [dinoData])

  const trackingSampleIndices = useMemo(() => {
    const total = rawDetections?.frames_tracked ?? preprocessData?.num_keyframes ?? 0
    if (total === 0) return []
    const n = Math.min(6, total)
    return Array.from({ length: n }, (_, i) => Math.floor((i * (total - 1)) / Math.max(n - 1, 1)))
  }, [rawDetections, preprocessData])

  const total = sceneGraphs?.length ?? 0
  const current = sceneGraphs?.[frameIdx]
  const prev = () => setFrameIdx((i) => Math.max(0, i - 1))
  const next = () => setFrameIdx((i) => Math.min(total - 1, i + 1))

  return (
    <section id="chapter-dino" className="min-h-[60vh] py-16 scroll-mt-14">
      {/* Section 1: DINO Detection */}
      <div className="flex items-center gap-4 mb-2">
        <h2 className="text-2xl font-semibold text-[#e4e4e7]">
          Grounding DINO Detection
        </h2>
        <StatusBadge status={dinoStep.status} />
      </div>
      <p className="text-[#a1a1aa] mb-6 max-w-2xl">
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
          className="space-y-6"
        >
          {/* DINO stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Detections</div>
              <AnimatedNumber value={dinoData.total_detections} className="text-xl text-[#e4e4e7]" />
            </div>
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Frames Detected</div>
              <AnimatedNumber value={dinoData.frames_detected} className="text-xl text-[#e4e4e7]" />
            </div>
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Classes Found</div>
              <AnimatedNumber value={dinoData.unique_labels.length} className="text-xl text-[#e4e4e7]" />
            </div>
          </div>

          {/* Class labels with colors */}
          <div className="flex flex-wrap gap-2">
            {dinoData.unique_labels.map((label) => (
              <span
                key={label}
                className="px-3 py-1 rounded-full text-xs font-data border"
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

          {/* DINO detection frame grid */}
          {runId && dinoSampleIndices.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {dinoSampleIndices.map((idx) => {
                const frameMeta = dinoData.frames.find((f) => f.frame_index === idx)
                return (
                  <div key={idx} className="relative rounded-lg overflow-hidden border border-[#222] bg-[#111]">
                    <img
                      src={dinoFrameUrl(runId, idx)}
                      alt={`DINO frame ${idx}`}
                      className="w-full aspect-video object-cover"
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                      <span className="text-xs font-data text-[#a1a1aa]">
                        t={frameMeta?.timestamp.toFixed(1)}s | {frameMeta?.num_detections ?? 0} dets
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}

      {/* Section 2: SAM2 Tracking */}
      {(isDinoDone || isTrackingDone) && (
        <div className="mt-12 pt-8 border-t border-[#222]">
          <div className="flex items-center gap-4 mb-2">
            <h2 className="text-2xl font-semibold text-[#e4e4e7]">
              SAM2 Video Tracking
            </h2>
            <StatusBadge status={trackingStep.status} />
          </div>
          <p className="text-[#a1a1aa] mb-6 max-w-2xl">
            Segment Anything 2 propagates detections across all frames with consistent object IDs.
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
              className="space-y-6"
            >
              {/* Tracking stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
                  <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Total Tracked</div>
                  <AnimatedNumber value={rawDetections.total_detections} className="text-xl text-[#e4e4e7]" />
                </div>
                <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
                  <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Unique Objects</div>
                  <AnimatedNumber value={rawDetections.unique_objects} className="text-xl text-[#e4e4e7]" />
                </div>
                <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
                  <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">All Frames</div>
                  <AnimatedNumber value={rawDetections.frames_tracked} className="text-xl text-[#e4e4e7]" />
                </div>
              </div>

              {/* SAM2 tracked frame grid */}
              {runId && trackingSampleIndices.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {trackingSampleIndices.map((idx) => {
                    const frameMeta = rawDetections.frames[idx]
                    return (
                      <div key={idx} className="relative rounded-lg overflow-hidden border border-[#222] bg-[#111]">
                        <img
                          src={detectedFrameUrl(runId, idx)}
                          alt={`Tracked frame ${idx}`}
                          className="w-full aspect-video object-cover"
                          loading="lazy"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
                          <span className="text-xs font-data text-[#a1a1aa]">
                            t={frameMeta?.timestamp.toFixed(1)}s | {frameMeta?.num_detections ?? 0} tracked
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* Section 3: 3D-Fused Frame Explorer */}
      {isReconDone && (
        <div className="mt-12 pt-8 border-t border-[#222]">
          <div className="flex items-center gap-4 mb-2">
            <h2 className="text-2xl font-semibold text-[#e4e4e7]">
              3D-Fused Frame Explorer
            </h2>
            <StatusBadge status={sceneGraphStep.status} />
          </div>
          <p className="text-[#a1a1aa] mb-6 max-w-2xl">
            Detections enriched with VGGT-X metric depth and COLMAP world coordinates.
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

              <FrameViz frameIndex={frameIdx} sceneGraph={current} />
            </motion.div>
          )}
        </div>
      )}
    </section>
  )
}
