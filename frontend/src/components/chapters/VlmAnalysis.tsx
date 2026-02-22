import { useState } from 'react'
import { motion } from 'framer-motion'
import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import AnimatedNumber from '../ui/AnimatedNumber'
import {
  Sparkles,
  Activity,
  Clock,
  Route,
  Box,
  Wrench,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Zap,
  Eye,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACTIVITY_COLORS: Record<string, string> = {
  production: '#22c55e',
  prep: '#f59e0b',
  downtime: '#ef4444',
  standby: '#6b7280',
}

const ACTIVITY_LABELS: Record<string, string> = {
  production: 'Production',
  prep: 'Prep',
  downtime: 'Downtime',
  standby: 'Standby',
}

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' as const },
  },
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.14 } },
}

/* ------------------------------------------------------------------ */
/*  SectionLabel — centered divider with title                         */
/* ------------------------------------------------------------------ */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-6">
      <div className="h-px flex-1 bg-gradient-to-r from-[#1a1a2e] to-transparent" />
      <span className="text-[10px] uppercase tracking-[0.25em] text-[#52525b] font-data shrink-0">
        {children}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-[#1a1a2e] to-transparent" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  EfficiencyRing — double-ring SVG with gradient stroke & glow       */
/* ------------------------------------------------------------------ */

function EfficiencyRing({ score }: { score: number }) {
  const size = 156
  const cx = size / 2
  const strokeW = 7
  const r = cx - strokeW - 12
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(100, score) / 100)

  const color =
    score >= 80
      ? '#22c55e'
      : score >= 60
        ? '#f59e0b'
        : score >= 40
          ? '#3b82f6'
          : '#ef4444'

  const colorDim =
    score >= 80
      ? '#166534'
      : score >= 60
        ? '#92400e'
        : score >= 40
          ? '#1e3a5f'
          : '#7f1d1d'

  const label =
    score >= 80
      ? 'Excellent'
      : score >= 60
        ? 'Good'
        : score >= 40
          ? 'Moderate'
          : 'Low'

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient
            id="eff-ring-grad"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={colorDim} />
          </linearGradient>
          <filter id="eff-ring-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Decorative outer dashed ring */}
        <circle
          cx={cx}
          cy={cx}
          r={r + 14}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.12}
          strokeDasharray="3 10"
        />

        {/* Track ring */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={strokeW}
        />

        {/* Score arc */}
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <motion.circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="url(#eff-ring-grad)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{
              duration: 1.8,
              ease: [0.16, 1, 0.3, 1],
              delay: 0.4,
            }}
            style={{ filter: 'url(#eff-ring-glow)' }}
          />
        </g>
      </svg>

      <div className="text-center z-10">
        <p
          className="font-data font-bold leading-none"
          style={{ color, fontSize: '2.1rem' }}
        >
          <AnimatedNumber value={Math.round(score)} duration={1400} />
        </p>
        <p className="text-[9px] text-[#52525b] uppercase tracking-[0.18em] mt-1.5">
          {label}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TimeBreakdownBar — animated horizontal stacked bar                 */
/* ------------------------------------------------------------------ */

