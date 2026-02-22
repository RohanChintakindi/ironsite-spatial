import clsx from 'clsx'
import type { StepStatusType } from '../../api/types'

const BADGE_STYLES: Record<StepStatusType, { bg: string; text: string; label: string; glow?: string }> = {
  pending: { bg: 'bg-[#1a1a1a]', text: 'text-[#3f3f46]', label: 'WAITING' },
  started: { bg: 'bg-cyan-900/20', text: 'text-[#06b6d4]', label: 'RUNNING', glow: 'shadow-[0_0_8px_rgba(6,182,212,0.2)]' },
  progress: { bg: 'bg-cyan-900/20', text: 'text-[#06b6d4]', label: 'RUNNING', glow: 'shadow-[0_0_8px_rgba(6,182,212,0.2)]' },
  completed: { bg: 'bg-amber-900/15', text: 'text-[#f59e0b]', label: 'DONE', glow: 'shadow-[0_0_6px_rgba(245,158,11,0.15)]' },
  error: { bg: 'bg-red-900/15', text: 'text-red-400', label: 'ERROR', glow: 'shadow-[0_0_6px_rgba(248,113,113,0.15)]' },
}

interface StatusBadgeProps {
  status: StepStatusType
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = BADGE_STYLES[status]
  const isRunning = status === 'started' || status === 'progress'

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-data font-semibold tracking-wider border',
        style.bg,
        style.text,
        style.glow,
        isRunning && 'animate-status-pulse border-cyan-800/30',
        status === 'completed' && 'border-amber-800/20',
        status === 'error' && 'border-red-800/20',
        status === 'pending' && 'border-[#222]',
      )}
    >
      {isRunning && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
      )}
      {style.label}
    </span>
  )
}
