import { useState } from 'react'
import { MapPin, Navigation, ExternalLink, Loader, Link2, X } from 'lucide-react'

export interface LocationValue {
  address: string      // human-readable address (typed or auto-filled)
  mapLink: string      // google maps link
  latitude?: string
  longitude?: string
}

export const EMPTY_LOCATION: LocationValue = { address: '', mapLink: '' }

interface Props {
  value: LocationValue
  onChange: (v: LocationValue) => void
  error?: string
  label?: string
  required?: boolean
}

async function reverseGeocode(lat: string, lng: string): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'User-Agent': 'FencraftOps/1.0' } },
    )
    const data = await res.json()
    return (data.display_name as string) ?? ''
  } catch {
    return ''
  }
}

export function LocationAddressField({ value, onChange, error, label = 'Address / Location', required }: Props) {
  const [locLoading, setLocLoading] = useState(false)
  const [locError,   setLocError]   = useState('')
  const [showPin,    setShowPin]    = useState(false)
  const [geocoding,  setGeocoding]  = useState(false)

  const hasPinned = !!(value.latitude || value.mapLink)
  const openUrl   = value.mapLink || (value.latitude ? `https://maps.google.com/?q=${value.latitude},${value.longitude}` : '')

  function handleAddressChange(addr: string) {
    const mapsLink = addr.trim()
      ? `https://maps.google.com/search?q=${encodeURIComponent(addr.trim())}`
      : ''
    onChange({ ...value, address: addr, mapLink: value.mapLink || mapsLink })
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) { setLocError('Geolocation not supported.'); return }
    setLocLoading(true); setLocError('')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat  = pos.coords.latitude.toFixed(6)
        const lng  = pos.coords.longitude.toFixed(6)
        const link = `https://maps.google.com/?q=${lat},${lng}`
        onChange({ latitude: lat, longitude: lng, mapLink: link, address: value.address })
        setLocLoading(false)
        setShowPin(false)
        setGeocoding(true)
        const addr = await reverseGeocode(lat, lng)
        if (addr) onChange({ latitude: lat, longitude: lng, mapLink: link, address: addr })
        setGeocoding(false)
      },
      () => { setLocError('Location access denied. Type address or paste map link below.'); setLocLoading(false) },
      { timeout: 10000, maximumAge: 0 },
    )
  }

  function clearLocation() {
    onChange(EMPTY_LOCATION)
    setLocError('')
    setShowPin(false)
  }

  return (
    <div className="space-y-2.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* Address textarea */}
      <div className="relative">
        <textarea
          rows={2}
          value={value.address}
          onChange={e => handleAddressChange(e.target.value)}
          placeholder="Enter site address (or use current location below)"
          className={`w-full bg-white border rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none
            ${error ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-teal-400'}
            ${geocoding ? 'bg-teal-50' : ''}`}
        />
        {geocoding && (
          <p className="absolute bottom-2 right-3 text-[10px] text-teal-500 font-semibold">Fetching address…</p>
        )}
      </div>

      {/* Action buttons row */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={useCurrentLocation} disabled={locLoading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold active:opacity-70 disabled:opacity-50">
          {locLoading
            ? <><Loader size={12} className="animate-spin" /> Detecting…</>
            : <><Navigation size={12} /> Use Current Location</>}
        </button>

        {!hasPinned && (
          <button type="button" onClick={() => setShowPin(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold active:opacity-70">
            <Link2 size={12} /> Pin Location
          </button>
        )}

        {openUrl && (
          <a href={openUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold active:opacity-70">
            <ExternalLink size={12} /> Open in Maps
          </a>
        )}

        {hasPinned && (
          <button type="button" onClick={clearLocation}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold active:opacity-70">
            <X size={12} /> Clear Pin
          </button>
        )}
      </div>

      {/* Paste Google Maps link panel */}
      {showPin && (
        <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-semibold">Paste Google Maps link:</p>
          <input
            type="url"
            inputMode="url"
            value={value.mapLink}
            onChange={e => onChange({ ...value, mapLink: e.target.value })}
            placeholder="https://maps.google.com/?q=..."
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
          />
          {value.mapLink && (
            <button type="button" onClick={() => setShowPin(false)}
              className="w-full py-2 bg-teal-600 text-white rounded-lg text-xs font-bold">
              Save Link
            </button>
          )}
        </div>
      )}

      {/* Pinned success indicator */}
      {hasPinned && (
        <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">
          <MapPin size={12} className="text-teal-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-teal-700">Location pinned successfully</p>
        </div>
      )}

      {locError && <p className="text-[11px] text-amber-600 font-medium">{locError}</p>}
      {error    && <p className="text-[11px] text-red-500 font-semibold">{error}</p>}
    </div>
  )
}
