import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'
import { useTriggerRect } from './useOverlayPosition'

interface Props {
  value: string // 'HH:mm' (24h) or ''
  onChange: (v: string) => void
  min?: string  // 'HH:mm' — times before this are disabled
  max?: string  // 'HH:mm' — times after this are disabled
  placeholder?: string
}

function pad(n: number): string { return String(n).padStart(2, '0') }
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))

function fmtDisplay(value: string): string {
  const [hh, mm] = value.split(':').map(Number)
  if (isNaN(hh) || isNaN(mm)) return value
  const period = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${pad(h12)}:${pad(mm)} ${period}`
}

// Same reasoning as DateField/SearchableSelect: a native <input type="time">'s
// picker is positioned by the browser, not page CSS. This renders two plain
// scrollable hour/minute columns in a panel that portals to document.body,
// positioned from the trigger's live screen coordinates (see useTriggerRect)
// — a BottomSheet's scrollable content can clip or paint over a plain
// `position: absolute` panel regardless of z-index, which the portal avoids.
const PANEL_WIDTH = 180

export function TimeField({ value, onChange, min, max, placeholder = 'Select time' }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rect = useTriggerRect(open, triggerRef, () => setOpen(false), panelRef)
  const [h, m] = value ? value.split(':') : ['', '']
  const [minH, minM] = min ? min.split(':') : ['', '']
  const [maxH, maxM] = max ? max.split(':') : ['', '']

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  function pick(hh: string, mm: string) {
    onChange(`${hh}:${mm}`)
  }

  function hourDisabled(hh: string): boolean {
    if (min && hh < minH) return true
    if (max && hh > maxH) return true
    return false
  }
  function minuteDisabled(mm: string): boolean {
    const hh = h || minH || '00'
    if (min && hh === minH && mm < minM) return true
    if (max && hh === maxH && mm > maxM) return true
    return false
  }

  const left = rect ? Math.min(Math.max(rect.left, 8), window.innerWidth - PANEL_WIDTH - 8) : 0
  // The hour/minute columns are internally capped at max-h-56 (224px) already,
  // so a ~240px panel just needs to flip above the trigger when there isn't
  // room below, same reasoning as the horizontal clamp above.
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 14 : 0
  const spaceAbove = rect ? rect.top - 14 : 0
  const openUpward = rect ? spaceBelow < 240 && spaceAbove > spaceBelow : false

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(o => !o)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-indigo-400">
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value ? fmtDisplay(value) : placeholder}</span>
        <Clock size={15} className="text-slate-400 shrink-0" />
      </button>

      {open && rect && createPortal(
        <div ref={panelRef} className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg flex overflow-hidden"
          style={openUpward
            ? { bottom: window.innerHeight - rect.top + 6, left, width: PANEL_WIDTH }
            : { top: rect.bottom + 6, left, width: PANEL_WIDTH }}>
          <div className="flex-1 max-h-56 overflow-y-auto border-r border-slate-100">
            {HOURS.map(hh => (
              <button key={hh} type="button" disabled={hourDisabled(hh)} onClick={() => pick(hh, m || '00')}
                className={`w-full text-center py-2 text-sm ${hh === h ? 'bg-indigo-50 text-indigo-700 font-bold' : hourDisabled(hh) ? 'text-slate-300' : 'text-slate-700 active:bg-slate-50'}`}>
                {hh}
              </button>
            ))}
          </div>
          <div className="flex-1 max-h-56 overflow-y-auto">
            {MINUTES.map(mm => (
              <button key={mm} type="button" disabled={minuteDisabled(mm)} onClick={() => pick(h || '00', mm)}
                className={`w-full text-center py-2 text-sm ${mm === m ? 'bg-indigo-50 text-indigo-700 font-bold' : minuteDisabled(mm) ? 'text-slate-300' : 'text-slate-700 active:bg-slate-50'}`}>
                {mm}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
