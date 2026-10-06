import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTriggerRect } from './useOverlayPosition'

interface Props {
  value: string              // 'YYYY-MM-DD' or ''
  onChange: (v: string) => void
  min?: string                // 'YYYY-MM-DD' — dates before this are disabled
  max?: string                // 'YYYY-MM-DD' — dates after this are disabled
  placeholder?: string
  disabled?: boolean
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function toKey(y: number, m: number, d: number): string { return `${y}-${pad(m + 1)}-${pad(d)}` }
function todayKey(): string { const d = new Date(); return toKey(d.getFullYear(), d.getMonth(), d.getDate()) }
function parseKey(key: string): { y: number; m: number } | null {
  const d = new Date(key)
  return isNaN(d.getTime()) ? null : { y: d.getFullYear(), m: d.getMonth() }
}
function fmtDisplay(key: string): string {
  const d = new Date(key)
  if (isNaN(d.getTime())) return key
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1) }
  return days
}

// A calendar date picker whose open panel portals to document.body, positioned
// from the trigger's live screen coordinates (see useTriggerRect) — same
// reasoning as SearchableSelect: a native <input type="date">'s calendar is
// positioned by the browser/OS, not page CSS, and can render off the edge of
// a BottomSheet or the viewport with no way for the app to fix it. A plain
// `position: absolute` panel nested inside a BottomSheet's scrollable content
// can end up clipped or have other in-flow content (e.g. a submit button
// below it) paint over it regardless of z-index — the portal sidesteps that.
const PANEL_WIDTH = 280

export function DateField({ value, onChange, min, max, placeholder = 'Select date', disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => parseKey(value || todayKey())!.y)
  const [viewMonth, setViewMonth] = useState(() => parseKey(value || todayKey())!.m)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rect = useTriggerRect(open, triggerRef, () => setOpen(false), panelRef)

  useEffect(() => {
    if (!open) return
    const base = parseKey(value || todayKey())
    if (base) { setViewYear(base.y); setViewMonth(base.m) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function isDisabled(key: string): boolean {
    if (min && key < min) return true
    if (max && key > max) return true
    return false
  }

  function goPrevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1)
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1)
  }

  const monthDays = daysInMonth(viewYear, viewMonth)
  const firstWeekday = monthDays[0].getDay()
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const today = todayKey()
  const left = rect ? Math.min(Math.max(rect.left, 8), window.innerWidth - PANEL_WIDTH - 8) : 0
  // The panel's own height is ~320px (header + week grid + footer) regardless
  // of month — open upward instead of below when there isn't room, same
  // reasoning as the horizontal clamp above.
  const spaceBelow = rect ? window.innerHeight - rect.bottom - 14 : 0
  const spaceAbove = rect ? rect.top - 14 : 0
  const openUpward = rect ? spaceBelow < 320 && spaceAbove > spaceBelow : false

  return (
    <>
      <button ref={triggerRef} type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-indigo-400 disabled:opacity-60">
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value ? fmtDisplay(value) : placeholder}</span>
        <Calendar size={15} className="text-slate-400 shrink-0" />
      </button>

      {open && !disabled && rect && createPortal(
        <div ref={panelRef} className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3"
          style={openUpward
            ? { bottom: window.innerHeight - rect.top + 6, left, width: PANEL_WIDTH }
            : { top: rect.bottom + 6, left, width: PANEL_WIDTH }}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={goPrevMonth} aria-label="Previous month" className="w-7 h-7 rounded-lg flex items-center justify-center active:bg-slate-100">
              <ChevronLeft size={16} className="text-slate-500" />
            </button>
            <span className="text-sm font-bold text-slate-800">{monthLabel}</span>
            <button type="button" onClick={goNextMonth} aria-label="Next month" className="w-7 h-7 rounded-lg flex items-center justify-center active:bg-slate-100">
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[11px] font-bold text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
            {monthDays.map(d => {
              const key = toKey(viewYear, viewMonth, d.getDate())
              const disabled = isDisabled(key)
              const isSelected = key === value
              const isToday = key === today
              return (
                <button key={key} type="button" disabled={disabled}
                  onClick={() => { onChange(key); setOpen(false) }}
                  className={`aspect-square rounded-lg flex items-center justify-center text-xs font-semibold
                    ${isSelected ? 'bg-indigo-600 text-white' : disabled ? 'text-slate-300' : isToday ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 active:bg-slate-100'}`}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="text-xs font-semibold text-slate-500 active:opacity-70">
              Clear
            </button>
            <button type="button" disabled={isDisabled(today)}
              onClick={() => { onChange(today); setOpen(false) }}
              className="text-xs font-semibold text-indigo-600 active:opacity-70 disabled:opacity-40">
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
