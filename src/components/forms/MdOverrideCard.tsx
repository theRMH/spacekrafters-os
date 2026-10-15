import { useState } from 'react'
import { SearchableSelect } from './SearchableSelect'

interface Props {
  noun: 'status' | 'stage'
  // What is being overridden, e.g. "quotation status" — several of these can
  // sit on one screen (the Lead sheet shows lead + quotation + design).
  title?: string
  options: { value: string; label: string }[]
  onApply: (value: string, reason: string) => Promise<void>
  saving?: boolean
}

// MD-only escape hatch shared by every status/stage screen: pick any value
// (forward or back) and give a mandatory reason. The caller records the reason
// in that record's own history/activity log. Render it only for the owner role.
export function MdOverrideCard({ noun, title, options, onApply, saving = false }: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function apply() {
    if (!value || !reason.trim()) return
    setBusy(true)
    await onApply(value, reason.trim())
    setBusy(false)
    setOpen(false); setValue(''); setReason('')
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 p-3.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-amber-700">MD override{title ? ` — ${title}` : ''}</p>
        <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-bold text-indigo-600 shrink-0">
          {open ? 'Cancel' : `Change ${noun}`}
        </button>
      </div>
      {open && (
        <div className="space-y-2">
          <SearchableSelect value={value} onChange={setValue} options={options}
            placeholder={`Select new ${noun}…`} searchPlaceholder={`Search ${noun}…`} />
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="Reason (required)"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          <button type="button" disabled={!value || !reason.trim() || saving || busy} onClick={apply}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
            Apply override
          </button>
        </div>
      )}
    </div>
  )
}
