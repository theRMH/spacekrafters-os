import { createPortal } from 'react-dom'
import { X, MapPin } from 'lucide-react'
import type { AttendanceCapture } from '../../types'

interface Props {
  capture: AttendanceCapture
  label: string        // "Start" | "End"
  timestamp?: string   // ISO — the moment this capture was taken
  onClose: () => void
}

function fmtTimestamp(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// A compact photo/GPS preview — not a form-style Dialog (title bar, Cancel
// button, big padded box). The photo itself already has date/time/location
// stamped on it (see AttendanceCaptureSheet's canvas stamp); this just gives
// a bigger look plus a tappable map link, closer to a lightweight lightbox
// than a popup that has to restate everything the photo already shows.
export function AttendanceCapturePreview({ capture, label, timestamp, onClose }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 animate-fade-in" />
      <div onClick={e => e.stopPropagation()}
        className="relative bg-white rounded-2xl shadow-sheet w-full max-w-xs overflow-hidden animate-fade-in">
        <button onClick={onClose} aria-label="Close"
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center active:bg-black/70">
          <X size={14} className="text-white" />
        </button>
        <img src={capture.photoUrl} alt={`${label} attendance photo`} className="w-full max-h-72 object-cover bg-slate-100" />
        <div className="px-3.5 py-2.5 bg-slate-50 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-700">{label}{timestamp ? ` · ${fmtTimestamp(timestamp)}` : ''}</p>
            <p className="text-[11px] text-slate-500 truncate">{capture.lat.toFixed(6)}, {capture.lng.toFixed(6)}</p>
          </div>
          <a href={`https://maps.google.com/?q=${capture.lat},${capture.lng}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 shrink-0 text-[12px] font-semibold text-indigo-600 active:opacity-70">
            <MapPin size={12} /> Map
          </a>
        </div>
      </div>
    </div>,
    document.body,
  )
}
