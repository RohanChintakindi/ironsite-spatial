import { useState, useCallback, useRef } from 'react'
import { Upload, Play, Settings, Film } from 'lucide-react'
import clsx from 'clsx'
import { startPipeline, uploadVideo } from '../../api/client'
import { usePipelineStore } from '../../store/pipeline'

export default function VideoUpload() {
  const [videoPath, setVideoPath] = useState('')
  const [fileName, setFileName] = useState('')
  const [backend, setBackend] = useState<'vggtx' | 'fastvggt'>('vggtx')
  const [interval, setInterval] = useState(10)
  const [grokKey, setGrokKey] = useState('')
  const [skipVlm, setSkipVlm] = useState(true)
  const [showConfig, setShowConfig] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setRunId = usePipelineStore((s) => s.setRunId)
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus)

  const uploadFile = async (file: File) => {
    setUploading(true)
    setError('')
    setFileName(file.name)
    try {
      const result = await uploadVideo(file)
      setVideoPath(result.video_path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
      setFileName('')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('video/')) {
      uploadFile(file)
    } else if (file) {
      setError('Please drop a video file (.mp4, .avi, .mov)')
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  const handleStart = useCallback(async () => {
    if (!videoPath.trim()) {
      setError('Please upload a video or enter a path')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { run_id } = await startPipeline({
        video_path: videoPath.trim(),
        backend,
        keyframe_interval: interval,
        max_frames: 0,
        grok_key: grokKey.trim() || undefined,
        skip_vlm: skipVlm,
      })
      setRunId(run_id)
      setPipelineStatus('running')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start pipeline')
    } finally {
      setLoading(false)
    }
  }, [videoPath, backend, interval, grokKey, skipVlm, setRunId, setPipelineStatus])

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={clsx(
          'rounded-xl border-2 border-dashed p-10 text-center transition-all duration-300 cursor-pointer relative overflow-hidden',
          dragOver
            ? 'border-[#f59e0b] bg-[#f59e0b]/5 scale-[1.01]'
            : 'border-[#2a2a2a] bg-[#0f0f14] hover:border-[#f59e0b]/30 hover:bg-[#111]',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <>
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#a1a1aa]">Uploading {fileName}...</p>
          </>
        ) : fileName ? (
          <>
            <Film className="w-10 h-10 mx-auto mb-3 text-[#f59e0b]" />
            <p className="text-sm text-[#e4e4e7] font-data">{fileName}</p>
            <p className="text-xs text-[#52525b] mt-1.5">Click or drop to change</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 mx-auto mb-3 text-[#3f3f46]" />
            <p className="text-sm text-[#a1a1aa]">
              Drop video here or <span className="text-[#f59e0b] font-medium">click to browse</span>
            </p>
            <p className="text-xs text-[#3f3f46] mt-1.5 font-data">.mp4  .avi  .mov</p>
          </>
        )}
      </div>

      {/* Or enter path manually */}
      <div className="mt-5">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#222] to-transparent" />
          <span className="text-[10px] text-[#3f3f46] uppercase tracking-[0.15em] font-data">or enter path</span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#222] to-transparent" />
        </div>
        <input
          type="text"
          placeholder="Server path (e.g., /data/video.mp4)"
          value={videoPath}
          onChange={(e) => { setVideoPath(e.target.value); setFileName('') }}
          className="w-full bg-[#0f0f14] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-sm text-[#e4e4e7] placeholder-[#3f3f46] focus:outline-none focus:border-[#f59e0b]/40 font-data transition-colors duration-200"
        />
      </div>

      {/* Config toggle */}
      <button
        onClick={() => setShowConfig(!showConfig)}
        className="flex items-center gap-2 mt-5 text-xs text-[#52525b] hover:text-[#a1a1aa] transition-colors duration-200"
      >
        <Settings className="w-3.5 h-3.5" />
        <span className="tracking-wider uppercase text-[10px] font-medium">Configuration</span>
      </button>

      {/* Config panel */}
      {showConfig && (
        <div className="mt-3 p-4 rounded-lg bg-[#0f0f14] border border-[#222] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#a1a1aa]">3D Backend</label>
            <div className="flex gap-2">
              {(['vggtx', 'fastvggt'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBackend(b)}
                  className={clsx(
                    'px-3 py-1 rounded text-xs font-data transition-all duration-200',
                    backend === b
                      ? 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/25'
                      : 'bg-[#1a1a1a] text-[#52525b] border border-[#222] hover:border-[#333]',
                  )}
                >
                  {b === 'vggtx' ? 'VGGT-X' : 'FastVGGT'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#a1a1aa]">Keyframe Interval</label>
            <input
              type="number"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              min={1}
              max={100}
              className="w-20 bg-[#1a1a1a] border border-[#222] rounded px-2 py-1 text-xs text-[#e4e4e7] font-data text-right focus:outline-none focus:border-[#f59e0b]/40 transition-colors duration-200"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-[#a1a1aa]">VLM Analysis</label>
            <button
              onClick={() => setSkipVlm(!skipVlm)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-data transition-all duration-200',
                !skipVlm
                  ? 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/25'
                  : 'bg-[#1a1a1a] text-[#52525b] border border-[#222] hover:border-[#333]',
              )}
            >
              {skipVlm ? 'Disabled' : 'Enabled'}
            </button>
          </div>
          {!skipVlm && (
            <div>
              <label className="text-xs text-[#a1a1aa] block mb-1.5">Grok API Key</label>
              <input
                type="password"
                value={grokKey}
                onChange={(e) => setGrokKey(e.target.value)}
                placeholder="xai-..."
                className="w-full bg-[#1a1a1a] border border-[#222] rounded px-3 py-1.5 text-xs text-[#e4e4e7] font-data focus:outline-none focus:border-[#f59e0b]/40 placeholder-[#3f3f46] transition-colors duration-200"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400 font-data">{error}</p>}

      {/* Start button */}
      <button
        onClick={handleStart}
        disabled={loading || !videoPath.trim()}
        className={clsx(
          'w-full mt-6 py-3.5 rounded-xl font-bold text-sm tracking-[0.1em] uppercase transition-all duration-300 flex items-center justify-center gap-2.5',
          loading || !videoPath.trim()
            ? 'bg-[#1a1a1a] text-[#3f3f46] cursor-not-allowed border border-[#222]'
            : 'bg-[#f59e0b] text-[#0a0a0f] hover:bg-[#fbbf24] glow-amber cursor-pointer active:scale-[0.98]',
        )}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {loading ? 'Starting...' : 'Begin Analysis'}
      </button>
    </div>
  )
}
