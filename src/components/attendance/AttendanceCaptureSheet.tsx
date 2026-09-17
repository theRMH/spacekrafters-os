import { useEffect, useRef, useState } from 'react'
import { Camera, Upload, Loader, MapPin, AlertTriangle, X } from 'lucide-react'
import { BottomSheet } from '../feedback/BottomSheet'
import { storeFile } from '../../utils/fileStorage'
import type { AttendanceCapture } from '../../types'

type Stage = 'locating' | 'denied' | 'ready' | 'camera' | 'camera_error' | 'processing' | 'error'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  onCaptured: (result: AttendanceCapture & { timestamp: string }) => void
}

// Draws the captured photo to an offscreen canvas with a date/time/location
// bar stamped across the bottom, GPS-camera-app style, then returns it as a
// File ready for storeFile(). This is what makes the photo itself carry the
// date/time/location, not just the attendance record's metadata.
async function stampPhoto(file: File, lat: number, lng: number, when: Date): Promise<File> {
  const imgUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = imgUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0)

    const barHeight = Math.max(48, Math.round(canvas.height * 0.09))
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight)

    const fontSize = Math.max(12, Math.round(barHeight * 0.28))
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textBaseline = 'middle'
    const pad = Math.round(barHeight * 0.18)
    const dateLine = when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })
    const geoLine = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    ctx.fillText(dateLine, pad, canvas.height - barHeight + barHeight * 0.32)
    ctx.fillText(geoLine, pad, canvas.height - barHeight + barHeight * 0.72)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '_stamped.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(imgUrl)
  }
}

// No geofence check — GPS + photo are always captured and stored (visible to
// MD/Admin for verification), but attendance is never blocked by distance
// from any configured office point.
//
// "Open Camera" is a real live camera (getUserMedia + a shutter button), not
// a file-input with a capture="environment" hint — that hint is a mobile-only
// convention that desktop Chrome/Firefox/Edge simply ignore, silently
// falling back to the plain file picker (indistinguishable from "Upload
// Photo"). A live preview behaves the same, and looks the same, on every
// platform. "Upload Photo" stays a plain file input for picking an existing
// image.
export function AttendanceCaptureSheet({ isOpen, onClose, title, onCaptured }: Props) {
  const [stage, setStage] = useState<Stage>('locating')
  const [errorMsg, setErrorMsg] = useState('')
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  function requestLocation() {
    setStage('locating')
    setErrorMsg('')
    if (!navigator.geolocation) {
      setStage('error'); setErrorMsg('Geolocation is not supported on this device/browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setStage('ready')
      },
      () => { setStage('denied'); setErrorMsg('Location access denied. Enable location permission and try again.') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  useEffect(() => {
    if (isOpen) requestLocation()
    else stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Stop the camera stream on unmount too, not just on an explicit close —
  // otherwise the camera light stays on if the sheet is torn down some other
  // way (e.g. navigating away mid-capture).
  useEffect(() => () => stopCamera(), [])

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function openCamera() {
    setStage('camera')
    setErrorMsg('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setStage('camera_error')
      setErrorMsg('Camera is not supported in this browser. Use Upload Photo instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      setStage('camera_error')
      setErrorMsg(err instanceof Error && err.name === 'NotAllowedError'
        ? 'Camera access denied. Enable camera permission and try again, or use Upload Photo instead.'
        : 'Could not open the camera. Try again, or use Upload Photo instead.')
    }
  }

  async function capturePhoto() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    stopCamera()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) { setStage('camera_error'); setErrorMsg('Could not capture the photo. Try again.'); return }
    await handlePhotoSelected(new File([blob], 'camera_capture.jpg', { type: 'image/jpeg' }))
  }

  function cancelCamera() {
    stopCamera()
    setStage('ready')
  }

  async function handlePhotoSelected(file: File) {
    if (!position) return
    setStage('processing')
    try {
      const now = new Date()
      const stamped = await stampPhoto(file, position.lat, position.lng, now)
      const photoUrl = await storeFile(stamped)
      onCaptured({ lat: position.lat, lng: position.lng, accuracy: position.accuracy, photoUrl, timestamp: now.toISOString() })
    } catch (err) {
      setStage('error')
      setErrorMsg(err instanceof Error ? err.message : 'Could not process the photo. Try again.')
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 pb-4">
        <input
          ref={uploadInputRef}
          type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelected(f) }}
        />
        {stage === 'locating' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader size={28} className="animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Getting your location…</p>
          </div>
        )}

        {stage === 'denied' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle size={28} className="text-amber-500" />
            <p className="text-sm text-slate-600">{errorMsg}</p>
            <button onClick={requestLocation} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold">
              Try Again
            </button>
          </div>
        )}

        {stage === 'ready' && position && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <MapPin size={22} className="text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-emerald-700">Location captured</p>
            <p className="text-xs text-slate-500">{position.lat.toFixed(6)}, {position.lng.toFixed(6)}</p>
            <p className="text-xs text-slate-500">Add a photo to complete {title.toLowerCase()} — take one now, or upload an existing photo.</p>
            <div className="flex gap-2">
              <button
                onClick={openCamera}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-bold active:opacity-90"
                style={{ background: '#0F2A4A' }}
              >
                <Camera size={16} /> Open Camera
              </button>
              <button
                onClick={() => uploadInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold active:bg-slate-50"
              >
                <Upload size={16} /> Upload Photo
              </button>
            </div>
          </div>
        )}

        {stage === 'camera' && (
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative mx-auto rounded-xl overflow-hidden bg-black aspect-[3/4]"
              style={{ width: 'min(100%, calc(60vh * 0.75))', maxHeight: '60vh' }}
            >
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <button onClick={cancelCamera} aria-label="Cancel"
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                <X size={16} className="text-white" />
              </button>
            </div>
            <button
              onClick={capturePhoto}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-bold active:opacity-90"
              style={{ background: '#0F2A4A' }}
            >
              <Camera size={16} /> Capture
            </button>
          </div>
        )}

        {stage === 'camera_error' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle size={28} className="text-amber-500" />
            <p className="text-sm text-slate-600">{errorMsg}</p>
            <div className="flex gap-2">
              <button onClick={openCamera} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold">
                Try Again
              </button>
              <button onClick={() => uploadInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold">
                <Upload size={13} /> Upload Photo
              </button>
            </div>
          </div>
        )}

        {stage === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader size={28} className="animate-spin text-slate-400" />
            <p className="text-sm text-slate-500">Saving your attendance…</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle size={28} className="text-red-500" />
            <p className="text-sm text-slate-600">{errorMsg}</p>
            <button onClick={requestLocation} className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold">
              Try Again
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
