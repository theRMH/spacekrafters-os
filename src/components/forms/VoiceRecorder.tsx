import { useState, useRef } from 'react'
import { Mic, Square, Trash2, Play, Pause } from 'lucide-react'
import { voicePreviewStore as voiceBlobStore, resolveFileUrl } from '../../utils/sessionStore'

// Re-export for backward compat with any existing imports
export { voiceBlobStore }

// Voice notes are embedded as data: URLs directly on the task instead of
// being uploaded to the file server — the server's MIME whitelist rejects
// audio-only WebM/Opus recordings (they get magic-byte-sniffed as
// video/webm by the server's file-type check), which silently left every
// voice note unplayable for anyone but the person who recorded it. This
// sidesteps that server dependency entirely. Capped well under typical
// DB/localStorage row limits — plenty for a voice note.
const MAX_VOICE_BYTES = 5 * 1024 * 1024

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read recording'))
    reader.readAsDataURL(blob)
  })
}

// Swaps the throwaway session id for the durable data: URL in the parent's
// saved list — otherwise only the temp id (which means nothing outside this
// browser session) ever gets persisted onto the task, and the recording
// becomes unplayable the moment the tab is closed. Returns whether it
// succeeded so the caller can surface a retry option instead of silently
// leaving a broken reference on the task.
async function persistVoiceBlob(id: string, blob: Blob, onReplace: (oldId: string, url: string) => void): Promise<boolean> {
  if (blob.size > MAX_VOICE_BYTES) return false
  try {
    const dataUrl = await blobToDataUrl(blob)
    voiceBlobStore.set(id, dataUrl)
    voiceBlobStore.set(dataUrl, dataUrl)
    onReplace(id, dataUrl)
    return true
  } catch {
    return false
  }
}

function VoiceNoteItem({ id, label, onRemove, uploading, failed, tooLarge, onRetry }: {
  id: string; label: string; onRemove: () => void
  uploading?: boolean; failed?: boolean; tooLarge?: boolean; onRetry?: () => void
}) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const url = voiceBlobStore.get(id) ?? resolveFileUrl(id)
  if (!url) return null

  function togglePlay() {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play().catch(() => setPlaying(false)); setPlaying(true) }
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <button type="button" onClick={togglePlay}
        className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-80 shadow-sm">
        {playing
          ? <Pause size={12} className="text-white" />
          : <Play  size={12} className="text-white ml-0.5" />
        }
      </button>
      <div className="flex-1">
        <p className="text-xs font-semibold text-purple-700">{label}</p>
        {uploading && <p className="text-[10px] text-purple-400">Saving — don't submit yet…</p>}
        {failed && tooLarge && <p className="text-[10px] text-red-500 font-semibold">Recording too long — delete and re-record something shorter.</p>}
        {failed && !tooLarge && <p className="text-[10px] text-red-500 font-semibold">Couldn't save — won't play for others.</p>}
      </div>
      {failed && !tooLarge && (
        <button type="button" onClick={onRetry} className="text-[10px] font-extrabold text-red-600 underline flex-shrink-0">
          Retry
        </button>
      )}
      <button type="button" onClick={onRemove} className="p-1 active:opacity-70">
        <Trash2 size={14} className="text-red-400" />
      </button>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
    </div>
  )
}

interface Props {
  label: string
  savedIds: string[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  onReplace?: (oldId: string, url: string) => void
  helperText?: string
}

export function VoiceRecorder({ label, savedIds, onAdd, onRemove, onReplace, helperText }: Props) {
  const [recording, setRecording]     = useState(false)
  const [timer,     setTimer]         = useState(0)
  const [micErr,    setMicErr]        = useState('')
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set())
  const [failedIds,    setFailedIds]    = useState<Set<string>>(new Set())

  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef   = useRef<Blob[]>([])
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const blobsRef    = useRef<Map<string, Blob>>(new Map())

  async function uploadRecording(id: string, blob: Blob) {
    setUploadingIds(prev => new Set(prev).add(id))
    setFailedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    const ok = await persistVoiceBlob(id, blob, (oldId, realUrl) => onReplace?.(oldId, realUrl))
    setUploadingIds(prev => { const n = new Set(prev); n.delete(id); return n })
    if (!ok) setFailedIds(prev => new Set(prev).add(id))
  }

  async function startRecording() {
    setMicErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      mediaRecRef.current = rec
      chunksRef.current = []

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const url  = URL.createObjectURL(blob)
        const id   = `voice_${Date.now()}`
        voiceBlobStore.set(id, url)
        blobsRef.current.set(id, blob)
        onAdd(id)
        uploadRecording(id, blob)
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        if (timerRef.current) clearInterval(timerRef.current)
      }

      rec.start()
      setRecording(true)
      setTimer(0)
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    } catch {
      setMicErr('Microphone access denied. Please allow mic permission.')
    }
  }

  function stopRecording() {
    if (mediaRecRef.current && recording) {
      mediaRecRef.current.stop()
    }
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">{label}</label>

      {/* Saved recordings — numbered by upload order (1 = first uploaded), newest first */}
      {savedIds.map((id, i) => ({ id, num: i + 1 })).reverse().map(({ id, num }) => (
        <VoiceNoteItem key={id} id={id} label={`Voice Note ${num}`} onRemove={() => onRemove(id)}
          uploading={uploadingIds.has(id)}
          failed={failedIds.has(id)}
          tooLarge={(blobsRef.current.get(id)?.size ?? 0) > MAX_VOICE_BYTES}
          onRetry={() => { const blob = blobsRef.current.get(id); if (blob) uploadRecording(id, blob) }} />
      ))}

      {/* Recording in progress */}
      {recording && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <p className="text-sm font-extrabold text-red-600">Recording… {fmt(timer)}</p>
          </div>
          <button type="button" onClick={stopRecording}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold active:opacity-90">
            <Square size={13} fill="white" /> Stop Recording
          </button>
        </div>
      )}

      {/* Add button — always shown when not recording */}
      {!recording && (
        <>
          <button type="button" onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-red-300 text-red-600 bg-red-50 text-sm font-semibold active:opacity-70">
            <Mic size={15} /> {savedIds.length > 0 ? 'Add Another Voice Note' : 'Start Recording'}
          </button>
          {micErr && <p className="text-[11px] text-red-500">{micErr}</p>}
        </>
      )}

      {helperText && (
        <p className="text-[11px] text-slate-400">{helperText}</p>
      )}
    </div>
  )
}
