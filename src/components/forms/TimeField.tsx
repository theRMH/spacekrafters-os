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
const HOURS_12 = Array.from({ length: 12 }, (_, i) => pad(i + 1)) // '01'..'12'
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))
const PERIODS: Array<'AM' | 'PM'> = ['AM', 'PM']

// The stored value stays 'HH:mm' 24h everywhere (min/max props, callers,
// persisted data) — only the picker UI and the closed-button label work in
// 12h + AM/PM.
function to24(h12: string, period: 'AM' | 'PM'): string {
  const n = Number(h12)
  const h24 = period === 'AM' ? (n === 12 ? 0 : n) : (n === 12 ? 12 : n + 12)
  return pad(h24)
}
function to12(h24: string): { h12: string; period: 'AM' | 'PM' } {
  const n = Number(h24)
  const period = n >= 12 ? 'PM' : 'AM'
  return { h12: pad(n % 12 === 0 ? 12 : n % 12), period }
}

function fmtDisplay(value: string): string {
  const [hh, mm] = value.split(':').map(Number)
  if (isNaN(hh) || isNaN(mm)) return value
  const { h12, period } = to12(pad(hh))
  return `${h12}:${pad(mm)} ${period}`
}

// Same reasoning as DateField/SearchableSelect: a native <input type="time">'s
// picker is positioned by the browser, not page CSS. This renders plain
// scrollable hour/minute/AM-PM columns in a panel that portals to document.body,
// positioned from the trigger's live screen coordinates (see useTriggerRect)
// — a BottomSheet's scrollable content can clip or paint over a plain
// `position: absolute` panel regardless of z-index, which the portal avoids.
const PANEL_WIDTH = 252

export function TimeField({ value, onChange, min, max, placeholder = 'Select time' }: Props) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rect = useTriggerRect(open, triggerRef, () => setOpen(false), panelRef)
  const [h, m] = value ? value.split(':') : ['', '']
  const [minH, minM] = min ? min.split(':') : ['', '']
  const [maxH, maxM] = max ? max.split(':') : ['', '']
  const { h12, period } = h ? to12(h) : { h12: '', period: undefined as 'AM' | 'PM' | undefined }

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
  function pickHour12(hh12: string) {
    pick(to24(hh12, period ?? 'AM'), m || '00')
  }
  function pickPeriod(p: 'AM' | 'PM') {
    pick(to24(h12 || '12', p), m || '00')
  }

  function hour12Disabled(hh12: string): boolean {
    const hh = to24(hh12, period ?? 'AM')
    if (min && hh < minH) return true
    if (max && hh > maxH) return true
    return false
  }
  function periodDisabled(p: 'AM' | 'PM'): boolean {
    const hh = to24(h12 || '12', p)
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
            {HOURS_12.map(hh => (
              <button key={hh} type="button" disabled={hour12Disabled(hh)} onClick={() => pickHour12(hh)}
                className={`w-full text-center py-2 text-sm ${hh === h12 ? 'bg-indigo-50 text-indigo-700 font-bold' : hour12Disabled(hh) ? 'text-slate-300' : 'text-slate-700 active:bg-slate-50'}`}>
                {hh}
              </button>
            ))}
          </div>
          <div className="flex-1 max-h-56 overflow-y-auto border-r border-slate-100">
            {MINUTES.map(mm => (
              <button key={mm} type="button" disabled={minuteDisabled(mm)} onClick={() => pick(h || '00', mm)}
                className={`w-full text-center py-2 text-sm ${mm === m ? 'bg-indigo-50 text-indigo-700 font-bold' : minuteDisabled(mm) ? 'text-slate-300' : 'text-slate-700 active:bg-slate-50'}`}>
                {mm}
              </button>
            ))}
          </div>
          <div className="flex-1">
            {PERIODS.map(p => (
              <button key={p} type="button" disabled={periodDisabled(p)} onClick={() => pickPeriod(p)}
                className={`w-full text-center py-2 text-sm ${p === period ? 'bg-indigo-50 text-indigo-700 font-bold' : periodDisabled(p) ? 'text-slate-300' : 'text-slate-700 active:bg-slate-50'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
