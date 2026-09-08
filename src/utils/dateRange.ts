export type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'

export const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'today',    label: 'Today' },
  { value: 'yesterday',label: 'Yesterday' },
  { value: 'week',     label: 'This Week' },
  { value: 'month',    label: 'This Month' },
  { value: 'custom',   label: 'Custom' },
]

export function getDateRange(filter: DateFilter, customFrom: string, customTo: string): { from: Date; to: Date } {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  if (filter === 'all') return { from: new Date(0), to: new Date(8640000000000000) }
  if (filter === 'today') return { from: todayStart, to: todayEnd }
  if (filter === 'yesterday') {
    const yStart = new Date(todayStart); yStart.setDate(yStart.getDate() - 1)
    const yEnd   = new Date(todayEnd);   yEnd.setDate(yEnd.getDate() - 1)
    return { from: yStart, to: yEnd }
  }
  if (filter === 'week') {
    const day = now.getDay()
    const diff = day === 0 ? 6 : day - 1
    const weekStart = new Date(todayStart)
    weekStart.setDate(todayStart.getDate() - diff)
    return { from: weekStart, to: todayEnd }
  }
  if (filter === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0), to: todayEnd }
  }
  const from = customFrom ? new Date(customFrom + 'T00:00:00') : todayStart
  const to   = customTo   ? new Date(customTo   + 'T23:59:59') : todayEnd
  return { from, to }
}

export interface RecentPeriod {
  label: string
  from: Date
  to: Date
}

// `count` consecutive periods at the granularity implied by `filter`, oldest
// first, ending at the current one — day-granularity for today/yesterday,
// week for week, month for month. 'all'/'custom' have no natural granularity
// to break down, so they return an empty array (caller should hide the
// trend/growth UI in that case).
export function getRecentPeriods(filter: DateFilter, count: number): RecentPeriod[] {
  const now = new Date()

  if (filter === 'today' || filter === 'yesterday') {
    return Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i
      const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 0, 0, 0, 0)
      const to   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 23, 59, 59, 999)
      return { label: from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), from, to }
    })
  }

  if (filter === 'week') {
    const day = now.getDay()
    const mondayDiff = day === 0 ? 6 : day - 1
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayDiff, 0, 0, 0, 0)
    return Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i
      const from = new Date(thisWeekStart); from.setDate(from.getDate() - offset * 7)
      const to   = new Date(from); to.setDate(to.getDate() + 6); to.setHours(23, 59, 59, 999)
      return { label: `${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`, from, to }
    })
  }

  if (filter === 'month') {
    return Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i
      const from = new Date(now.getFullYear(), now.getMonth() - offset, 1, 0, 0, 0, 0)
      const to   = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999)
      return { label: from.toLocaleDateString('en-IN', { month: 'short' }), from, to }
    })
  }

  return []
}

export function parseFlexDate(dateStr: string): Date {
  // ISO: YYYY-MM-DD or YYYY-MM-DDTHH:...
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return new Date(dateStr)
  // en-IN locale: D/M/YYYY (day first)
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [d, m, y] = parts.map(Number)
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return new Date(y, m - 1, d)
  }
  return new Date(dateStr)
}

export function inRange(dateStr: string | undefined, from: Date, to: Date): boolean {
  if (!dateStr) return false
  const d = parseFlexDate(dateStr)
  return !isNaN(d.getTime()) && d >= from && d <= to
}

export function leadDate(l: { createdAt?: string; lastContact?: string }): string | undefined {
  return l.createdAt || l.lastContact
}
