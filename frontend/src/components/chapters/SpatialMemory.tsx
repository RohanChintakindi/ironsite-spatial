import Chapter from '../layout/Chapter'
import QueryPanel from '../viz/QueryPanel'

export default function SpatialMemory() {
  return (
    <Chapter
      step="memory"
      title="Spatial Memory"
      subtitle="FAISS-indexed spatial memory enables fast queries over scene graphs: by label, depth range, or object proximity."
    >
      <QueryPanel />
    </Chapter>
  )
}
