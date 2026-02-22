import { usePipelineStore } from '../../store/pipeline'
import VideoUpload from '../upload/VideoUpload'
import { Radar } from 'lucide-react'

export default function Hero() {
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  if (pipelineStatus !== 'idle') return null

  return (
    <section className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center bg-grid">
      <div className="text-center mb-12">
        <Radar className="w-16 h-16 mx-auto mb-6 text-[#f59e0b]" />
        <h1 className="text-5xl font-bold tracking-tight text-[#e4e4e7] mb-3">
          IRONSITE <span className="text-[#f59e0b]">SPATIAL</span>
        </h1>
        <p className="text-lg text-[#a1a1aa] max-w-md mx-auto">
          Spatial Intelligence for Construction Sites
        </p>
        <p className="text-sm text-[#52525b] mt-2 max-w-lg mx-auto">
          Upload body camera footage to extract 3D scene understanding, object tracking,
          spatial memory, and activity analysis.
        </p>
      </div>
      <VideoUpload />
    </section>
  )
}
