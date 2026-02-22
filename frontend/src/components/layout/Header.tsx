import { Radar } from 'lucide-react'
import { usePipelineStore } from '../../store/pipeline'
import clsx from 'clsx'

export default function Header() {
  const connected = usePipelineStore((s) => s.connected)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 bg-[#0a0a0f]/80 backdrop-blur-md"
      style={{
        borderBottom: '1px solid transparent',
        borderImage: 'linear-gradient(90deg, transparent, #333 20%, #f59e0b20 50%, #333 80%, transparent) 1',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Radar className="w-5 h-5 text-[#f59e0b]" />
          <div className="absolute inset-0 w-5 h-5 bg-[#f59e0b]/20 rounded-full blur-md" />
        </div>
        <span className="text-[13px] font-bold tracking-[0.2em] uppercase text-[#e4e4e7]">
          Ironsite
        </span>
        <span className="text-[13px] font-bold tracking-[0.2em] uppercase text-[#f59e0b]">
          Spatial
        </span>
      </div>
      <div className="flex items-center gap-4">
        {pipelineStatus !== 'idle' && (
          <span className="font-data text-[10px] text-[#52525b] uppercase tracking-widest">
            {pipelineStatus}
          </span>
        )}
        <div className="flex items-center gap-2">
          <div
            className={clsx(
              'w-2 h-2 rounded-full transition-all duration-500',
              connected
                ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]'
                : 'bg-[#333]',
            )}
          />
          <span className="text-[10px] font-data text-[#52525b] uppercase tracking-wider">
            {connected ? 'Live' : 'Off'}
          </span>
        </div>
      </div>
    </header>
  )
}
