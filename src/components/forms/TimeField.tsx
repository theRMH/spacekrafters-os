import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'

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
// picker is positioned by the browser, not page CSS — this renders two plain
// scrollable hour/minute columns in normal page flow instead, so it can't
// escape its own scrollable container.
const PANEL_WIDTH = 180

export function TimeField({ value, onChange, min, max, placeholder = 'Select time' }: Props) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [h, m] = value ? value.split(':') : ['', '']
  const [minH, minM] = min ? min.split(':') : ['', '']
  const [maxH, maxM] = max ? max.split(':') : ['', '']

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    // Same right-hand-column overflow fix as DateField — flip to right-anchored
    // when there isn't room to the right of the trigger.
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) setAlignRight(rect.left + PANEL_WIDTH > window.innerWidth - 8)
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

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-indigo-400">
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value ? fmtDisplay(value) : placeholder}</span>
        <Clock size={15} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className={`absolute z-50 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg flex overflow-hidden ${alignRight ? 'right-0' : 'left-0'}`} style={{ width: PANEL_WIDTH }}>
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
        </div>
      )}
    </div>
  )
}
