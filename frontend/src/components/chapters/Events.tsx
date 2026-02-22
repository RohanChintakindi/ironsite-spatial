import { usePipelineStore } from '../../store/pipeline'
import Chapter from '../layout/Chapter'
import type { TimelineSegment } from '../../api/types'

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

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#a1a1aa] w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, score)}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-data text-[#e4e4e7] w-10 text-right">{Math.round(score)}</span>
    </div>
  )
}

function PPEBar({ label, pct }: { label: string; pct: number }) {
  const color = pct > 70 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#a1a1aa] w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-data text-[#e4e4e7] w-12 text-right">{pct.toFixed(0)}%</span>
    </div>
  )
}

function Timeline({ segments }: { segments: TimelineSegment[] }) {
  if (!segments.length) return null
  const totalDur = segments[segments.length - 1].end_sec - segments[0].start_sec
  if (totalDur <= 0) return null

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-8 rounded-lg overflow-hidden border border-[#222]">
        {segments.map((seg, i) => {
          const widthPct = (seg.duration_sec / totalDur) * 100
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
                {seg.start} - {seg.end} | {ACTIVITY_LABELS[seg.activity]} | {seg.duration_sec.toFixed(0)}s
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3 justify-center">
        {Object.entries(ACTIVITY_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-[#a1a1aa]">{ACTIVITY_LABELS[key]}</span>
          </div>
        ))}
      </div>

      {/* Segment list */}
      <div className="mt-4 max-h-48 overflow-y-auto space-y-1">
        {segments.slice(0, 30).map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] font-data px-2 py-1 rounded bg-[#0d0d0d]">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: ACTIVITY_COLORS[seg.activity] }} />
            <span className="text-[#52525b] w-24">{seg.start} - {seg.end}</span>
            <span className="text-[#a1a1aa] w-20">{ACTIVITY_LABELS[seg.activity]}</span>
            <span className="text-[#52525b]">{seg.duration_sec.toFixed(0)}s ({seg.num_frames}f)</span>
          </div>
        ))}
        {segments.length > 30 && (
          <p className="text-[10px] text-[#52525b] text-center">+{segments.length - 30} more segments</p>
        )}
      </div>
    </div>
  )
}

export default function Events() {
  const eventsData = usePipelineStore((s) => s.eventsData)

  return (
    <Chapter step="events" title="Event Analysis" subtitle="Production metrics, PPE compliance, performance scoring, and optimization suggestions extracted from all frames.">
      {eventsData && (
        <div className="space-y-10">
          {/* Section A: Productivity Overview */}
          <div>
            <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Productivity Overview</h3>
            <div className="grid grid-cols-5 gap-4">
              <div className="bg-[#111] rounded-lg p-4 border border-[#222] text-center">
                <p className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Production</p>
                <p className="text-2xl font-data text-[#22c55e]">{eventsData.stats.production_pct.toFixed(0)}%</p>
              </div>
              <div className="bg-[#111] rounded-lg p-4 border border-[#222] text-center">
                <p className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Prep</p>
                <p className="text-2xl font-data text-[#f59e0b]">{eventsData.stats.prep_pct.toFixed(0)}%</p>
              </div>
              <div className="bg-[#111] rounded-lg p-4 border border-[#222] text-center">
                <p className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Downtime</p>
                <p className="text-2xl font-data text-[#ef4444]">{eventsData.stats.downtime_pct.toFixed(0)}%</p>
              </div>
              <div className="bg-[#111] rounded-lg p-4 border border-[#222] text-center">
                <p className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Distance</p>
                <p className="text-2xl font-data text-[#e4e4e7]">{eventsData.stats.distance_traveled_m.toFixed(1)}m</p>
              </div>
              <div className="bg-[#111] rounded-lg p-4 border border-[#f59e0b]/30 text-center">
                <p className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Efficiency</p>
                <p className="text-2xl font-data text-[#f59e0b]">{eventsData.performance.efficiency.overall_score.toFixed(0)}<span className="text-sm text-[#52525b]">/100</span></p>
              </div>
            </div>
          </div>

          {/* Section B: Activity Timeline */}
          <div>
            <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Activity Timeline</h3>
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <Timeline segments={eventsData.timeline} />
            </div>
          </div>

          {/* Section C: Performance + PPE */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Performance */}
            <div>
              <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Performance</h3>
              <div className="bg-[#111] rounded-lg p-5 border border-[#222] space-y-4">
                <ScoreBar label="Production" score={eventsData.performance.efficiency.production_score} color="#22c55e" />
                <ScoreBar label="Movement" score={eventsData.performance.efficiency.movement_score} color="#3b82f6" />
                <ScoreBar label="Continuity" score={eventsData.performance.efficiency.continuity_score} color="#8b5cf6" />

                <div className="border-t border-[#222] pt-4 mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Blocks/min</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.performance.quantity.blocks_per_min_production.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Tool changes/min</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.performance.quantity.tool_changes_per_min.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Idle periods</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.performance.quantity.idle_periods}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Work area</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.performance.spatial.work_area_m2.toFixed(1)} m&sup2;</p>
                  </div>
                </div>

                {/* Suggestions */}
                {eventsData.performance.suggestions.length > 0 && (
                  <div className="border-t border-[#222] pt-4 space-y-2">
                    <p className="text-xs text-[#52525b] uppercase tracking-wider">Suggestions</p>
                    {eventsData.performance.suggestions.map((s, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2.5 rounded-lg border ${
                          s.severity === 'high'
                            ? 'border-[#ef4444]/30 bg-[#ef4444]/5 text-[#fca5a5]'
                            : s.severity === 'medium'
                            ? 'border-[#f59e0b]/30 bg-[#f59e0b]/5 text-[#fcd34d]'
                            : 'border-[#22c55e]/30 bg-[#22c55e]/5 text-[#86efac]'
                        }`}
                      >
                        {s.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: PPE */}
            <div>
              <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">PPE Compliance</h3>
              <div className="bg-[#111] rounded-lg p-5 border border-[#222] space-y-4">
                <PPEBar label="Vest" pct={eventsData.ppe_report.vest_visible_pct} />
                <PPEBar label="Helmet" pct={eventsData.ppe_report.helmet_visible_pct} />
                <PPEBar label="Gloves" pct={eventsData.ppe_report.gloves_visible_pct} />

                <div className="border-t border-[#222] pt-4 mt-4">
                  <p className="text-[10px] text-[#52525b] uppercase mb-2">Detected PPE Items</p>
                  <div className="flex flex-wrap gap-1.5">
                    {eventsData.ppe_report.all_ppe_items.map((item) => (
                      <span key={item} className="px-2 py-0.5 text-[10px] font-data rounded bg-[#1a1a1a] text-[#a1a1aa] border border-[#222]">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                {eventsData.ppe_report.concerns.length > 0 && (
                  <div className="border-t border-[#222] pt-4 space-y-2">
                    <p className="text-xs text-[#52525b] uppercase tracking-wider">Concerns</p>
                    {eventsData.ppe_report.concerns.map((c, i) => (
                      <div key={i} className="text-xs p-2.5 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/5 text-[#fca5a5]">
                        {c}
                      </div>
                    ))}
                  </div>
                )}

                {/* Event counts */}
                <div className="border-t border-[#222] pt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Total events</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.events.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Block interactions</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.stats.block_interactions}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Tool pickups</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.stats.tool_pickups}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#52525b] uppercase">Relocations</p>
                    <p className="text-sm font-data text-[#e4e4e7]">{eventsData.stats.relocations}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Chapter>
  )
}
