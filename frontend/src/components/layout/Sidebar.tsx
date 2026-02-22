import { usePipelineStore, STEP_ORDER, STEP_LABELS, type StepName } from '../../store/pipeline'
import {
  Video,
  ScanSearch,
  Crosshair,
  Box,
  Network,
  Share2,
  Activity,
  Brain,
  Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import ProgressRing from '../ui/ProgressRing'
import type { LucideIcon } from 'lucide-react'

const STEP_ICONS: Record<StepName, LucideIcon> = {
  preprocess: Video,
  dino: ScanSearch,
  tracking: Crosshair,
  reconstruction: Box,
  scene_graphs: Network,
  graph: Share2,
  events: Activity,
  memory: Brain,
  vlm: Sparkles,
}

export default function Sidebar() {
  const steps = usePipelineStore((s) => s.steps)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  if (pipelineStatus === 'idle') return null

  const scrollTo = (step: StepName) => {
    // tracking shares the same section as dino
    const scrollId = step === 'tracking' ? 'chapter-dino' : `chapter-${step}`
    const el = document.getElementById(scrollId)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside
      className="fixed left-0 top-14 bottom-0 w-56 bg-[#0a0a0f]/95 backdrop-blur-md z-40 overflow-y-auto"
      style={{
        borderRight: '1px solid transparent',
        borderImage: 'linear-gradient(180deg, #333, #f59e0b10 50%, #333 80%, transparent) 1',
      }}
    >
      <nav className="py-6 px-3 flex flex-col gap-0.5">
        {STEP_ORDER.map((step) => {
          const Icon = STEP_ICONS[step]
          const state = steps[step]
          const isActive = state.status === 'started' || state.status === 'progress'
          const isDone = state.status === 'completed'

          return (
            <button
              key={step}
              onClick={() => isDone && scrollTo(step)}
              className={clsx(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 text-sm',
                isDone && 'cursor-pointer hover:bg-[#f59e0b]/5',
                isActive && 'bg-[#06b6d4]/5',
                !isDone && !isActive && 'opacity-30 cursor-default',
              )}
            >
              <div className="relative flex-shrink-0">
                <ProgressRing size={30} progress={state.progress} active={isActive} done={isDone} />
                <Icon
                  className={clsx(
                    'absolute inset-0 m-auto w-3.5 h-3.5 transition-colors duration-200',
                    isDone
                      ? 'text-[#f59e0b] group-hover:text-[#fbbf24]'
                      : isActive
                        ? 'text-[#06b6d4]'
                        : 'text-[#3f3f46]',
                  )}
                />
              </div>
              <span
                className={clsx(
                  'truncate text-[13px] transition-colors duration-200',
                  isDone
                    ? 'text-[#d4d4d8] group-hover:text-[#e4e4e7]'
                    : isActive
                      ? 'text-[#06b6d4]'
                      : 'text-[#3f3f46]',
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
