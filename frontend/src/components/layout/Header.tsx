import { Radar } from 'lucide-react'
import { usePipelineStore } from '../../store/pipeline'
import clsx from 'clsx'

export default function Header() {
  const connected = usePipelineStore((s) => s.connected)
  const pipelineStatus = usePipelineStore((s) => s.pipelineStatus)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 border-b border-[#222] bg-[#0a0a0f]/90 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Radar className="w-6 h-6 text-[#f59e0b]" />
        <span className="text-sm font-semibold tracking-wider uppercase text-[#e4e4e7]">
          Ironsite Spatial
        </span>
      </div>
      <div className="flex items-center gap-3">
        {pipelineStatus !== 'idle' && (
          <span className="font-data text-xs text-[#a1a1aa] uppercase">
            {pipelineStatus}
          </span>
        )}
        <div
          className={clsx(
            'w-2.5 h-2.5 rounded-full',
            connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-[#52525b]',
          )}
          title={connected ? 'WebSocket connected' : 'Disconnected'}
        />
      </div>
    </header>
  )
}
