interface Props {
  value: string // 'HH:mm' (24h) or ''
  onChange: (v: string) => void
  min?: string  // 'HH:mm' — times before this are disabled
  max?: string  // 'HH:mm' — times after this are disabled
}

// The browser/OS's own time picker — shows 12h with AM/PM per the device's
// locale, same as every other native control in the app (DateField uses
// type="date" the same way). Replaces the earlier custom 3-column picker.
// Value stays 'HH:mm' 24h, same as before — that's the native input's own
// value format, so every caller (min/max props, persisted data) is unaffected.
export function TimeField({ value, onChange, min, max }: Props) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      min={min}
      max={max}
      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
    />
  )
}
