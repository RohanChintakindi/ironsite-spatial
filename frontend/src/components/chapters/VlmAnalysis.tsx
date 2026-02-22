import { useState } from 'react'
import { motion } from 'framer-motion'
import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import AnimatedNumber from '../ui/AnimatedNumber'
import {
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
  BrainCircuit,
} from 'lucide-react'

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

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' as const },
  },
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

/* ── Efficiency Ring — clean arc, no glow/dashes ── */

function EfficiencyRing({ score }: { score: number }) {
  const size = 140
  const cx = size / 2
  const strokeW = 6
  const r = cx - strokeW - 8
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(100, score) / 100)

  const color =
    score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#3b82f6' : '#ef4444'

  const label =
    score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Moderate' : 'Low'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#1a1a1a" strokeWidth={strokeW} />
        {/* Score arc */}
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <motion.circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </g>
      </svg>
      <div className="text-center z-10">
        <p className="font-data font-bold leading-none" style={{ color, fontSize: '2rem' }}>
          <AnimatedNumber value={Math.round(score)} duration={1200} />
        </p>
        <p className="text-[9px] text-[#52525b] uppercase tracking-[0.15em] mt-1">{label}</p>
      </div>
    </div>
  )
}

/* ── Time Breakdown Bar ── */

function TimeBreakdownBar({
  production, prep, downtime, standby,
}: {
  production: number; prep: number; downtime: number; standby: number
}) {
  const segments = [
    { key: 'production', pct: production, color: ACTIVITY_COLORS.production },
    { key: 'prep', pct: prep, color: ACTIVITY_COLORS.prep },
    { key: 'downtime', pct: downtime, color: ACTIVITY_COLORS.downtime },
    { key: 'standby', pct: standby, color: ACTIVITY_COLORS.standby },
  ]

  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-[#1a1a1a]">
        {segments.map((s) =>
          s.pct > 0.5 ? (
            <motion.div
              key={s.key}
              initial={{ width: 0 }}
              animate={{ width: `${s.pct}%` }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
              style={{ backgroundColor: s.color }}
            />
          ) : null,
        )}
      </div>
      <div className="flex gap-5 mt-2.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-[#52525b]">{ACTIVITY_LABELS[s.key]}</span>
            <span className="text-[10px] font-data text-[#a1a1aa]">{s.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── PPE Bar ── */

function PPEBar({ label, pct }: { label: string; pct: number }) {
  const color = pct > 70 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-[#52525b] w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="text-[11px] font-data w-10 text-right" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  )
}

/* ── Main component ── */

export default function VlmAnalysis() {
  const vlmData = usePipelineStore((s) => s.vlmData)
  const eventsData = usePipelineStore((s) => s.eventsData)
  const [showRaw, setShowRaw] = useState(false)

  if (!vlmData && !eventsData) {
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

  const analysis = (vlmData?.analysis ?? {}) as Record<string, unknown>
  const isVlmMode = vlmData != null && 'summary' in analysis && typeof analysis.summary === 'object'

  // Pull from eventsData first (available earlier), vlmData/analysis as override
  const productionPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.production_pct ?? 0)
    : ((analysis.production_pct as number) ?? eventsData?.stats.production_pct ?? 0)
  const prepPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.prep_pct ?? 0)
    : ((analysis.prep_pct as number) ?? eventsData?.stats.prep_pct ?? 0)
  const downtimePct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.downtime_pct ?? 0)
    : ((analysis.downtime_pct as number) ?? eventsData?.stats.downtime_pct ?? 0)
  const standbyPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.standby_pct ?? 0)
    : ((analysis.standby_pct as number) ?? eventsData?.stats.standby_pct ?? 0)

  const overallScore =
    eventsData?.performance?.efficiency?.overall_score ??
    Math.round(productionPct * 0.7 + prepPct * 0.3)

  const totalTimeSec =
    (analysis.total_time_sec as number) ?? eventsData?.stats.total_time_sec ?? 0
  const distanceM = isVlmMode
    ? (((analysis.productivity as Record<string, unknown>)?.distance_traveled_m as number) ?? 0)
    : ((analysis.distance_traveled_m as number) ?? eventsData?.stats.distance_traveled_m ?? 0)
  const blockInteractions =
    (analysis.block_interactions as number) ?? eventsData?.stats.block_interactions ?? 0
  const toolPickups =
    (analysis.tool_pickups as number) ?? eventsData?.stats.tool_pickups ?? 0

  const timeline = (analysis.activity_timeline as {
    start: string; end: string; activity: string; description?: string
    duration_sec?: number; num_frames?: number; start_sec?: number; end_sec?: number
  }[]) ?? eventsData?.timeline ?? []

  const ppe = eventsData?.ppe_report
  const vlmSafety = analysis.safety as Record<string, unknown> | undefined
  const safetyConcerns: string[] = isVlmMode
    ? ((vlmSafety as Record<string, unknown>)?.concerns as string[]) ?? []
    : ppe?.concerns ?? []
  const ppeObserved: string[] = isVlmMode
    ? ((vlmSafety as Record<string, unknown>)?.ppe_observed as string[]) ?? ppe?.all_ppe_items ?? []
    : ppe?.all_ppe_items ?? []
  const ppeAvg = ppe
    ? Math.round((ppe.vest_visible_pct + ppe.helmet_visible_pct + ppe.gloves_visible_pct) / 3)
    : 0

  const keyActions = isVlmMode
    ? ((analysis.productivity as Record<string, unknown>)?.key_actions as string[])
    : undefined
  const objectsInteracted = isVlmMode
    ? ((analysis.productivity as Record<string, unknown>)?.objects_interacted as string[])
    : undefined
  const rawFallback = (analysis.raw as string) ?? null

  const mins = Math.floor(totalTimeSec / 60)
  const secs = Math.round(totalTimeSec % 60)
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  return (
    <Chapter
      step="vlm"
      title="Site Intelligence Report"
      subtitle="Executive summary synthesizing all pipeline data into actionable construction site insights."
    >
      <motion.div initial="hidden" animate="visible" variants={stagger} className="space-y-8">

        {/* Source badge — simple, no animation */}
        <motion.div variants={fadeUp} className="flex">
          {isVlmMode ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-data text-[#a78bfa] border border-[#8b5cf620] bg-[#8b5cf608]">
              <BrainCircuit className="w-3.5 h-3.5" />
              Powered by Grok VLM
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-[11px] font-data text-[#22d3ee] border border-[#06b6d420] bg-[#06b6d408]">
              <Activity className="w-3.5 h-3.5" />
              Synthesized from Event Engine
            </span>
          )}
        </motion.div>

        {/* Hero card — efficiency + time breakdown */}
        <motion.div variants={fadeUp}>
          <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-6 card-highlight">
            <div className="flex gap-8 items-center">
              <div className="shrink-0 text-center">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#52525b] mb-1">Efficiency</p>
                <EfficiencyRing score={overallScore} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#52525b] mb-3">Time Allocation</p>
                <TimeBreakdownBar
                  production={productionPct}
                  prep={prepPct}
                  downtime={downtimePct}
                  standby={standbyPct}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#1a1a1a]">
              {[
                { icon: Clock, label: 'Duration', value: durationStr, color: '#06b6d4' },
                { icon: Route, label: 'Distance', value: `${distanceM.toFixed(1)}m`, color: '#f59e0b' },
                { icon: Box, label: 'Block Ops', value: String(blockInteractions), color: '#22c55e' },
                { icon: Wrench, label: 'Tool Use', value: String(toolPickups), color: '#8b5cf6' },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2.5 px-3 py-2 bg-[#0a0a0f] rounded-md border border-[#1a1a1a]">
                  <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                  <div className="min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#52525b]">{s.label}</p>
                    <p className="text-sm font-data text-[#e4e4e7] -mt-0.5">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Activity Timeline */}
        {timeline.length > 0 && (
          <motion.div variants={fadeUp}>
            <h3 className="text-sm font-bold text-[#e4e4e7] tracking-tight mb-3">Activity Timeline</h3>

            {isVlmMode && timeline[0]?.description ? (
              <div className="relative ml-4">
                <div className="absolute left-0 top-1 bottom-1 w-px bg-[#1a1a1a]" />
                <div className="space-y-3 pl-6">
                  {timeline.map((seg, i) => (
                    <div key={i} className="relative">
                      <div
                        className="absolute -left-[25px] top-3 w-2.5 h-2.5 rounded-full ring-2 ring-[#0a0a0f]"
                        style={{ backgroundColor: ACTIVITY_COLORS[seg.activity] || '#6b7280' }}
                      />
                      <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-data text-[#06b6d4]">{seg.start} → {seg.end}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-data"
                            style={{
                              color: ACTIVITY_COLORS[seg.activity] || '#6b7280',
                              backgroundColor: `${ACTIVITY_COLORS[seg.activity] || '#6b7280'}12`,
                            }}
                          >
                            {ACTIVITY_LABELS[seg.activity] || seg.activity}
                          </span>
                        </div>
                        {seg.description && (
                          <p className="text-[12px] text-[#a1a1aa] leading-relaxed">{seg.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-5">
                {(() => {
                  const totalDur = timeline.length > 0
                    ? (timeline[timeline.length - 1]?.end_sec ?? 0) - (timeline[0]?.start_sec ?? 0)
                    : 0
                  return totalDur > 0 ? (
                    <>
                      <div className="flex h-8 rounded-md overflow-hidden bg-[#0a0a0f] mb-3">
                        {timeline.map((seg, i) => {
                          const widthPct = ((seg.duration_sec ?? 0) / totalDur) * 100
                          if (widthPct < 0.3) return null
                          return (
                            <motion.div
                              key={i}
                              initial={{ width: 0 }}
                              animate={{ width: `${widthPct}%` }}
                              transition={{ duration: 0.8, delay: 0.2 + i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                              className="relative group cursor-default"
                              style={{ backgroundColor: ACTIVITY_COLORS[seg.activity] || '#6b7280', opacity: 0.8 }}
                            >
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#0f0f14] border border-[#1a1a1a] rounded-md px-2.5 py-1 text-[10px] font-data text-[#e4e4e7] whitespace-nowrap pointer-events-none">
                                {seg.start} → {seg.end} · {ACTIVITY_LABELS[seg.activity]} · {(seg.duration_sec ?? 0).toFixed(0)}s
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                      <div className="flex gap-4 justify-center mb-4">
                        {Object.entries(ACTIVITY_COLORS).map(([key, color]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                            <span className="text-[10px] text-[#52525b]">{ACTIVITY_LABELS[key]}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null
                })()}

                <div className="max-h-48 overflow-y-auto">
                  <div className="space-y-1">
                    {timeline.slice(0, 30).map((seg, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-[11px] font-data px-3 py-1.5 rounded bg-[#0a0a0f]"
                      >
                        <div className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ backgroundColor: ACTIVITY_COLORS[seg.activity] }} />
                        <span className="text-[#52525b] w-28">{seg.start} → {seg.end}</span>
                        <span className="text-[#71717a] w-20">{ACTIVITY_LABELS[seg.activity] || seg.activity}</span>
                        <span className="text-[#3f3f46] ml-auto">
                          {(seg.duration_sec ?? 0).toFixed(0)}s{seg.num_frames ? ` · ${seg.num_frames}f` : ''}
                        </span>
                      </div>
                    ))}
                    {timeline.length > 30 && (
                      <p className="text-[10px] text-[#3f3f46] text-center py-1.5 font-data">
                        +{timeline.length - 30} more segments
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Two-column: Metrics + Safety */}
        <motion.div variants={fadeUp}>
          <div className="grid grid-cols-2 gap-4">
            {/* Key Metrics */}
            <div>
              <h3 className="text-sm font-bold text-[#e4e4e7] tracking-tight mb-3">Key Metrics</h3>
              <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-5 space-y-3 card-highlight">
                {[
                  { icon: Box, label: 'Block Interactions', value: blockInteractions, color: '#22c55e' },
                  { icon: Wrench, label: 'Tool Pickups', value: toolPickups, color: '#f59e0b' },
                  { icon: Route, label: 'Relocations', value: (analysis.relocations as number) ?? eventsData?.stats.relocations ?? 0, color: '#3b82f6' },
                  { icon: Eye, label: 'Unique Objects', value: (analysis.unique_objects_interacted as number) ?? eventsData?.stats.unique_objects_interacted ?? 0, color: '#8b5cf6' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <row.icon className="w-4 h-4 shrink-0" style={{ color: row.color }} />
                    <span className="text-xs text-[#71717a] flex-1">{row.label}</span>
                    <span className="text-base font-data text-[#e4e4e7]">{row.value}</span>
                  </div>
                ))}

                {keyActions && keyActions.length > 0 && (
                  <div className="border-t border-[#1a1a1a] pt-3 mt-3">
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#52525b] mb-2">Key Actions</p>
                    <div className="space-y-1.5">
                      {keyActions.map((action, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3 h-3 text-[#22c55e] shrink-0 mt-0.5" />
                          <span className="text-[11px] text-[#a1a1aa] leading-relaxed">{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {objectsInteracted && objectsInteracted.length > 0 && (
                  <div className="border-t border-[#1a1a1a] pt-3 mt-3">
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#52525b] mb-2">Objects Interacted</p>
                    <div className="flex flex-wrap gap-1">
                      {objectsInteracted.map((obj, i) => (
                        <span key={i} className="px-2 py-0.5 text-[10px] font-data rounded bg-[#0a0a0f] text-[#a1a1aa] border border-[#1a1a1a]">
                          {obj}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Safety */}
            <div>
              <h3 className="text-sm font-bold text-[#e4e4e7] tracking-tight mb-3">Safety Status</h3>
              <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-5 space-y-4 card-highlight">
                <div className="flex items-center gap-3">
                  {ppeAvg > 60 ? (
                    <ShieldCheck className="w-5 h-5 text-[#22c55e]" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-[#f59e0b]" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-[#e4e4e7]">PPE Compliance</p>
                    <p className="text-[10px] text-[#52525b]">Average across all frames</p>
                  </div>
                  <span
                    className="text-xl font-data font-bold"
                    style={{ color: ppeAvg > 70 ? '#22c55e' : ppeAvg > 30 ? '#f59e0b' : '#ef4444' }}
                  >
                    {ppeAvg}%
                  </span>
                </div>

                {ppe && (
                  <div className="space-y-2.5">
                    <PPEBar label="Vest" pct={ppe.vest_visible_pct} />
                    <PPEBar label="Helmet" pct={ppe.helmet_visible_pct} />
                    <PPEBar label="Gloves" pct={ppe.gloves_visible_pct} />
                  </div>
                )}

                {ppeObserved.length > 0 && (
                  <div className="border-t border-[#1a1a1a] pt-3">
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#52525b] mb-2">Detected Items</p>
                    <div className="flex flex-wrap gap-1">
                      {ppeObserved.map((item, i) => (
                        <span key={i} className="px-2 py-0.5 text-[10px] font-data rounded text-[#4ade80] border border-[#22c55e20] bg-[#22c55e08]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {safetyConcerns.length > 0 && (
                  <div className="border-t border-[#1a1a1a] pt-3 space-y-1.5">
                    {safetyConcerns.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2.5 rounded border border-[#ef444420] bg-[#ef44440a]">
                        <AlertTriangle className="w-3 h-3 text-[#ef4444] shrink-0 mt-0.5" />
                        <span className="text-[#fca5a5]">{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* AI Observations (VLM-only) — clean, no glow */}
        {isVlmMode && (keyActions?.length || rawFallback) && (
          <motion.div variants={fadeUp}>
            <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-5 card-highlight">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-[#a78bfa]" />
                <h3 className="text-sm font-bold text-[#e4e4e7] tracking-tight">AI Observations</h3>
              </div>
              {rawFallback ? (
                <p className="text-[12px] text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">{rawFallback}</p>
              ) : keyActions ? (
                <div className="space-y-2">
                  {keyActions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Zap className="w-3 h-3 text-[#a78bfa] shrink-0 mt-0.5" />
                      <span className="text-[12px] text-[#a1a1aa] leading-relaxed">{action}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}

        {/* Raw data toggle */}
        <motion.div variants={fadeUp}>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1.5 text-[11px] font-data text-[#3f3f46] hover:text-[#71717a] transition-colors uppercase tracking-[0.12em]"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showRaw ? 'rotate-180' : ''}`} />
            {showRaw ? 'Hide' : 'View'} Raw Analysis Data
          </button>
          {showRaw && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="mt-2 bg-[#0a0a0f] rounded-lg border border-[#1a1a1a] p-4 max-h-[360px] overflow-auto"
            >
              <pre className="text-[11px] font-data text-[#3f3f46] whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(analysis, null, 2)}
              </pre>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </Chapter>
  )
}
