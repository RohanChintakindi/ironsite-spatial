import { usePipelineStore, STEP_ORDER, STEP_LABELS, type StepName } from '../../store/pipeline'
import {
  Video,
  ScanSearch,
  Box,
  Network,
  Share2,
  Brain,
  Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import ProgressRing from '../ui/ProgressRing'
import type { LucideIcon } from 'lucide-react'

const STEP_ICONS: Record<StepName, LucideIcon> = {
  preprocess: Video,
  detection: ScanSearch,
  reconstruction: Box,
  scene_graphs: Network,
  graph: Share2,
  memory: Brain,
  vlm: Sparkles,
}

export default function Sidebar() {
  const steps = usePipelineStore((s) => s.steps)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  if (pipelineStatus === 'idle') return null

  const scrollTo = (step: StepName) => {
    const el = document.getElementById(`chapter-${step}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-56 border-r border-[#222] bg-[#0a0a0f]/95 backdrop-blur-sm z-40 overflow-y-auto">
      <nav className="py-6 px-4 flex flex-col gap-1">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm',
                isDone && 'cursor-pointer hover:bg-[#1a1a1a]',
                isActive && 'bg-[#1a1a1a]',
                !isDone && !isActive && 'opacity-40 cursor-default',
              )}
            >
              <div className="relative flex-shrink-0">
                <ProgressRing size={32} progress={state.progress} active={isActive} done={isDone} />
                <Icon
                  className={clsx(
                    'absolute inset-0 m-auto w-4 h-4',
                    isDone ? 'text-[#f59e0b]' : isActive ? 'text-[#06b6d4]' : 'text-[#52525b]',
                  )}
                />
              </div>
              <span
                className={clsx(
                  'truncate',
                  isDone ? 'text-[#e4e4e7]' : isActive ? 'text-[#06b6d4]' : 'text-[#52525b]',
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
