import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'

export default function VlmAnalysis() {
  const vlmData = usePipelineStore((s) => s.vlmData)

  const skipped = vlmData?.skipped === true
  const analysis = (vlmData?.analysis ?? {}) as Record<string, unknown>

  return (
    <Chapter
      step="vlm"
      title="VLM Analysis"
      subtitle="Vision-language model narration using Grok to generate human-readable site analysis from visual + spatial data."
    >
      {vlmData && (
        <div className="space-y-6">
          {skipped ? (
            <div className="bg-[#111] rounded-lg border border-[#222] p-6 text-center">
              <p className="text-[#a1a1aa] mb-2">VLM analysis was skipped for this run.</p>
              <p className="text-xs text-[#52525b]">
                Enable VLM in the upload configuration and provide a Grok API key to generate natural language site analysis.
              </p>
            </div>
          ) : (
            <>
              {/* Activity timeline from VLM */}
              {Array.isArray(analysis.activity_timeline) && analysis.activity_timeline.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Activity Narration</h3>
                  <div className="space-y-2">
                    {(analysis.activity_timeline as { start?: string; end?: string; activity?: string; description?: string }[]).map((entry, i) => (
                      <div key={i} className="bg-[#111] rounded-lg border border-[#222] p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-xs font-data text-[#06b6d4]">
                            {entry.start} - {entry.end}
                          </span>
                          {entry.activity && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30">
                              {entry.activity}
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-sm text-[#a1a1aa]">{entry.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary stats */}
              {analysis.summary && typeof analysis.summary === 'object' && (
                <div>
                  <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Summary</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(analysis.summary as Record<string, unknown>).map(([key, val]) => (
                      <div key={key} className="bg-[#111] rounded-lg p-4 border border-[#222] text-center">
                        <p className="text-xs text-[#52525b] uppercase tracking-wider mb-1">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xl font-data text-[#e4e4e7]">
                          {typeof val === 'number' ? val.toFixed(1) : String(val)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Safety / PPE from VLM */}
              {analysis.safety && typeof analysis.safety === 'object' && Object.keys(analysis.safety as object).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Safety Assessment</h3>
                  <div className="bg-[#111] rounded-lg border border-[#222] p-5">
                    <pre className="text-xs font-data text-[#a1a1aa] whitespace-pre-wrap">
                      {JSON.stringify(analysis.safety, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Raw analysis fallback */}
              {!Array.isArray(analysis.activity_timeline) && Object.keys(analysis).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Analysis Output</h3>
                  <div className="bg-[#111] rounded-lg border border-[#222] p-5 max-h-[500px] overflow-auto">
                    <pre className="text-xs font-data text-[#a1a1aa] whitespace-pre-wrap">
                      {JSON.stringify(analysis, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Chapter>
  )
}
