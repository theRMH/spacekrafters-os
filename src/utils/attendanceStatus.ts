import type { AttendanceRecord, AttendanceStatus } from '../types'

// A captured Present day short of this many worked hours (End − Start)
// auto-downgrades to Half Day — Present/Absent are already effectively
// automatic (Present is set the instant Start is captured; Absent below
// covers unrecorded days), so this was the one manual-only status left.
export const HALF_DAY_THRESHOLD_HOURS = 4

// Working days are Monday–Saturday; Sunday is Week Off — matches the
// client's own reference spreadsheet (see attendanceExport.ts's "Sunday =
// Week Off" banner).
export function isWeekOff(dateKey: string): boolean {
  return new Date(`${dateKey}T00:00:00`).getDay() === 0
}

// The one place that decides what status a day displays as — shared between
// the on-screen Attendance history and the Excel export so the two can never
// silently disagree. Leave overrides everything; a Present day short of
// HALF_DAY_THRESHOLD_HOURS downgrades to Half Day; a working day with no
// record at all auto-shows as Absent, bounded by `earliestDateKey` (that
// person's first-ever attendance record) so a day before someone ever used
// the attendance system is never wrongly marked absent.
export function computeAttendanceStatus(opts: {
  dateKey: string
  todayKey: string
  rec: AttendanceRecord | undefined
  isOnApprovedLeave: boolean
  earliestDateKey: string | undefined
}): AttendanceStatus | undefined {
  const { dateKey, todayKey, rec, isOnApprovedLeave, earliestDateKey } = opts
  if (isOnApprovedLeave) return 'absent'
  if (rec?.status === 'present' && rec.startTime && rec.endTime) {
    const hours = (new Date(rec.endTime).getTime() - new Date(rec.startTime).getTime()) / 3_600_000
    if (hours > 0 && hours < HALF_DAY_THRESHOLD_HOURS) return 'half_day'
  }
  if (rec?.status) return rec.status
  if (dateKey >= todayKey || isWeekOff(dateKey)) return undefined
  if (!earliestDateKey || dateKey < earliestDateKey) return undefined
  return 'absent'
}
