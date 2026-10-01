import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  // A pinned extra row at the bottom of the list (e.g. "+ New Client") — kept
  // separate from `options` so it's never filtered out by the search box.
  extraOption?: { value: string; label: string }
  // Shrinks the trigger to match compact `px-2 py-1.5 text-xs` sibling inputs
  // in a dense multi-column row (e.g. a line-item's Qty/Unit/Rate/Amount grid)
  // — the default padding is sized for a full-width field and overflows a
  // narrow column, truncating the label behind the chevron.
  compact?: boolean
}

// A searchable dropdown that renders in normal page flow instead of a native
// <select>'s browser/OS-positioned popup — a long native select's option
// list can render past the edge of a BottomSheet (or the viewport, on real
// mobile) with no way for page CSS to reposition or constrain it. This opens
// as a normal absolutely-positioned panel under the trigger, scoped to its
// own `relative` wrapper, so it scrolls naturally with the sheet it's in and
// never escapes its bounds — plus a search box, useful once a list (like
// every saved Client) gets past a handful of entries.
export function SearchableSelect({ value, onChange, options, placeholder = '— Select —', searchPlaceholder = 'Search…', extraOption, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  const selected = options.find(o => o.value === value) ?? (extraOption?.value === value ? extraOption : undefined)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
    : options
  // A search box is clutter on a short, fixed list (Status, Type…) — only
  // show it once there are enough options that finding one by eye gets hard.
  const showSearch = options.length > 6

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full bg-slate-50 border border-slate-200 text-left flex items-center justify-between focus:outline-none focus:border-indigo-400 ${
          compact ? 'rounded-lg px-2 py-1.5 text-xs gap-1' : 'rounded-xl px-4 py-3 text-sm gap-2'
        }`}>
        <span className={`truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={compact ? 13 : 15} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {showSearch && (
            <div className="p-2 border-b border-slate-100">
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            <button type="button" onClick={() => pick('')}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-400 border-b border-slate-50 active:bg-slate-50">
              {placeholder}
            </button>
            {filtered.map(o => (
              <button key={o.value} type="button" onClick={() => pick(o.value)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-slate-50 last:border-0 active:bg-slate-50 ${
                  o.value === value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700'
                }`}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">No matches.</p>}
          </div>
          {extraOption && (
            <button type="button" onClick={() => pick(extraOption.value)}
              className="w-full text-left px-4 py-2.5 text-sm font-semibold text-indigo-600 border-t border-slate-100 active:bg-slate-50">
              {extraOption.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
