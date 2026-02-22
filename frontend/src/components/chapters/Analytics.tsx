import Chapter from '../layout/Chapter'
import Dashboard from '../viz/Dashboard'

export default function Analytics() {
  return (
    <Chapter
      step="memory"
      title="Analytics Dashboard"
      subtitle="Aggregated spatial analytics: detection frequency, depth distribution, temporal patterns, and spatial density."
    >
      <Dashboard />
    </Chapter>
  )
}
