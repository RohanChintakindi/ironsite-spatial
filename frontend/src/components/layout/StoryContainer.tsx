import { usePipelineStore } from '../../store/pipeline'

interface StoryContainerProps {
  children: React.ReactNode
}

export default function StoryContainer({ children }: StoryContainerProps) {
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)
  const hasStarted = pipelineStatus !== 'idle'

  return (
    <main
      className="pt-14"
      style={{ marginLeft: hasStarted ? '14rem' : '0' }}
    >
      <div className="max-w-6xl mx-auto px-6 lg:px-12">
        {children}
      </div>
    </main>
  )
}
