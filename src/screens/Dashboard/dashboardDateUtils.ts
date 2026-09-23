// Shared by DashboardScreen and its drill-down views (e.g. SalesPersonDetail)
// so "Today/This Week/This Month/Custom" mean exactly the same thing, and the
// local-calendar-date fix (see dateKey below) only has to live in one place.

export type FilterKey = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'today',     label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'This Week' },
  { key: 'month',     label: 'This Month' },
  { key: 'custom',    label: 'Custom' },
]

// Local calendar date, not UTC — toISOString() shifts anything before ~5:30am
// IST back onto the previous day, which would misfile late-night/midnight
// records into "yesterday".
export function dateKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function isSameDay(iso: string, ref: Date): boolean {
  return dateKey(iso) === dateKey(ref)
}
export function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x
}
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d); const day = x.getDay(); x.setDate(x.getDate() - day); return x
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
export function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

export interface DateRange { start: Date; end: Date }

export function resolveRange(filter: FilterKey, now: Date, customFrom: string, customTo: string): DateRange | null {
  const today = startOfDay(now)
  switch (filter) {
    case 'all':       return null
    case 'today':     return { start: today, end: today }
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { start: y, end: y } }
    case 'week':      return { start: startOfWeek(now), end: today }
    case 'month':     return { start: startOfMonth(now), end: today }
    case 'custom':
      if (!customFrom || !customTo) return { start: today, end: today }
      return { start: startOfDay(new Date(customFrom)), end: startOfDay(new Date(customTo)) }
  }
}

export function inRange(iso: string, r: DateRange | null): boolean {
  if (!r) return true
  const k = dateKey(iso)
  return k >= dateKey(r.start) && k <= dateKey(r.end)
}

export function rangeCaption(filter: FilterKey, range: DateRange | null, now: Date, customFrom: string, customTo: string): string {
  switch (filter) {
    case 'all':       return 'All time'
    case 'today':     return `Today — ${fmtShort(range!.start)}`
    case 'yesterday': return `Yesterday — ${fmtShort(range!.start)}`
    case 'week':      return `This Week — ${fmtShort(range!.start)} – ${fmtShort(range!.end)}`
    case 'month':     return `This Month — ${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`
    case 'custom':
      return customFrom && customTo ? `${fmtShort(range!.start)} – ${fmtShort(range!.end)}` : 'Select a date range'
  }
}
