import { usePipelineStore } from '../../store/pipeline'
import VideoUpload from '../upload/VideoUpload'
import { motion } from 'framer-motion'
import { Radar } from 'lucide-react'

export default function Hero() {
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  if (pipelineStatus !== 'idle') return null

  return (
    <section className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center bg-grid relative overflow-hidden">
      {/* Ambient glow behind content */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(245,158,11,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="text-center mb-14 relative">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="relative inline-block mb-8"
        >
          <Radar className="w-14 h-14 text-[#f59e0b]" />
          <div className="absolute inset-0 w-14 h-14 bg-[#f59e0b]/15 rounded-full blur-xl" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl font-extrabold tracking-tight text-[#e4e4e7] mb-3"
        >
          IRON<span className="text-[#f59e0b]">VISION</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg text-[#a1a1aa] max-w-md mx-auto font-medium"
        >
          Spatial Intelligence for Construction Sites
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-sm text-[#52525b] mt-3 max-w-lg mx-auto leading-relaxed"
        >
          Upload body camera footage to extract 3D scene understanding, object tracking,
          spatial memory, and activity analysis.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <VideoUpload />
      </motion.div>
    </section>
  )
}
