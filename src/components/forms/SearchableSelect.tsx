import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useTriggerRect } from './useOverlayPosition'

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
  // Narrows the trigger's horizontal padding/rounding to fit a dense
  // multi-column row (e.g. a line-item's Qty/Unit/Rate/Amount grid) — the
  // default padding is sized for a full-width field and overflows a narrow
  // column, truncating the label behind the chevron. Height/text size match
  // the row's sibling inputs (`px-2 py-2 text-base`), not the default field.
  compact?: boolean
}

// Keyboard/pointer entries in display order — the placeholder ("— Select —")
// and the pinned extraOption both need to participate in Arrow Up/Down and
// Enter the same as a real option, so they're folded into one flat list.
type Entry = { kind: 'placeholder' } | { kind: 'option'; opt: SearchableSelectOption } | { kind: 'extra' }

const SEARCH_BOX_HEIGHT = 56
const EXTRA_ROW_HEIGHT = 45
const MIN_LIST_HEIGHT = 120
const MAX_LIST_HEIGHT = 224 // matches the old fixed max-h-56

// A searchable dropdown that renders in normal page flow instead of a native
// <select>'s browser/OS-positioned popup — a long native select's option
// list can render past the edge of a BottomSheet (or the viewport, on real
// mobile) with no way for page CSS to reposition or constrain it. The open
// panel portals to document.body, positioned from the trigger's live screen
// coordinates (see useTriggerRect) — a BottomSheet's scrollable content can
// clip or paint over a plain `position: absolute` panel regardless of
// z-index, which a portal sidesteps entirely. It opens above the trigger
// instead of below when there isn't room, and shrinks its own scrollable
// list to whatever space is actually available rather than running off the
// screen — plus a search box, useful once a list (like every saved Client)
// gets past a handful of entries. Arrow Up/Down move a highlight, Enter picks
// it, Escape closes — scrolling the list (wheel or touch) only scrolls it,
// since picking an option only ever happens on click/Enter, never on scroll.
export function SearchableSelect({ value, onChange, options, placeholder = '— Select —', searchPlaceholder = 'Search…', extraOption, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const rect = useTriggerRect(open, triggerRef, () => setOpen(false), panelRef)

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
      setQuery('')
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

  const entries: Entry[] = [
    { kind: 'placeholder' },
    ...filtered.map(opt => ({ kind: 'option' as const, opt })),
    ...(extraOption ? [{ kind: 'extra' as const }] : []),
  ]

  // Start the highlight on the current value (or the top) whenever the
  // dropdown opens or the filtered list changes, so it never points past the
  // end of a shorter, just-filtered list.
  useEffect(() => {
    if (!open) return
    const idx = entries.findIndex(e => e.kind === 'option' && e.opt.value === value)
    setHighlighted(idx >= 0 ? idx : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted(i => Math.min(i + 1, entries.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const entry = entries[highlighted]
        if (entry?.kind === 'placeholder') pick('')
        else if (entry?.kind === 'option') pick(entry.opt.value)
        else if (entry?.kind === 'extra' && extraOption) pick(extraOption.value)
      } else if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, highlighted, entries.length])

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${highlighted}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  function pick(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  const spaceBelow = rect ? window.innerHeight - rect.bottom - 14 : 0
  const spaceAbove = rect ? rect.top - 14 : 0
  const openUpward = rect ? spaceBelow < 160 && spaceAbove > spaceBelow : false
  const reserved = (showSearch ? SEARCH_BOX_HEIGHT : 0) + (extraOption ? EXTRA_ROW_HEIGHT : 0)
  const listMaxHeight = rect
    ? Math.max(MIN_LIST_HEIGHT, Math.min(MAX_LIST_HEIGHT, (openUpward ? spaceAbove : spaceBelow) - reserved))
    : MAX_LIST_HEIGHT

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(o => !o)}
        className={`w-full bg-slate-50 border border-slate-200 text-left flex items-center justify-between focus:outline-none focus:border-indigo-400 ${
          compact ? 'rounded-lg px-2 py-2 text-base gap-1' : 'rounded-xl px-4 py-3 text-sm gap-2'
        }`}>
        <span className={`truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && rect && createPortal(
        <div ref={panelRef} className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          style={openUpward
            ? { bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width }
            : { top: rect.bottom + 6, left: rect.left, width: rect.width }}>
          {showSearch && (
            <div className="p-2 border-b border-slate-100">
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={searchPlaceholder}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          )}
          <div ref={listRef} className="overflow-y-auto overscroll-contain" style={{ maxHeight: listMaxHeight }}>
            <button type="button" data-idx={0} onClick={() => pick('')}
              className={`w-full text-left px-4 py-2.5 text-sm text-slate-400 border-b border-slate-50 active:bg-slate-50 ${highlighted === 0 ? 'bg-slate-50' : ''}`}>
              {placeholder}
            </button>
            {filtered.map((o, i) => (
              <button key={o.value} type="button" data-idx={i + 1} onClick={() => pick(o.value)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-slate-50 last:border-0 active:bg-slate-50 ${
                  o.value === value ? 'bg-indigo-50 text-indigo-700 font-semibold' : highlighted === i + 1 ? 'bg-slate-50 text-slate-700' : 'text-slate-700'
                }`}>
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">No matches.</p>}
          </div>
          {extraOption && (
            <button type="button" data-idx={entries.length - 1} onClick={() => pick(extraOption.value)}
              className={`w-full text-left px-4 py-2.5 text-sm font-semibold text-indigo-600 border-t border-slate-100 active:bg-slate-50 ${highlighted === entries.length - 1 ? 'bg-slate-50' : ''}`}>
              {extraOption.label}
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
