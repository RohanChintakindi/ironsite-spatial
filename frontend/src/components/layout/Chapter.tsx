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
      {/* Section divider */}
      <div
        className="mb-10 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, #333 30%, #f59e0b15 50%, #333 70%, transparent)',
        }}
      />

      <div className="flex items-center gap-4 mb-2">
        <h2 className="text-2xl font-bold tracking-tight text-[#e4e4e7] scan-line">
          {title}
        </h2>
        <StatusBadge status={state.status} />
      </div>
      {subtitle && (
        <p className="text-[#a1a1aa] text-[15px] mb-8 max-w-2xl leading-relaxed">{subtitle}</p>
      )}
      <div className={clsx(!isUnlocked && !isActive && 'chapter-locked')}>
        {isUnlocked ? (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        ) : isActive ? (
          <div className="flex items-center gap-3 py-12">
            <div className="relative">
              <div className="w-5 h-5 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
              <div className="absolute inset-0 w-5 h-5 bg-[#06b6d4]/20 rounded-full blur-md" />
            </div>
            <span className="text-[#06b6d4] font-data text-sm">
              Processing... {Math.round(state.progress * 100)}%
            </span>
          </div>
        ) : (
          <div className="py-12 text-center text-[#3f3f46] text-sm">
            Waiting for previous steps to complete...
          </div>
        )}
      </div>
    </section>
  )
}
