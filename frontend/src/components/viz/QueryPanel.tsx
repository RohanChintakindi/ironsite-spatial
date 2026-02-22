import { useState } from 'react'
import { usePipelineStore } from '../../store/pipeline'
import { queryMemory } from '../../api/client'
import { Search } from 'lucide-react'
import clsx from 'clsx'

interface QueryDef {
  title: string
  description: string
  query: {
    query_type: 'label' | 'depth_range' | 'proximity'
    label?: string
    label_a?: string
    label_b?: string
    min_depth?: number
    max_depth?: number
    max_distance?: number
  }
}

const PRESET_QUERIES: QueryDef[] = [
  {
    title: 'Frames with blocks',
    description: 'Label search for concrete/cinder blocks',
    query: { query_type: 'label', label: 'block' },
  },
  {
    title: 'Objects 0.5-3m deep',
    description: 'Work range depth filter',
    query: { query_type: 'depth_range', min_depth: 0.5, max_depth: 3.0 },
  },
  {
    title: 'Worker near block <2m',
    description: 'Proximity query: worker within 2m of block',
    query: { query_type: 'proximity', label_a: 'worker', label_b: 'concrete block', max_distance: 2.0 },
  },
  {
    title: 'Trowel detections',
    description: 'All frames containing trowels',
    query: { query_type: 'label', label: 'trowel' },
  },
  {
    title: 'Rebar detections',
    description: 'All frames containing rebar',
    query: { query_type: 'label', label: 'rebar' },
  },
  {
    title: 'Person near trowel <1m',
    description: 'Proximity query: person within 1m of trowel',
    query: { query_type: 'proximity', label_a: 'person', label_b: 'trowel', max_distance: 1.0 },
  },
]

export default function QueryPanel() {
  const runId = usePipelineStore((s) => s.runId)
  const [results, setResults] = useState<Record<number, { count: number; entries: Record<string, unknown>[] }>>({})
  const [loading, setLoading] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const runQuery = async (idx: number) => {
    if (!runId) return
    setLoading(idx)
    try {
      const res = await queryMemory(runId, PRESET_QUERIES[idx].query)
      setResults((prev) => ({ ...prev, [idx]: { count: res.count, entries: res.entries } }))
      setExpanded(idx)
    } catch (e) {
      console.error('Query failed:', e)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {PRESET_QUERIES.map((q, i) => {
        const result = results[i]
        const isExpanded = expanded === i

        return (
          <div
            key={i}
            className={clsx(
              'rounded-lg border bg-[#0f0f14] transition-all',
              isExpanded ? 'border-[#f59e0b]/30' : 'border-[#1a1a1a]',
            )}
          >
            <button
              onClick={() => (result ? setExpanded(isExpanded ? null : i) : runQuery(i))}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm text-[#e4e4e7]">{q.title}</div>
                <div className="text-xs text-[#52525b] mt-0.5">{q.description}</div>
              </div>
              <div className="flex items-center gap-2">
                {result && (
                  <span className="font-data text-sm text-[#f59e0b]">{result.count}</span>
                )}
                {loading === i ? (
                  <div className="w-4 h-4 border-2 border-[#06b6d4] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-[#52525b]" />
                )}
              </div>
            </button>

            {isExpanded && result && result.entries.length > 0 && (
              <div className="px-4 pb-3 border-t border-[#1a1a1a] pt-3 max-h-48 overflow-y-auto">
                {result.entries.slice(0, 5).map((entry, j) => (
                  <div key={j} className="text-xs font-data text-[#a1a1aa] mb-2 p-2 rounded bg-[#1a1a1a]">
                    <span className="text-[#06b6d4]">Frame {String(entry.frame_idx)}</span>
                    {' | '}
                    <span>{String(entry.timestamp_str)}</span>
                    {Array.isArray(entry.detections) && (
                      <span className="text-[#52525b]">
                        {' | '}
                        {entry.detections.length} objects
                      </span>
                    )}
                  </div>
                ))}
                {result.entries.length > 5 && (
                  <div className="text-xs text-[#52525b] text-center">
                    +{result.entries.length - 5} more results
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
