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
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Activity colors (shared with Events chapter)                       */
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
/*  EfficiencyRing — large SVG donut with score inside                 */
/* ------------------------------------------------------------------ */

function EfficiencyRing({ score }: { score: number }) {
  const size = 120
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(100, score) / 100)

  const color =
    score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : score >= 40 ? '#3b82f6' : '#ef4444'

  const label =
    score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Moderate' : 'Needs Improvement'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-[1.5s] ease-out"
        />
      </svg>
      <div className="text-center z-10">
        <p className="text-2xl font-data font-bold" style={{ color }}>
          {Math.round(score)}
        </p>
        <p className="text-[9px] text-[#52525b] uppercase tracking-wider">{label}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TimeBreakdownBar — horizontal stacked bar                          */
/* ------------------------------------------------------------------ */

function TimeBreakdownBar({ production, prep, downtime, standby }: {
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
      <div className="flex h-6 rounded-lg overflow-hidden border border-[#222]">
        {segments.map((s) =>
          s.pct > 0.5 ? (
            <div
              key={s.key}
              className="relative group"
              style={{ width: `${s.pct}%`, backgroundColor: s.color, opacity: 0.85 }}
            >
              {s.pct > 8 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-data text-white/90">
                  {s.pct.toFixed(0)}%
                </span>
              )}
            </div>
          ) : null,
        )}
      </div>
      <div className="flex gap-4 mt-2">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-[#a1a1aa]">
              {ACTIVITY_LABELS[s.key]} {s.pct.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  PPEBar                                                             */
/* ------------------------------------------------------------------ */

function PPEBar({ label, pct }: { label: string; pct: number }) {
  const color = pct > 70 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#a1a1aa] w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-data text-[#e4e4e7] w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  StatPill — icon + label + value inline                             */
/* ------------------------------------------------------------------ */

function StatPill({ icon: Icon, label, value }: {
  icon: typeof Clock; label: string; value: string
}) {
  return (
    <div className="flex items-center gap-2 bg-[#0d0d0d] rounded-lg px-3 py-2 border border-[#1a1a1a]">
      <Icon className="w-3.5 h-3.5 text-[#52525b]" />
      <span className="text-[10px] text-[#52525b] uppercase">{label}</span>
      <span className="text-sm font-data text-[#e4e4e7] ml-auto">{value}</span>
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

  // --- Detect mode ---
  const analysis = (vlmData.analysis ?? {}) as Record<string, unknown>
  const isVlmMode = 'summary' in analysis && typeof analysis.summary === 'object'
  const skipped = vlmData.skipped === true || !isVlmMode

  // --- Normalize percentages ---
  const productionPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.production_pct ?? 0)
    : (analysis.production_pct as number) ?? eventsData?.stats.production_pct ?? 0
  const prepPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.prep_pct ?? 0)
    : (analysis.prep_pct as number) ?? eventsData?.stats.prep_pct ?? 0
  const downtimePct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.downtime_pct ?? 0)
    : (analysis.downtime_pct as number) ?? eventsData?.stats.downtime_pct ?? 0
  const standbyPct = isVlmMode
    ? ((analysis.summary as Record<string, number>)?.standby_pct ?? 0)
    : (analysis.standby_pct as number) ?? eventsData?.stats.standby_pct ?? 0

  // --- Efficiency ---
  const overallScore = eventsData?.performance?.efficiency?.overall_score ?? Math.round(productionPct * 0.7 + prepPct * 0.3)

  // --- Stats ---
  const totalTimeSec = (analysis.total_time_sec as number) ?? eventsData?.stats.total_time_sec ?? 0
  const distanceM = skipped
    ? (analysis.distance_traveled_m as number) ?? eventsData?.stats.distance_traveled_m ?? 0
    : ((analysis.productivity as Record<string, unknown>)?.distance_traveled_m as number) ?? 0
  const blockInteractions = (analysis.block_interactions as number) ?? eventsData?.stats.block_interactions ?? 0
  const toolPickups = (analysis.tool_pickups as number) ?? eventsData?.stats.tool_pickups ?? 0

  // --- Timeline ---
  const timeline = (analysis.activity_timeline as { start: string; end: string; activity: string; description?: string; duration_sec?: number; num_frames?: number; start_sec?: number; end_sec?: number }[]) ?? []

  // --- Safety ---
  const ppe = eventsData?.ppe_report
  const vlmSafety = analysis.safety as Record<string, unknown> | undefined
  const safetyConcerns: string[] = isVlmMode
    ? ((vlmSafety as Record<string, unknown>)?.concerns as string[]) ?? []
    : ppe?.concerns ?? []
  const ppeObserved: string[] = isVlmMode
    ? ((vlmSafety as Record<string, unknown>)?.ppe_observed as string[]) ?? ppe?.all_ppe_items ?? []
    : ppe?.all_ppe_items ?? []
  const ppeAvg = ppe ? Math.round((ppe.vest_visible_pct + ppe.helmet_visible_pct + ppe.gloves_visible_pct) / 3) : 0

  // --- VLM-specific ---
  const keyActions = isVlmMode ? ((analysis.productivity as Record<string, unknown>)?.key_actions as string[]) : undefined
  const objectsInteracted = isVlmMode ? ((analysis.productivity as Record<string, unknown>)?.objects_interacted as string[]) : undefined
  const rawFallback = (analysis.raw as string) ?? null

  // Format duration
  const mins = Math.floor(totalTimeSec / 60)
  const secs = Math.round(totalTimeSec % 60)
  const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  return (
    <Chapter
      step="vlm"
      title="Site Intelligence Report"
      subtitle="Executive summary synthesizing all pipeline data into actionable construction site insights."
    >
      <div className="space-y-8">
        {/* Section 0: Source badge */}
        <div className="flex">
          {isVlmMode ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-data bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/30">
              <Sparkles className="w-3 h-3" />
              Powered by Grok VLM
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-data bg-[#06b6d4]/10 text-[#06b6d4] border border-[#06b6d4]/30">
              <Activity className="w-3 h-3" />
              Synthesized from Event Engine
            </span>
          )}
        </div>

        {/* Section 1: Hero Verdict Card */}
        <div className="bg-[#111] rounded-xl border border-[#222] p-6">
          <div className="flex gap-8 items-center">
            {/* Left: efficiency ring */}
            <div className="shrink-0">
              <p className="text-[10px] text-[#52525b] uppercase tracking-wider text-center mb-2">Overall Efficiency</p>
              <EfficiencyRing score={overallScore} />
            </div>

            {/* Right: time breakdown */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#52525b] uppercase tracking-wider mb-3">Time Breakdown</p>
              <TimeBreakdownBar
                production={productionPct}
                prep={prepPct}
                downtime={downtimePct}
                standby={standbyPct}
              />
            </div>
          </div>

          {/* Bottom stat row */}
          <div className="grid grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#1a1a1a]">
            <StatPill icon={Clock} label="Duration" value={durationStr} />
            <StatPill icon={Route} label="Distance" value={`${distanceM.toFixed(1)}m`} />
            <StatPill icon={Box} label="Blocks" value={String(blockInteractions)} />
            <StatPill icon={Wrench} label="Tools" value={String(toolPickups)} />
          </div>
        </div>

        {/* Section 2: Activity Timeline */}
        {timeline.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Activity Timeline</h3>

            {isVlmMode && timeline[0]?.description ? (
              /* VLM mode: vertical narrative timeline */
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
                className="relative ml-4 border-l border-[#222] pl-6 space-y-4"
              >
                {timeline.map((seg, i) => (
                  <motion.div
                    key={i}
                    variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
                    className="relative"
                  >
                    {/* Dot on rail */}
                    <div
                      className="absolute -left-[31px] top-1 w-3 h-3 rounded-full border-2 border-[#0a0a0f]"
                      style={{ backgroundColor: ACTIVITY_COLORS[seg.activity] || '#6b7280' }}
                    />
                    <div className="bg-[#111] rounded-lg border border-[#222] p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-data text-[#06b6d4]">{seg.start} - {seg.end}</span>
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full border"
                          style={{
                            color: ACTIVITY_COLORS[seg.activity] || '#6b7280',
                            borderColor: ACTIVITY_COLORS[seg.activity] || '#6b7280',
                            backgroundColor: `${(ACTIVITY_COLORS[seg.activity] || '#6b7280')}15`,
                          }}
                        >
                          {ACTIVITY_LABELS[seg.activity] || seg.activity}
                        </span>
                      </div>
                      {seg.description && (
                        <p className="text-sm text-[#a1a1aa] leading-relaxed">{seg.description}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              /* Skipped mode: stacked bar + segment list */
              <div className="bg-[#111] rounded-lg border border-[#222] p-5">
                {(() => {
                  const totalDur = timeline.length > 0
                    ? (timeline[timeline.length - 1]?.end_sec ?? 0) - (timeline[0]?.start_sec ?? 0)
                    : 0
                  return totalDur > 0 ? (
                    <>
                      <div className="flex h-8 rounded-lg overflow-hidden border border-[#222] mb-3">
                        {timeline.map((seg, i) => {
                          const widthPct = ((seg.duration_sec ?? 0) / totalDur) * 100
                          if (widthPct < 0.3) return null
                          return (
                            <div
                              key={i}
                              className="relative group"
                              style={{
                                width: `${widthPct}%`,
                                backgroundColor: ACTIVITY_COLORS[seg.activity] || '#6b7280',
                                opacity: 0.85,
                              }}
                            >
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10 bg-[#1c2128] border border-[#30363d] rounded px-2 py-1 text-[10px] font-data text-[#e4e4e7] whitespace-nowrap pointer-events-none">
                                {seg.start} - {seg.end} | {ACTIVITY_LABELS[seg.activity] || seg.activity} | {(seg.duration_sec ?? 0).toFixed(0)}s
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-4 justify-center mb-4">
                        {Object.entries(ACTIVITY_COLORS).map(([key, color]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                            <span className="text-[10px] text-[#a1a1aa]">{ACTIVITY_LABELS[key]}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null
                })()}
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {timeline.slice(0, 30).map((seg, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] font-data px-2 py-1 rounded bg-[#0d0d0d]">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: ACTIVITY_COLORS[seg.activity] }} />
                      <span className="text-[#52525b] w-24">{seg.start} - {seg.end}</span>
                      <span className="text-[#a1a1aa] w-20">{ACTIVITY_LABELS[seg.activity] || seg.activity}</span>
                      <span className="text-[#52525b]">{(seg.duration_sec ?? 0).toFixed(0)}s{seg.num_frames ? ` (${seg.num_frames}f)` : ''}</span>
                    </div>
                  ))}
                  {timeline.length > 30 && (
                    <p className="text-[10px] text-[#52525b] text-center">+{timeline.length - 30} more segments</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 3: Two-column — Metrics + Safety */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Key Metrics */}
          <div>
            <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Key Metrics</h3>
            <div className="bg-[#111] rounded-lg border border-[#222] p-5 space-y-3">
              {[
                { label: 'Block Interactions', value: blockInteractions },
                { label: 'Tool Pickups', value: toolPickups },
                { label: 'Relocations', value: (analysis.relocations as number) ?? eventsData?.stats.relocations ?? 0 },
                { label: 'Unique Objects', value: (analysis.unique_objects_interacted as number) ?? eventsData?.stats.unique_objects_interacted ?? 0 },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#a1a1aa]">{row.label}</span>
                  <span className="text-sm font-data text-[#e4e4e7]">{row.value}</span>
                </div>
              ))}

              {/* VLM: key actions */}
              {keyActions && keyActions.length > 0 && (
                <div className="border-t border-[#222] pt-3 mt-3 space-y-2">
                  <p className="text-[10px] text-[#52525b] uppercase tracking-wider">Key Actions</p>
                  {keyActions.map((action, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0 mt-0.5" />
                      <span className="text-xs text-[#a1a1aa]">{action}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* VLM: objects interacted */}
              {objectsInteracted && objectsInteracted.length > 0 && (
                <div className="border-t border-[#222] pt-3 mt-3">
                  <p className="text-[10px] text-[#52525b] uppercase tracking-wider mb-2">Objects Interacted</p>
                  <div className="flex flex-wrap gap-1.5">
                    {objectsInteracted.map((obj, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] font-data rounded bg-[#1a1a1a] text-[#a1a1aa] border border-[#222]">
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Safety */}
          <div>
            <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Safety Status</h3>
            <div className="bg-[#111] rounded-lg border border-[#222] p-5 space-y-4">
              {/* PPE compliance header */}
              <div className="flex items-center gap-3 mb-2">
                {ppeAvg > 60 ? (
                  <ShieldCheck className="w-5 h-5 text-[#22c55e]" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-[#f59e0b]" />
                )}
                <span className="text-sm text-[#e4e4e7]">PPE Compliance</span>
                <span className="ml-auto text-lg font-data" style={{ color: ppeAvg > 70 ? '#22c55e' : ppeAvg > 30 ? '#f59e0b' : '#ef4444' }}>
                  {ppeAvg}%
                </span>
              </div>

              {/* PPE bars */}
              {ppe && (
                <div className="space-y-3">
                  <PPEBar label="Vest" pct={ppe.vest_visible_pct} />
                  <PPEBar label="Helmet" pct={ppe.helmet_visible_pct} />
                  <PPEBar label="Gloves" pct={ppe.gloves_visible_pct} />
                </div>
              )}

              {/* PPE items detected */}
              {ppeObserved.length > 0 && (
                <div className="border-t border-[#222] pt-3">
                  <p className="text-[10px] text-[#52525b] uppercase mb-2">Detected Items</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ppeObserved.map((item, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] font-data rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Concerns */}
              {safetyConcerns.length > 0 && (
                <div className="border-t border-[#222] pt-3 space-y-2">
                  {safetyConcerns.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2.5 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/5 text-[#fca5a5]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: AI Observations (VLM-only) */}
        {isVlmMode && (keyActions?.length || rawFallback) && (
          <div className="bg-[#8b5cf6]/5 rounded-xl border border-[#8b5cf6]/20 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-[#8b5cf6]" />
              <h3 className="text-lg font-semibold text-[#c4b5fd]">AI Observations</h3>
            </div>
            {rawFallback ? (
              <p className="text-sm text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">{rawFallback}</p>
            ) : keyActions ? (
              <div className="space-y-2">
                {keyActions.map((action, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#8b5cf6] shrink-0 mt-0.5" />
                    <span className="text-sm text-[#a1a1aa]">{action}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* Section 5: Raw data toggle */}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-2 text-xs text-[#52525b] hover:text-[#a1a1aa] transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
          {showRaw ? 'Hide' : 'View'} Raw Analysis Data
        </button>
        {showRaw && (
          <div className="bg-[#111] rounded-lg border border-[#222] p-4 max-h-[400px] overflow-auto">
            <pre className="text-[11px] font-data text-[#52525b] whitespace-pre-wrap">
              {JSON.stringify(analysis, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </Chapter>
  )
}
