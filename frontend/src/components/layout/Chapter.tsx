import { motion } from 'framer-motion'
import clsx from 'clsx'
import type { StepName } from '../../store/pipeline'
import { usePipelineStore } from '../../store/pipeline'
import StatusBadge from '../ui/StatusBadge'

interface ChapterProps {
  step: StepName
  title: string
  subtitle?: string
  children: React.ReactNode
}

export default function Chapter({ step, title, subtitle, children }: ChapterProps) {
  const state = usePipelineStore((s) => s.steps[step])
  const isUnlocked = state.status === 'completed'
  const isActive = state.status === 'started' || state.status === 'progress'

  return (
    <section
      id={`chapter-${step}`}
      className="min-h-[60vh] py-16 scroll-mt-14"
    >
      <div className="flex items-center gap-4 mb-8">
        <h2 className="text-2xl font-semibold text-[#e4e4e7]">{title}</h2>
        <StatusBadge status={state.status} />
      </div>
      {subtitle && (
        <p className="text-[#a1a1aa] mb-6 max-w-2xl">{subtitle}</p>
      )}
      <div className={clsx(!isUnlocked && !isActive && 'chapter-locked')}>
        {isUnlocked ? (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        ) : isActive ? (
          <div className="flex items-center gap-3 py-12">
            <div className="w-5 h-5 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#06b6d4] font-data text-sm">
              Processing... {Math.round(state.progress * 100)}%
            </span>
          </div>
        ) : (
          <div className="py-12 text-center text-[#52525b]">
            Waiting for previous steps to complete...
          </div>
        )}
      </div>
    </section>
  )
}