function TimeBreakdownBar({
  production,
  prep,
  downtime,
  standby,
}: {
  production: number
  prep: number
  downtime: number
  standby: number
}) {
  const segments = [
    { key: 'production', pct: production, color: ACTIVITY_COLORS.production },
    { key: 'prep', pct: prep, color: ACTIVITY_COLORS.prep },
    { key: 'downtime', pct: downtime, color: ACTIVITY_COLORS.downtime },
    { key: 'standby', pct: standby, color: ACTIVITY_COLORS.standby },
  ]

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[#0d0d14]">
        {segments.map((s) =>
          s.pct > 0.5 ? (
            <motion.div
              key={s.key}
              initial={{ width: 0 }}
              animate={{ width: `${s.pct}%` }}
              transition={{
                duration: 1.2,
                ease: [0.16, 1, 0.3, 1],
                delay: 0.6,
              }}
              style={{ backgroundColor: s.color, opacity: 0.9 }}
            />
          ) : null,
        )}
      </div>
      <div className="flex gap-5 mt-3">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-[3px]"
              style={{ backgroundColor: s.color, opacity: 0.9 }}
            />
            <span className="text-[10px] text-[#71717a]">
              {ACTIVITY_LABELS[s.key]}
            </span>
            <span className="text-[11px] font-data text-[#a1a1aa]">
              {s.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PPEBar — animated progress bar                                     */
/* ------------------------------------------------------------------ */

function PPEBar({ label, pct }: { label: string; pct: number }) {
  const color =
    pct > 70 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-[#71717a] w-16 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-2 bg-[#0d0d14] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: 1,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.8,
          }}
          style={{ backgroundColor: color }}
        />
      </div>
      <span
        className="text-[11px] font-data w-12 text-right"
        style={{ color }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  StatPill — metric with colored left accent                         */
/* ------------------------------------------------------------------ */

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Clock
  label: string
  value: string
  accent?: string
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-[#0a0a12] rounded-lg border border-[#1a1a2e] hover:border-[#2a2a3e] transition-colors"
      style={
        accent
          ? { borderLeftWidth: 2, borderLeftColor: accent }
          : undefined
      }
    >
      <Icon className="w-4 h-4 text-[#3f3f50]" />
      <div className="flex flex-col min-w-0">
        <span className="text-[9px] uppercase tracking-[0.15em] text-[#52525b]">
          {label}
        </span>
        <span className="text-sm font-data text-[#e4e4e7] -mt-0.5">
          {value}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function VlmAnalysis() {
  const vlmData = usePipelineStore((s) => s.vlmData)
  const eventsData = usePipelineStore((s) => s.eventsData)
  const [showRaw, setShowRaw] = useState(false)

  if (!vlmData) {
    return (
      <Chapter
        step="vlm"
        title="Site Intelligence Report"
        subtitle="Executive summary synthesizing all pipeline data into actionable construction site insights."
      >
        {null}
      </Chapter>
    )
  }

  /* --- Detect mode ------------------------------------------------ */
  const analysis = (vlmData.analysis ?? {}) as Record<string, unknown>
  const isVlmMode =
    'summary' in analysis && typeof analysis.summary === 'object'
  const skipped = vlmData.skipped === true || !isVlmMode

  /* --- Normalize percentages -------------------------------------- */
  const productionPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.production_pct ?? 0)
    : ((analysis.production_pct as number) ??
      eventsData?.stats.production_pct ??
      0)
  const prepPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.prep_pct ?? 0)
    : ((analysis.prep_pct as number) ?? eventsData?.stats.prep_pct ?? 0)
  const downtimePct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.downtime_pct ?? 0)
    : ((analysis.downtime_pct as number) ??
      eventsData?.stats.downtime_pct ??
      0)
  const standbyPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.standby_pct ?? 0)
    : ((analysis.standby_pct as number) ??
      eventsData?.stats.standby_pct ??
      0)

  /* --- Efficiency ------------------------------------------------- */
  const overallScore =
    eventsData?.performance?.efficiency?.overall_score ??
    Math.round(productionPct * 0.7 + prepPct * 0.3)

  /* --- Stats ------------------------------------------------------ */
  const totalTimeSec =
    (analysis.total_time_sec as number) ??
    eventsData?.stats.total_time_sec ??
    0
  const distanceM = skipped
    ? ((analysis.distance_traveled_m as number) ??
      eventsData?.stats.distance_traveled_m ??
      0)
    : ((
        (analysis.productivity as Record<string, unknown>)
          ?.distance_traveled_m as number
      ) ?? 0)
  const blockInteractions =
    (analysis.block_interactions as number) ??
    eventsData?.stats.block_interactions ??
    0
  const toolPickups =
    (analysis.tool_pickups as number) ??
    eventsData?.stats.tool_pickups ??
    0

  /* --- Timeline --------------------------------------------------- */
  const timeline =
    (analysis.activity_timeline as {
      start: string
      end: string
      activity: string
      description?: string
      duration_sec?: number
      num_frames?: number
      start_sec?: number
      end_sec?: number
    }[]) ?? []

  /* --- Safety ----------------------------------------------------- */
  const ppe = eventsData?.ppe_report
  const vlmSafety = analysis.safety as
    | Record<string, unknown>
    | undefined
  const safetyConcerns: string[] = isVlmMode
    ? ((vlmSafety as Record<string, unknown>)?.concerns as string[]) ??
      []
    : ppe?.concerns ?? []
  const ppeObserved: string[] = isVlmMode
    ? ((vlmSafety as Record<string, unknown>)?.ppe_observed as string[]) ??
      ppe?.all_ppe_items ??
      []
    : ppe?.all_ppe_items ?? []
  const ppeAvg = ppe
    ? Math.round(
        (ppe.vest_visible_pct +
          ppe.helmet_visible_pct +
          ppe.gloves_visible_pct) /
          3,
      )
    : 0

  /* --- VLM-specific ----------------------------------------------- */
  const keyActions = isVlmMode
    ? ((analysis.productivity as Record<string, unknown>)
        ?.key_actions as string[])
    : undefined
  const objectsInteracted = isVlmMode
    ? ((analysis.productivity as Record<string, unknown>)
        ?.objects_interacted as string[])
    : undefined
  const rawFallback = (analysis.raw as string) ?? null

  /* --- Derived ---------------------------------------------------- */
  const mins = Math.floor(totalTimeSec / 60)
  const secs = Math.round(totalTimeSec % 60)
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  const ringColor =
    overallScore >= 80
      ? '#22c55e'
      : overallScore >= 60
        ? '#f59e0b'
        : overallScore >= 40
          ? '#3b82f6'
          : '#ef4444'

  return (
    <Chapter
      step="vlm"
      title="Site Intelligence Report"
      subtitle="Executive summary synthesizing all pipeline data into actionable construction site insights."
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        className="space-y-10"
      >
        {/* ========== SOURCE BADGE ========== */}
        <motion.div variants={fadeUp} className="flex">
          {isVlmMode ? (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-data text-[#a78bfa] border border-[#8b5cf620] bg-[#8b5cf60a]">
              <motion.span
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </motion.span>
              Powered by Grok VLM
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-data text-[#22d3ee] border border-[#06b6d420] bg-[#06b6d40a]">
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Activity className="w-3.5 h-3.5" />
              </motion.span>
              Synthesized from Event Engine
            </span>
          )}
        </motion.div>

        {/* ========== HERO VERDICT CARD ========== */}
        <motion.div variants={fadeUp}>
          <div className="relative overflow-hidden rounded-xl border border-[#1a1a2e]">
            {/* Top accent gradient line */}
            <div
              className="h-[2px]"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${ringColor}40 30%, ${ringColor} 50%, ${ringColor}40 70%, transparent 100%)`,
              }}
            />

            <div className="relative p-8 bg-[#111]">
              {/* Atmospheric radial glow */}
              <div
                className="absolute -left-10 top-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-[80px] pointer-events-none"
                style={{ backgroundColor: ringColor, opacity: 0.04 }}
              />

              {/* Subtle grid overlay */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: 0.015,
                  backgroundImage:
                    'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
                  backgroundSize: '48px 48px',
                }}
              />

              <div className="relative z-10">
                {/* Ring + time breakdown */}
                <div className="flex gap-10 items-center">
                  <div className="shrink-0 text-center">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-[#52525b] mb-1">
                      Efficiency
                    </p>
                    <EfficiencyRing score={overallScore} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-[#52525b] mb-4">
                      Time Allocation
                    </p>
                    <TimeBreakdownBar
                      production={productionPct}
                      prep={prepPct}
                      downtime={downtimePct}
                      standby={standbyPct}
                    />
                  </div>
                </div>

                {/* Stat pills row */}
                <div className="grid grid-cols-4 gap-3 mt-8 pt-6 border-t border-[#1a1a2e]">
                  <StatPill
                    icon={Clock}
                    label="Duration"
                    value={durationStr}
                    accent="#06b6d4"
                  />
                  <StatPill
                    icon={Route}
                    label="Distance"
                    value={`${distanceM.toFixed(1)}m`}
                    accent="#f59e0b"
                  />
                  <StatPill
                    icon={Box}
                    label="Block Ops"
                    value={String(blockInteractions)}
                    accent="#22c55e"
                  />
                  <StatPill
                    icon={Wrench}
                    label="Tool Use"
                    value={String(toolPickups)}
                    accent="#8b5cf6"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========== ACTIVITY TIMELINE ========== */}
        {timeline.length > 0 && (
          <motion.div variants={fadeUp}>
            <SectionLabel>Activity Timeline</SectionLabel>

            {isVlmMode && timeline[0]?.description ? (
              /* ---------- VLM: narrative vertical rail ---------- */
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.08 } },
                }}
                className="relative ml-6"
              >
                {/* Gradient rail line */}
                <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-[#22c55e]/40 via-[#f59e0b]/40 to-[#ef4444]/40" />

                <div className="space-y-4 pl-8">
                  {timeline.map((seg, i) => (
                    <motion.div
                      key={i}
                      variants={{
                        hidden: { opacity: 0, x: -16 },
                        visible: { opacity: 1, x: 0 },
                      }}
                      className="relative group"
                    >
                      {/* Dot on rail */}
                      <div
                        className="absolute -left-[33px] top-4 w-3 h-3 rounded-full ring-2 ring-[#0a0a0f]"
                        style={{
                          backgroundColor:
                            ACTIVITY_COLORS[seg.activity] || '#6b7280',
                        }}
                      />
                      {/* Horizontal connector */}
                      <div
                        className="absolute -left-[22px] top-[22px] w-[22px] h-px"
                        style={{
                          backgroundColor: `${ACTIVITY_COLORS[seg.activity] || '#6b7280'}30`,
                        }}
                      />

                      <div className="bg-[#111] rounded-lg border border-[#1a1a2e] p-4 hover:border-[#2a2a3e] transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-data text-[#22d3ee]">
                            {seg.start} → {seg.end}
                          </span>
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-data"
                            style={{
                              color:
                                ACTIVITY_COLORS[seg.activity] || '#6b7280',
                              backgroundColor: `${ACTIVITY_COLORS[seg.activity] || '#6b7280'}15`,
                              border: `1px solid ${ACTIVITY_COLORS[seg.activity] || '#6b7280'}30`,
                            }}
                          >
                            {ACTIVITY_LABELS[seg.activity] || seg.activity}
                          </span>
                        </div>
                        {seg.description && (
                          <p className="text-[13px] text-[#a1a1aa] leading-relaxed">
                            {seg.description}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* ---------- Skipped: stacked bar + list ---------- */
              <div className="bg-[#111] rounded-xl border border-[#1a1a2e] p-6">
                {(() => {
                  const totalDur =
                    timeline.length > 0
                      ? (timeline[timeline.length - 1]?.end_sec ?? 0) -
                        (timeline[0]?.start_sec ?? 0)
                      : 0
                  return totalDur > 0 ? (
                    <>
                      <div className="flex h-10 rounded-lg overflow-hidden bg-[#0a0a12] mb-4">
                        {timeline.map((seg, i) => {
                          const widthPct =
                            ((seg.duration_sec ?? 0) / totalDur) * 100
                          if (widthPct < 0.3) return null
                          return (
                            <motion.div
                              key={i}
                              initial={{ width: 0 }}
                              animate={{ width: `${widthPct}%` }}
                              transition={{
                                duration: 1,
                                delay: 0.3 + i * 0.02,
                                ease: [0.16, 1, 0.3, 1],
                              }}
                              className="relative group cursor-default"
                              style={{
                                backgroundColor:
                                  ACTIVITY_COLORS[seg.activity] ||
                                  '#6b7280',
                                opacity: 0.85,
                              }}
                            >
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#1c2128] border border-[#30363d] rounded-lg px-3 py-1.5 text-[10px] font-data text-[#e4e4e7] whitespace-nowrap pointer-events-none shadow-xl">
                                {seg.start} → {seg.end} ·{' '}
                                {ACTIVITY_LABELS[seg.activity]} ·{' '}
                                {(seg.duration_sec ?? 0).toFixed(0)}s
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                      <div className="flex gap-5 justify-center mb-5">
                        {Object.entries(ACTIVITY_COLORS).map(
                          ([key, color]) => (
                            <div
                              key={key}
                              className="flex items-center gap-2"
                            >
                              <div
                                className="w-2.5 h-2.5 rounded-[3px]"
                                style={{
                                  backgroundColor: color,
                                  opacity: 0.9,
                                }}
                              />
                              <span className="text-[10px] text-[#71717a]">
                                {ACTIVITY_LABELS[key]}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </>
                  ) : null
                })()}

                <div className="max-h-52 overflow-y-auto">
                  <div className="space-y-1">
                    {timeline.slice(0, 30).map((seg, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-[11px] font-data px-3 py-1.5 rounded-md bg-[#0a0a12] hover:bg-[#12121e] transition-colors"
                      >
                        <div
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{
                            backgroundColor:
                              ACTIVITY_COLORS[seg.activity],
                          }}
                        />
                        <span className="text-[#52525b] w-28">
                          {seg.start} → {seg.end}
                        </span>
                        <span className="text-[#71717a] w-20">
                          {ACTIVITY_LABELS[seg.activity] || seg.activity}
                        </span>
                        <span className="text-[#3f3f50] ml-auto">
                          {(seg.duration_sec ?? 0).toFixed(0)}s
                          {seg.num_frames
                            ? ` · ${seg.num_frames}f`
                            : ''}
                        </span>
                      </div>
                    ))}
                    {timeline.length > 30 && (
                      <p className="text-[10px] text-[#3f3f50] text-center py-2 font-data">
                        +{timeline.length - 30} more segments
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ========== TWO-COLUMN: METRICS + SAFETY ========== */}
        <motion.div variants={fadeUp}>
          <div className="grid grid-cols-2 gap-6">
            {/* ---- LEFT: Key Metrics ---- */}
            <div>
              <SectionLabel>Key Metrics</SectionLabel>
              <div className="bg-[#111] rounded-xl border border-[#1a1a2e] p-6 space-y-4">
                {[
                  {
                    icon: Box,
                    label: 'Block Interactions',
                    value: blockInteractions,
                    color: '#22c55e',
                  },
                  {
                    icon: Wrench,
                    label: 'Tool Pickups',
                    value: toolPickups,
                    color: '#f59e0b',
                  },
                  {
                    icon: Route,
                    label: 'Relocations',
                    value:
                      (analysis.relocations as number) ??
                      eventsData?.stats.relocations ??
                      0,
                    color: '#3b82f6',
                  },
                  {
                    icon: Eye,
                    label: 'Unique Objects',
                    value:
                      (analysis.unique_objects_interacted as number) ??
                      eventsData?.stats.unique_objects_interacted ??
                      0,
                    color: '#8b5cf6',
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${row.color}12` }}
                    >
                      <row.icon
                        className="w-4 h-4"
                        style={{ color: row.color }}
                      />
                    </div>
                    <span className="text-[12px] text-[#71717a] flex-1">
                      {row.label}
                    </span>
                    <span className="text-lg font-data text-[#e4e4e7]">
                      {row.value}
                    </span>
                  </div>
                ))}

                {/* VLM: key actions */}
                {keyActions && keyActions.length > 0 && (
                  <div className="border-t border-[#1a1a2e] pt-4 mt-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[#52525b] mb-3">
                      Key Actions
                    </p>
                    <div className="space-y-2">
                      {keyActions.map((action, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0 mt-0.5" />
                          <span className="text-[12px] text-[#a1a1aa] leading-relaxed">
                            {action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VLM: objects interacted */}
                {objectsInteracted && objectsInteracted.length > 0 && (
                  <div className="border-t border-[#1a1a2e] pt-4 mt-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[#52525b] mb-3">
                      Objects Interacted
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {objectsInteracted.map((obj, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 text-[10px] font-data rounded-md bg-[#0a0a12] text-[#a1a1aa] border border-[#1a1a2e]"
                        >
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ---- RIGHT: Safety ---- */}
            <div>
              <SectionLabel>Safety Status</SectionLabel>
              <div className="bg-[#111] rounded-xl border border-[#1a1a2e] p-6 space-y-5">
                {/* PPE compliance header */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{
                      backgroundColor:
                        ppeAvg > 60
                          ? 'rgba(34,197,94,0.08)'
                          : 'rgba(245,158,11,0.08)',
                    }}
                  >
                    {ppeAvg > 60 ? (
                      <ShieldCheck className="w-5 h-5 text-[#22c55e]" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-[#f59e0b]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-[12px] text-[#e4e4e7]">
                      PPE Compliance
                    </p>
                    <p className="text-[10px] text-[#52525b]">
                      Average across all frames
                    </p>
                  </div>
                  <span
                    className="text-2xl font-data font-bold"
                    style={{
                      color:
                        ppeAvg > 70
                          ? '#22c55e'
                          : ppeAvg > 30
                            ? '#f59e0b'
                            : '#ef4444',
                    }}
                  >
                    {ppeAvg}%
                  </span>
                </div>

                {/* PPE bars */}
                {ppe && (
                  <div className="space-y-3">
                    <PPEBar label="Vest" pct={ppe.vest_visible_pct} />
                    <PPEBar
                      label="Helmet"
                      pct={ppe.helmet_visible_pct}
                    />
                    <PPEBar
                      label="Gloves"
                      pct={ppe.gloves_visible_pct}
                    />
                  </div>
                )}

                {/* Detected PPE items */}
                {ppeObserved.length > 0 && (
                  <div className="border-t border-[#1a1a2e] pt-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[#52525b] mb-2">
                      Detected Items
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ppeObserved.map((item, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 text-[10px] font-data rounded-md text-[#4ade80] border border-[#22c55e30] bg-[#22c55e0d]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Safety concerns */}
                {safetyConcerns.length > 0 && (
                  <div className="border-t border-[#1a1a2e] pt-4 space-y-2">
                    {safetyConcerns.map((c, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 text-xs p-3 rounded-lg border border-[#ef444430] bg-[#ef44440a]"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444] shrink-0 mt-0.5" />
                        <span className="text-[#fca5a5]">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========== AI OBSERVATIONS (VLM-only) ========== */}
        {isVlmMode && (keyActions?.length || rawFallback) && (
          <motion.div variants={fadeUp}>
            <div className="relative overflow-hidden rounded-xl border border-[#8b5cf620]">
              {/* Purple accent line */}
              <div className="h-[2px] bg-gradient-to-r from-transparent via-[#8b5cf6] to-transparent" />

              <div
                className="relative p-6"
                style={{ backgroundColor: 'rgba(139,92,246,0.03)' }}
              >
                {/* Purple atmospheric glow */}
                <div className="absolute right-0 top-0 w-64 h-64 rounded-full blur-[80px] pointer-events-none bg-[#8b5cf6] opacity-[0.04]" />

                <div className="relative z-10">
                  <div className="flex items-center gap-2.5 mb-5">
                    <motion.span
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    >
                      <Sparkles className="w-4 h-4 text-[#a78bfa]" />
                    </motion.span>
                    <h3 className="text-[14px] font-semibold text-[#c4b5fd] tracking-wide">
                      AI Observations
                    </h3>
                  </div>

                  {rawFallback ? (
                    <p className="text-[13px] text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">
                      {rawFallback}
                    </p>
                  ) : keyActions ? (
                    <div className="space-y-2.5">
                      {keyActions.map((action, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5"
                        >
                          <Zap className="w-3.5 h-3.5 text-[#a78bfa] shrink-0 mt-0.5" />
                          <span className="text-[13px] text-[#a1a1aa] leading-relaxed">
                            {action}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========== RAW DATA TOGGLE ========== */}
        <motion.div variants={fadeUp}>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-2 text-[11px] font-data text-[#3f3f50] hover:text-[#71717a] transition-colors uppercase tracking-[0.15em]"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ${showRaw ? 'rotate-180' : ''}`}
            />
            {showRaw ? 'Hide' : 'View'} Raw Analysis Data
          </button>

          {showRaw && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="mt-3 bg-[#0a0a12] rounded-xl border border-[#1a1a2e] p-5 max-h-[400px] overflow-auto"
            >
              <pre className="text-[11px] font-data text-[#3f3f50] whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </Chapter>
  )
}
