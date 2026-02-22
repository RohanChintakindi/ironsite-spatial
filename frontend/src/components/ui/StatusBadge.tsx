import clsx from 'clsx'
import type { StepStatusType } from '../../api/types'

const BADGE_STYLES: Record<StepStatusType, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-[#1a1a1a]', text: 'text-[#52525b]', label: 'WAITING' },
  started: { bg: 'bg-cyan-900/30', text: 'text-[#06b6d4]', label: 'RUNNING' },
  progress: { bg: 'bg-cyan-900/30', text: 'text-[#06b6d4]', label: 'RUNNING' },
  completed: { bg: 'bg-amber-900/20', text: 'text-[#f59e0b]', label: 'DONE' },
  error: { bg: 'bg-red-900/20', text: 'text-red-400', label: 'ERROR' },
}

interface StatusBadgeProps {
  status: StepStatusType
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = BADGE_STYLES[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-data font-semibold tracking-wider',
        style.bg,
        style.text,
      )}
    >
      {style.label}
    </span>
  )
}
