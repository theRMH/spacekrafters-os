import { useState } from 'react'
import { LocateFixed, MapPin, ExternalLink, Loader } from 'lucide-react'

// OpenStreetMap's free Nominatim API — no key/billing needed. Used only to
// suggest an address from the GPS coordinates; the Address field underneath
// stays a normal, always-editable text input either way.
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.display_name ?? null
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

interface Props {
  city: string
  onCityChange: (city: string) => void
  latitude?: number
  longitude?: number
  onLocationChange: (lat: number | undefined, lng: number | undefined) => void
}

// GPS-based location pin for the Lead form — "Pin My Location" captures the
// device's current coordinates (same navigator.geolocation pattern as
// AttendanceCaptureSheet.tsx), shows a success card with a link out to
// Google Maps to verify it, and fills Address from a reverse-geocode lookup.
// Address itself stays a normal, always-live text field either way — pinning
// is a convenience on top of it, not a replacement for typing.
export function LocationPicker({ city, onCityChange, latitude, longitude, onLocationChange }: Props) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  const pinned = latitude != null && longitude != null

  function pinMyLocation() {
    setError('')
    if (!navigator.geolocation) { setError('Geolocation is not supported on this device/browser.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        onLocationChange(lat, lng)
        const address = await reverseGeocode(lat, lng)
        setLocating(false)
        if (address) onCityChange(address)
      },
      () => { setLocating(false); setError('Location access denied. Enable location permission and try again.') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  function clearAndRepin() {
    onLocationChange(undefined, undefined)
    setError('')
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Location Pin</label>
        {pinned ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 uppercase tracking-wide">
              <MapPin size={13} /> Location pinned successfully
            </p>
            <a href={googleMapsUrl(latitude!, longitude!)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 underline w-fit">
              <ExternalLink size={12} /> Open in Google Maps
            </a>
            <button type="button" onClick={clearAndRepin} className="text-xs text-slate-500 underline">
              Clear &amp; re-pin
            </button>
          </div>
        ) : (
          <button type="button" onClick={pinMyLocation} disabled={locating}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-60">
            {locating ? <Loader size={16} className="animate-spin" /> : <LocateFixed size={16} />}
            Pin My Location
          </button>
        )}
        {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Location / City *</label>
        <input value={city} onChange={e => onCityChange(e.target.value)} placeholder="e.g. Anna Nagar, Chennai"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
      </div>
    </div>
  )
}
