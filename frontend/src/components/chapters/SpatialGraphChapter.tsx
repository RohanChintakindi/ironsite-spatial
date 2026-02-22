import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import AnimatedNumber from '../ui/AnimatedNumber'

const RELATION_COLORS: Record<string, string> = {
  NEAR: '#22c55e',
  LEFT_OF: '#3b82f6',
  RIGHT_OF: '#8b5cf6',
  ABOVE: '#f59e0b',
  BELOW: '#ef4444',
  NEXT: '#06b6d4',
}

export default function SpatialGraphChapter() {
  const graphData = usePipelineStore((s) => s.graphData)

  const objectNodes = graphData?.nodes.filter((n) => n.type === 'object') ?? []
  const frameNodes = graphData?.nodes.filter((n) => n.type === 'frame') ?? []
  const spatialEdges = graphData?.edges.filter((e) => e.relation !== 'NEXT') ?? []
  const stats = graphData?.stats

  return (
    <Chapter
      step="graph"
      title="Spatial Graph"
      subtitle="NetworkX knowledge graph encoding object relationships, spatial proximity, and temporal co-occurrence across all frames."
    >
      {graphData && (
        <div className="space-y-8">
          {/* Stats cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#0f0f14] rounded-lg p-4 border border-[#1a1a1a] text-center card-highlight card-glow">
              <p className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">Nodes</p>
              <AnimatedNumber value={stats?.total_nodes ?? graphData.nodes.length} className="text-2xl font-bold text-[#e4e4e7]" />
            </div>
            <div className="bg-[#0f0f14] rounded-lg p-4 border border-[#1a1a1a] text-center card-highlight card-glow">
              <p className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">Edges</p>
              <AnimatedNumber value={stats?.total_edges ?? graphData.edges.length} className="text-2xl font-bold text-[#e4e4e7]" />
            </div>
            <div className="bg-[#0f0f14] rounded-lg p-4 border border-[#1a1a1a] text-center card-highlight card-glow">
              <p className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">Objects</p>
              <AnimatedNumber value={objectNodes.length} className="text-2xl font-bold text-[#f59e0b]" />
            </div>
            <div className="bg-[#0f0f14] rounded-lg p-4 border border-[#1a1a1a] text-center card-highlight card-glow">
              <p className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">Frames</p>
              <AnimatedNumber value={frameNodes.length} className="text-2xl font-bold text-[#06b6d4]" />
            </div>
          </div>

          {/* Relationship breakdown */}
          {stats?.edge_types && Object.keys(stats.edge_types).length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-[#e4e4e7] tracking-tight mb-4">Relationship Types</h3>
              <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] p-5 space-y-3">
                {Object.entries(stats.edge_types)
                  .sort(([, a], [, b]) => b - a)
                  .map(([rel, count]) => {
                    const maxCount = Math.max(...Object.values(stats.edge_types))
                    const pct = (count / maxCount) * 100
                    const color = RELATION_COLORS[rel] ?? '#a1a1aa'
                    return (
                      <div key={rel} className="flex items-center gap-3">
                        <span className="text-xs font-data w-20 shrink-0" style={{ color }}>{rel}</span>
                        <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-xs font-data text-[#a1a1aa] w-12 text-right">{count}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Object nodes */}
          <div>
            <h3 className="text-lg font-bold text-[#e4e4e7] tracking-tight mb-4">Tracked Objects</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {objectNodes.map((node) => {
                const connections = spatialEdges.filter(
                  (e) => e.source === node.id || e.target === node.id,
                ).length
                return (
                  <div
                    key={node.id}
                    className="bg-[#111] rounded-lg p-3 border border-[#222] flex items-center gap-3"
                  >
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: node.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-[#e4e4e7] truncate">{node.label}</p>
                      <p className="text-[10px] font-data text-[#52525b]">
                        {connections} relation{connections !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top spatial relations */}
          {spatialEdges.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-[#e4e4e7] tracking-tight mb-4">Spatial Relations</h3>
              <div className="bg-[#0f0f14] rounded-lg border border-[#1a1a1a] overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {spatialEdges
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 50)
                    .map((edge, i) => {
                      const srcNode = graphData.nodes.find((n) => n.id === edge.source)
                      const tgtNode = graphData.nodes.find((n) => n.id === edge.target)
                      const color = RELATION_COLORS[edge.relation] ?? '#a1a1aa'
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-4 py-2 border-b border-[#1a1a1a] text-xs font-data"
                        >
                          <span className="text-[#e4e4e7] w-28 truncate">{srcNode?.label ?? edge.source}</span>
                          <span className="px-2 py-0.5 rounded text-[10px]" style={{ color, borderColor: color, border: '1px solid' }}>
                            {edge.relation}
                          </span>
                          <span className="text-[#e4e4e7] w-28 truncate">{tgtNode?.label ?? edge.target}</span>
                          <span className="ml-auto text-[#52525b]">{edge.weight}x</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Chapter>
  )
}
