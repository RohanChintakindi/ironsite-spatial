import clsx from 'clsx'

interface ProgressRingProps {
  size: number
  progress: number
  active?: boolean
  done?: boolean
}

export default function ProgressRing({ size, progress, active, done }: ProgressRingProps) {
  const stroke = 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius

  const color = done ? '#f59e0b' : active ? '#06b6d4' : '#2a2a2a'

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      {/* Glow filter */}
      {(active || done) && (
        <defs>
          <filter id={`glow-${active ? 'cyan' : 'amber'}`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1a1a1a"
        strokeWidth={stroke}
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={clsx(active && 'transition-all duration-300')}
        filter={(active || done) ? `url(#glow-${active ? 'cyan' : 'amber'})` : undefined}
      />
    </svg>
  )
}
