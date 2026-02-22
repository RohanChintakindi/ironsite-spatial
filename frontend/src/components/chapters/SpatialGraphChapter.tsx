import { useMemo, useRef, useEffect, useState } from 'react'
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

          {/* ─── Force-directed graph visualization ─── */}
          <div>
            <h3 className="text-lg font-bold text-[#e4e4e7] tracking-tight mb-4">Graph Visualization</h3>
            <div className="rounded-xl overflow-hidden border border-[#1a1a1a]">
              <ForceGraph
                nodes={objectNodes}
                edges={spatialEdges}
              />
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-3">
              {Object.entries(RELATION_COLORS).filter(([k]) => k !== 'NEXT').map(([rel, color]) => (
                <div key={rel} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="text-[10px] font-data text-[#52525b]">{rel}</span>
                </div>
              ))}
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
                    className="bg-[#0f0f14] rounded-lg p-3 border border-[#1a1a1a] flex items-center gap-3"
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


/* ── Force-directed graph rendered in SVG ── */

interface GraphNode {
  id: string
  type: string
  label: string
  color: string
  [k: string]: unknown
}

interface GraphEdge {
  source: string
  target: string
  relation: string
  weight: number
  color: string
}

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

function ForceGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
}) {
  const W = 900
  const H = 500
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  // Build simulation data — run a simple force layout
  const { simNodes, simEdges } = useMemo(() => {
    if (nodes.length === 0) return { simNodes: [], simEdges: [] }

    // Deduplicate nodes by id and limit to keep it readable
    const uniqueMap = new Map<string, GraphNode>()
    for (const n of nodes) {
      if (!uniqueMap.has(n.id)) uniqueMap.set(n.id, n)
    }
    const uniqueNodes = Array.from(uniqueMap.values()).slice(0, 60)
    const nodeIds = new Set(uniqueNodes.map((n) => n.id))

    // Filter edges to only include nodes we have
    const filteredEdges = edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    ).slice(0, 150)

    // Initialize positions in a circle
    const sn: SimNode[] = uniqueNodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / uniqueNodes.length
      const r = Math.min(W, H) * 0.3
      return {
        ...n,
        x: W / 2 + r * Math.cos(angle),
        y: H / 2 + r * Math.sin(angle),
        vx: 0,
        vy: 0,
      }
    })

    const nodeMap = new Map(sn.map((n) => [n.id, n]))

    // Simple force simulation (run synchronously for ~80 iterations)
    for (let iter = 0; iter < 80; iter++) {
      const alpha = 1 - iter / 80

      // Repulsion between all nodes
      for (let i = 0; i < sn.length; i++) {
        for (let j = i + 1; j < sn.length; j++) {
          const dx = sn[j].x - sn[i].x
          const dy = sn[j].y - sn[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (800 * alpha) / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          sn[i].vx -= fx
          sn[i].vy -= fy
          sn[j].vx += fx
          sn[j].vy += fy
        }
      }

      // Attraction along edges
      for (const e of filteredEdges) {
        const src = nodeMap.get(e.source)
        const tgt = nodeMap.get(e.target)
        if (!src || !tgt) continue
        const dx = tgt.x - src.x
        const dy = tgt.y - src.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * 0.01 * alpha
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        src.vx += fx
        src.vy += fy
        tgt.vx -= fx
        tgt.vy -= fy
      }

      // Center gravity
      for (const n of sn) {
        n.vx += (W / 2 - n.x) * 0.005 * alpha
        n.vy += (H / 2 - n.y) * 0.005 * alpha
      }

      // Apply velocity with damping
      for (const n of sn) {
        n.vx *= 0.6
        n.vy *= 0.6
        n.x += n.vx
        n.y += n.vy
        // Keep in bounds
        n.x = Math.max(40, Math.min(W - 40, n.x))
        n.y = Math.max(40, Math.min(H - 40, n.y))
      }
    }

    return { simNodes: sn, simEdges: filteredEdges }
  }, [nodes, edges])

  if (simNodes.length === 0) {
    return (
      <div className="aspect-[16/9] flex items-center justify-center text-sm text-[#3f3f46] bg-[#0f0f14]">
        No graph data to visualize
      </div>
    )
  }

  const nodeMap = new Map(simNodes.map((n) => [n.id, n]))

  // Find edges connected to hovered node
  const highlightedEdges = hoveredNode
    ? new Set(
        simEdges
          .filter((e) => e.source === hoveredNode || e.target === hoveredNode)
          .map((_, i) => i),
      )
    : null

  const connectedNodes = hoveredNode
    ? new Set(
        simEdges
          .filter((e) => e.source === hoveredNode || e.target === hoveredNode)
          .flatMap((e) => [e.source, e.target]),
      )
    : null

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full aspect-[16/9]"
      style={{ background: '#0a0a0f' }}
    >
      {/* Edges */}
      {simEdges.map((e, i) => {
        const src = nodeMap.get(e.source)
        const tgt = nodeMap.get(e.target)
        if (!src || !tgt) return null
        const color = RELATION_COLORS[e.relation] ?? '#333'
        const dimmed = highlightedEdges && !highlightedEdges.has(i)
        return (
          <line
            key={i}
            x1={src.x}
            y1={src.y}
            x2={tgt.x}
            y2={tgt.y}
            stroke={color}
            strokeWidth={Math.min(3, 0.5 + e.weight * 0.3)}
            opacity={dimmed ? 0.05 : 0.35}
          />
        )
      })}

      {/* Nodes */}
      {simNodes.map((n) => {
        const dimmed = connectedNodes && !connectedNodes.has(n.id) && n.id !== hoveredNode
        const isHovered = n.id === hoveredNode
        const r = isHovered ? 10 : 7
        return (
          <g
            key={n.id}
            onMouseEnter={() => setHoveredNode(n.id)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={n.x}
              cy={n.y}
              r={r}
              fill={n.color}
              opacity={dimmed ? 0.15 : 0.85}
              stroke={isHovered ? '#fff' : 'none'}
              strokeWidth={isHovered ? 2 : 0}
            />
            {/* Label — show on hover or if not too crowded */}
            {(isHovered || simNodes.length <= 20) && (
              <text
                x={n.x}
                y={n.y - r - 5}
                fontSize={isHovered ? 12 : 10}
                fill={dimmed ? '#333' : '#a1a1aa'}
                textAnchor="middle"
                fontFamily="'JetBrains Mono', monospace"
              >
                {n.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
