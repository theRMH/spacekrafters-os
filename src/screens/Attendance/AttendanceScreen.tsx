import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Download, LogIn, LogOut, Plus, Pencil } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DateField } from '../../components/forms/DateField'
import { TimeField } from '../../components/forms/TimeField'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { AttendanceCaptureSheet } from '../../components/attendance/AttendanceCaptureSheet'
import { AttendanceCapturePreview } from '../../components/attendance/AttendanceCapturePreview'
import { getAllAttendance, upsertAttendance } from '../../services/attendanceService'
import { getAllLeaveApplications } from '../../services/leaveService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAttendanceSettings } from '../../services/attendanceSettingsService'
import { downloadAttendanceExcel } from '../../utils/attendanceExport'
import { computeAttendanceStatus } from '../../utils/attendanceStatus'
import type { AttendanceRecord, AttendanceStatus, LeaveApplication, ManagedUser, AttendanceSettings, AttendanceCapture } from '../../types'

// Leave is not a selectable/displayed attendance status — an approved leave
// application is folded into Absent everywhere on this screen (calendar,
// legend, history). Leave management itself stays in the separate Leave module.
const STATUS_OPTIONS: { value: AttendanceStatus; label: string; dot: string }[] = [
  { value: 'present',  label: 'Present',  dot: 'bg-emerald-500' },
  { value: 'absent',   label: 'Absent',   dot: 'bg-red-500'     },
  { value: 'half_day', label: 'Half Day', dot: 'bg-amber-500'   },
]

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  absent:   'bg-red-200 text-red-800 border-red-300',
  half_day: 'bg-amber-50 text-amber-700 border-amber-200',
}

// Local date parts, not toISOString() — toISOString() converts to UTC first,
// which silently rolls every date back a day in any timezone ahead of UTC
// (e.g. IST): a local midnight Date for "the 17th" becomes "2026-09-16T18:30Z",
// so .slice(0, 10) reads back "16". That mismatch was shifting every
// calendar cell, history row, and the leave-highlight itself off by one day.
function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fmtTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '—'
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!(ms > 0)) return '—'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

// Local "HH:mm" (from a <input type="time">) + a "YYYY-MM-DD" date key ->
// an ISO timestamp, interpreted in the browser's local time — same
// local-time convention as every other date/time field in this app (see
// toDateKey above for why: never round-trip through toISOString() first).
function timeToIso(dateKey: string, hhmm: string): string | undefined {
  if (!hhmm) return undefined
  const d = new Date(`${dateKey}T${hhmm}:00`)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}
function isoToTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtDate(dateKey: string): string {
  const d = new Date(dateKey)
  if (isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Difference, in minutes, between a captured timestamp's local time-of-day
// and the configured office time ("HH:mm") — positive means later.
function minutesFromOfficeTime(iso: string, officeHHmm: string): number {
  const d = new Date(iso)
  const [oh, om] = officeHHmm.split(':').map(Number)
  return (d.getHours() * 60 + d.getMinutes()) - (oh * 60 + om)
}

function fmtMinutes(mins: number): string {
  const abs = Math.abs(mins)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function isOnApprovedLeave(userId: string, dateKey: string, leaves: LeaveApplication[]): boolean {
  return leaves.some(l => l.userId === userId && l.status === 'approved' && l.fromDate <= dateKey && dateKey <= l.toDate)
}

function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const d = new Date(year, month, 1)
  while (d.getMonth() === month) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

export default function AttendanceScreen() {
  const { user, can } = useAuth()
  const canManageTeam = can('approve_leave')

  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [leaves, setLeaves] = useState<LeaveApplication[]>([])
  const [team, setTeam] = useState<ManagedUser[]>([])
  const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })
  const [captureMode, setCaptureMode] = useState<'start' | 'end' | null>(null)
  const [viewCapture, setViewCapture] = useState<{ capture: AttendanceCapture; label: string; timestamp?: string } | null>(null)

  const today = new Date()
  const todayKey = toDateKey(today)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const [historyOpen, setHistoryOpen] = useState(false)

  async function refresh() {
    setIsLoading(true)
    const [att, lv, dir, settings] = await Promise.all([
      getAllAttendance(),
      getAllLeaveApplications(),
      canManageTeam ? getManagedUsersDirectory() : Promise.resolve([]),
      getAttendanceSettings(),
    ])
    setRecords(att)
    setLeaves(lv)
    setTeam(dir)
    setAttendanceSettings(settings)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [canManageTeam])

  const myRecordByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>()
    records.filter(r => r.userId === user?.id).forEach(r => map.set(r.date, r))
    return map
  }, [records, user?.id])

  // The earliest date this person has ANY attendance record — auto-Absent
  // (in computeAttendanceStatus) never reaches back before this, so a day
  // before someone ever used the attendance system is never wrongly marked
  // absent (there's no join-date field to check against instead).
  function earliestRecordDateKey(memberId: string): string | undefined {
    return records.filter(r => r.userId === memberId).map(r => r.date).sort()[0]
  }

  // The one place this screen decides what status a day displays as — used
  // by the calendar, both history views, and the payable-days summary — so
  // Leave/Half-Day/Absent are computed the same way everywhere, via the same
  // shared `computeAttendanceStatus` the Excel export also uses.
  function effectiveStatus(userId: string, dateKey: string): AttendanceStatus | undefined {
    return computeAttendanceStatus({
      dateKey,
      todayKey,
      rec: records.find(r => r.userId === userId && r.date === dateKey),
      isOnApprovedLeave: isOnApprovedLeave(userId, dateKey, leaves),
      earliestDateKey: earliestRecordDateKey(userId),
    })
  }

  // Shared optimistic-save: reflect on screen immediately, roll back on failure.
  async function saveRecord(record: AttendanceRecord, previous: AttendanceRecord | undefined) {
    setRecords(prev => {
      const idx = prev.findIndex(r => r.id === record.id)
      if (idx === -1) return [record, ...prev]
      const next = [...prev]
      next[idx] = record
      return next
    })
    const result = await upsertAttendance(record)
    if (!result.ok) {
      setRecords(prev => previous
        ? prev.map(r => (r.id === record.id ? previous : r))
        : prev.filter(r => r.id !== record.id))
      setSnack({ open: true, msg: result.error ?? 'Could not save attendance.', type: 'error' })
      return
    }
    setSnack({ open: true, msg: 'Attendance updated.', type: 'success' })
  }

  async function markStatus(targetUserId: string, targetUserName: string, dateKey: string, status: AttendanceStatus, reason?: string) {
    if (!user) return
    const existing = records.find(r => r.userId === targetUserId && r.date === dateKey)
    const now = new Date().toISOString()
    const record: AttendanceRecord = {
      id: existing?.id ?? `att_${targetUserId}_${dateKey}`,
      userId: targetUserId,
      userName: targetUserName,
      date: dateKey,
      status,
      startTime: existing?.startTime,
      endTime: existing?.endTime,
      reason: status === 'absent' ? reason : undefined,
      markedBy: user.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await saveRecord(record, existing)
  }

  // Marking someone Absent asks for a date (defaults to whichever day was
  // clicked, but editable — lets a back-dated correction happen without first
  // navigating the calendar) and a reason, rather than silently flipping the
  // status with a single tap.
  const [absentTarget, setAbsentTarget] = useState<{ userId: string; userName: string } | null>(null)
  const [absentDate, setAbsentDate] = useState('')
  const [absentReason, setAbsentReason] = useState('')

  function openAbsentDialog(targetUserId: string, targetUserName: string, dateKey: string) {
    setAbsentTarget({ userId: targetUserId, userName: targetUserName })
    setAbsentDate(dateKey)
    setAbsentReason('')
  }

  async function confirmMarkAbsent() {
    if (!absentTarget || !absentDate) return
    await markStatus(absentTarget.userId, absentTarget.userName, absentDate, 'absent', absentReason.trim())
    setAbsentTarget(null)
  }

  // MD/Admin: add a record for any team member on any date, or edit an
  // existing one (correct the status, or the In/Out time itself — the
  // Start/End buttons above only ever capture "now" for yourself, so this is
  // the only way to fix a wrong clock-in/out or backfill a missed day).
  // Shares one form for both — the deterministic att_<userId>_<dateKey> id
  // means saving always upserts the one record for that person+day, so
  // there's no separate "create" vs "update" codepath to keep in sync.
  const [manageOpen, setManageOpen] = useState(false)
  const [manageIsNew, setManageIsNew] = useState(true)
  const [manageUserId, setManageUserId] = useState('')
  const [manageUserName, setManageUserName] = useState('')
  const [manageDate, setManageDate] = useState('')
  const [manageStatus, setManageStatus] = useState<AttendanceStatus>('present')
  const [manageStartTime, setManageStartTime] = useState('')
  const [manageEndTime, setManageEndTime] = useState('')
  const [manageReason, setManageReason] = useState('')
  const [manageError, setManageError] = useState('')

  function openAddDialog() {
    setManageIsNew(true)
    setManageUserId(''); setManageUserName('')
    setManageDate(selectedDateKey)
    setManageStatus('present')
    setManageStartTime(''); setManageEndTime(''); setManageReason('')
    setManageError('')
    setManageOpen(true)
  }

  function openEditDialog(rec: AttendanceRecord) {
    setManageIsNew(false)
    setManageUserId(rec.userId); setManageUserName(rec.userName)
    setManageDate(rec.date)
    setManageStatus(rec.status)
    setManageStartTime(isoToTime(rec.startTime)); setManageEndTime(isoToTime(rec.endTime))
    setManageReason(rec.reason ?? '')
    setManageError('')
    setManageOpen(true)
  }

  async function handleManageSave() {
    if (!user || !manageUserId || !manageDate) { setManageError('Select an employee and a date.'); return }
    if (manageStatus === 'absent' && !manageReason.trim()) { setManageError('Enter a reason for the absence.'); return }
    const existing = records.find(r => r.userId === manageUserId && r.date === manageDate)
    const now = new Date().toISOString()
    const record: AttendanceRecord = {
      id: existing?.id ?? `att_${manageUserId}_${manageDate}`,
      userId: manageUserId, userName: manageUserName, date: manageDate,
      status: manageStatus,
      startTime: timeToIso(manageDate, manageStartTime),
      endTime: timeToIso(manageDate, manageEndTime),
      // Captures are device-verified (GPS + stamped photo) at the moment of a
      // real Start/End tap — never fabricated here, only ever carried over
      // unchanged from whatever the record already had.
      startCapture: existing?.startCapture,
      endCapture: existing?.endCapture,
      reason: manageStatus === 'absent' ? manageReason.trim() : undefined,
      markedBy: user.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await saveRecord(record, existing)
    setManageOpen(false)
  }

  // Start/End are always self-only and always for TODAY — the whole point is
  // the timestamp is captured automatically at the moment of the click, not
  // typed in, so it wouldn't mean anything for a different day or a different
  // person. Manual Present/Absent/Half Day marking (below) still covers
  // correcting past days or days without a clock-in. Neither button writes
  // a record directly any more — both just open AttendanceCaptureSheet,
  // which captures GPS → photo → timestamp, in that order, before
  // handleCaptured() is ever called. No geofence — location is captured for
  // MD/Admin verification, but never blocks attendance by distance.
  function handleStart() {
    if (!user) return
    const existing = records.find(r => r.userId === user.id && r.date === todayKey)
    if (existing?.startTime) return
    setCaptureMode('start')
  }

  function handleEnd() {
    if (!user) return
    const existing = records.find(r => r.userId === user.id && r.date === todayKey)
    if (!existing?.startTime || existing.endTime) return
    setCaptureMode('end')
  }

  async function handleCaptured(capture: AttendanceCapture & { timestamp: string }) {
    if (!user || !captureMode) return
    const existing = records.find(r => r.userId === user.id && r.date === todayKey)
    const now = new Date().toISOString()
    const record: AttendanceRecord = captureMode === 'start'
      ? {
          id: existing?.id ?? `att_${user.id}_${todayKey}`,
          userId: user.id, userName: user.name, date: todayKey,
          status: 'present',
          startTime: capture.timestamp,
          startCapture: { lat: capture.lat, lng: capture.lng, accuracy: capture.accuracy, photoUrl: capture.photoUrl },
          endTime: existing?.endTime,
          endCapture: existing?.endCapture,
          markedBy: user.name,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
      : {
          ...existing!,
          endTime: capture.timestamp,
          endCapture: { lat: capture.lat, lng: capture.lng, accuracy: capture.accuracy, photoUrl: capture.photoUrl },
          updatedAt: now,
        }
    setCaptureMode(null)
    await saveRecord(record, existing)
  }

  const monthDays = daysInMonth(viewYear, viewMonth)
  const firstWeekday = monthDays[0].getDay()

  function goPrevMonth() {
    const m = viewMonth === 0 ? 11 : viewMonth - 1
    const y = viewMonth === 0 ? viewYear - 1 : viewYear
    setViewMonth(m); setViewYear(y)
  }
  function goNextMonth() {
    const m = viewMonth === 11 ? 0 : viewMonth + 1
    const y = viewMonth === 11 ? viewYear + 1 : viewYear
    setViewMonth(m); setViewYear(y)
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const selectedDayLeaveNote = isOnApprovedLeave(user?.id ?? '', selectedDateKey, leaves)
  const myTodayRecord = myRecordByDate.get(todayKey)

  const historyOptions = useMemo(() => {
    if (!user) return []
    const self = { id: user.id, fullName: user.name }
    if (!canManageTeam) return [self]
    const others = team.filter(m => m.id !== user.id).map(m => ({ id: m.id, fullName: m.fullName }))
    return [self, ...others]
  }, [canManageTeam, team, user])

  // Flat, sortable table for MD/Admin — every team member's month at a
  // glance instead of opening each person's history one at a time.
  const teamHistoryRows = useMemo(() => {
    if (!canManageTeam) return []
    return historyOptions
      .flatMap(member => historyRowsFor(member.id).map(row => ({ member, ...row })))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.member.fullName.localeCompare(b.member.fullName))
  }, [canManageTeam, historyOptions, records, leaves, monthDays, todayKey])

  // Small round thumbnails inline (not a text link) — tapping one opens the
  // compact AttendanceCapturePreview instead of a big form-style Dialog.
  function captureThumbnails(rec?: AttendanceRecord) {
    if (!rec) return null
    const items: { label: string; capture: AttendanceCapture; timestamp?: string }[] = []
    if (rec.startCapture) items.push({ label: 'Start', capture: rec.startCapture, timestamp: rec.startTime })
    if (rec.endCapture) items.push({ label: 'End', capture: rec.endCapture, timestamp: rec.endTime })
    if (items.length === 0) return null
    return (
      <div className="flex items-center gap-2 mt-1.5">
        {items.map(item => (
          <button key={item.label} onClick={() => setViewCapture(item)}
            className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full border border-slate-200 active:bg-slate-50">
            <img src={item.capture.photoUrl} alt={`${item.label} photo`} className="w-6 h-6 rounded-full object-cover" />
            <span className="text-[10px] font-semibold text-slate-600">{item.label}</span>
          </button>
        ))}
      </div>
    )
  }

  function renderHistoryRow(row: { dateKey: string; status?: AttendanceStatus; rec?: AttendanceRecord }) {
    return (
      <div key={row.dateKey} className="bg-white rounded-2xl border border-slate-100 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-700">{fmtDate(row.dateKey)}</p>
          {row.status && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[row.status]}`}>
              {row.status.replace('_', ' ')}
            </span>
          )}
        </div>
        {row.rec && (row.rec.startTime || row.rec.endTime) && (
          <div className="flex items-center gap-4 mt-1.5 text-[11px] text-slate-500">
            <span>In: <span className="font-semibold text-slate-700">{fmtTime(row.rec.startTime)}</span></span>
            <span>Out: <span className="font-semibold text-slate-700">{fmtTime(row.rec.endTime)}</span></span>
            <span>Duration: <span className="font-semibold text-slate-700">{fmtDuration(row.rec.startTime, row.rec.endTime)}</span></span>
          </div>
        )}
        {attendanceSettings && row.rec?.startTime && (() => {
          const diff = minutesFromOfficeTime(row.rec!.startTime!, attendanceSettings.startTime)
          return (
            <p className="mt-1 text-[11px] font-semibold">
              <span className={diff > 0 ? 'text-red-600' : 'text-emerald-600'}>
                {diff > 0 ? `Late by ${fmtMinutes(diff)}` : 'On time'}
              </span>
              {row.rec?.endTime && minutesFromOfficeTime(row.rec.endTime, attendanceSettings.endTime) < 0 && (
                <span className="ml-2 text-amber-600">
                  Left early by {fmtMinutes(minutesFromOfficeTime(row.rec.endTime, attendanceSettings.endTime))}
                </span>
              )}
            </p>
          )
        })()}
        {row.status === 'absent' && row.rec?.reason && (
          <p className="mt-1.5 text-[11px] text-slate-500">Reason: {row.rec.reason}</p>
        )}
        {captureThumbnails(row.rec)}
      </div>
    )
  }

  function historyRowsFor(memberId: string) {
    return monthDays
      .map(d => {
        const dateKey = toDateKey(d)
        const rec = records.find(r => r.userId === memberId && r.date === dateKey)
        const status = effectiveStatus(memberId, dateKey)
        return { dateKey, status, rec }
      })
      .filter(row => row.status || row.dateKey <= todayKey) // don't show blank future days
      .filter(row => row.status) // only rows with an actual record/leave/auto-Absent
      .reverse()
  }

  // Payable-days impact, from the days actually marked (recorded or
  // auto-Absent/auto-Half-Day) so far this month — Half Day counts as 0.5,
  // Absent counts as 0.
  function monthSummaryFor(memberId: string) {
    let present = 0, half = 0, absent = 0
    for (const row of historyRowsFor(memberId)) {
      if (row.status === 'present') present++
      else if (row.status === 'half_day') half++
      else if (row.status === 'absent') absent++
    }
    return { present, half, absent, marked: present + half + absent, payableDays: present + half * 0.5 }
  }

  async function handleDownload() {
    const exportMembers = canManageTeam
      ? [{ id: user!.id, fullName: user!.name }, ...team.filter(m => m.id !== user?.id).map(m => ({ id: m.id, fullName: m.fullName }))]
      : [{ id: user!.id, fullName: user!.name }]
    await downloadAttendanceExcel(exportMembers, records, viewYear, viewMonth)
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-4 pt-3.5 pb-3.5 border-b border-slate-100">
        <h1 className="text-base font-extrabold text-slate-800">Attendance</h1>
        <div className="flex items-center justify-between mt-2">
          <button onClick={goPrevMonth} className="p-1.5 rounded-lg active:bg-slate-100">
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <span className="text-sm font-bold text-slate-700">{monthLabel}</span>
          <button onClick={goNextMonth} className="p-1.5 rounded-lg active:bg-slate-100">
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* My Attendance — always shown, everyone marks/clocks their own regardless of role. */}
      <div className="px-4 pt-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-base font-extrabold text-slate-800 mb-1.5">My Attendance — {selectedDateKey}</p>
          {selectedDayLeaveNote ? (
            <p className="text-xs text-slate-500">Marked as Absent (covered by an approved leave application).</p>
          ) : (
            <>
              {selectedDateKey === todayKey && (
                <>
                  {!attendanceSettings && (
                    <p className="text-[11px] text-amber-600 font-medium mb-2">
                      Office timing has not been configured yet. Contact your administrator.
                    </p>
                  )}
                  <div className="flex gap-2 mb-1">
                    <button
                      onClick={handleStart}
                      disabled={!attendanceSettings || !!myTodayRecord?.startTime}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold active:opacity-90 disabled:opacity-50 bg-emerald-600 text-white"
                    >
                      <LogIn size={14} />
                      {myTodayRecord?.startTime ? `Started ${fmtTime(myTodayRecord.startTime)}` : 'Start'}
                    </button>
                    <button
                      onClick={handleEnd}
                      disabled={!attendanceSettings || !myTodayRecord?.startTime || !!myTodayRecord?.endTime}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold active:opacity-90 disabled:opacity-50 bg-slate-700 text-white"
                    >
                      <LogOut size={14} />
                      {myTodayRecord?.endTime ? `Ended ${fmtTime(myTodayRecord.endTime)}` : 'End'}
                    </button>
                  </div>
                  {attendanceSettings && (myTodayRecord?.startTime || myTodayRecord?.endTime) && (
                    <div className="flex gap-4 mb-3 mt-1.5 text-[11px]">
                      {myTodayRecord?.startTime && (() => {
                        const diff = minutesFromOfficeTime(myTodayRecord.startTime, attendanceSettings.startTime)
                        return <span className={diff > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                          {diff > 0 ? `Late by ${fmtMinutes(diff)}` : 'On time'}
                        </span>
                      })()}
                      {myTodayRecord?.endTime && (() => {
                        const diff = minutesFromOfficeTime(myTodayRecord.endTime, attendanceSettings.endTime)
                        return <span className={diff < 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                          {diff < 0 ? `Left early by ${fmtMinutes(diff)}` : 'On time'}
                        </span>
                      })()}
                    </div>
                  )}
                </>
              )}
              <p className="text-[11px] text-slate-400 mb-2">
                Status: <span className={`font-bold ${effectiveStatus(user?.id ?? '', selectedDateKey) ? STATUS_STYLE[effectiveStatus(user?.id ?? '', selectedDateKey)!].split(' ')[1] : 'text-slate-400'}`}>
                  {effectiveStatus(user?.id ?? '', selectedDateKey)
                    ? STATUS_OPTIONS.find(o => o.value === effectiveStatus(user?.id ?? '', selectedDateKey))?.label
                    : 'Not marked yet'}
                </span>
                {!myRecordByDate.get(selectedDateKey)?.status && effectiveStatus(user?.id ?? '', selectedDateKey) === 'absent' && (
                  <span className="ml-1.5 text-slate-400">(auto — no attendance captured)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => user && (opt.value === 'absent'
                      ? openAbsentDialog(user.id, user.name, selectedDateKey)
                      : markStatus(user.id, user.name, selectedDateKey, opt.value))}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold active:opacity-80 ${
                      effectiveStatus(user?.id ?? '', selectedDateKey) === opt.value ? STATUS_STYLE[opt.value] : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* History — self always sees only their own; MD/Admin see every team member stacked, each collapsible.
          Collapsed by default; click the header to expand/collapse. */}
      <div className="px-4 pt-6 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => setHistoryOpen(o => !o)} aria-expanded={historyOpen}
            className="flex items-center gap-1.5 text-left">
            <p className="text-base font-extrabold text-slate-800">History — {monthLabel}</p>
            <ChevronDown size={18} className={`text-slate-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex items-center gap-2">
            {canManageTeam && (
              <button onClick={openAddDialog}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 active:bg-slate-50">
                <Plus size={12} /> Add
              </button>
            )}
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg active:opacity-80"
              style={{ background: '#0F2A4A', color: 'white' }}>
              <Download size={12} /> {canManageTeam ? 'Download Team Sheet' : 'Download'}
            </button>
          </div>
        </div>

        {historyOpen && (canManageTeam ? (
          teamHistoryRows.length === 0 ? (
            !isLoading && (
              <div className="text-center py-10 text-slate-400">
                <p className="text-sm">No attendance history in {monthLabel}</p>
              </div>
            )
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs border-collapse bg-white">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Employee</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Date</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Status</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">In</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Out</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Duration</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Late / Early</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap">Photo / GPS</th>
                    <th className="text-left px-3 py-2 border border-slate-200 font-semibold whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {teamHistoryRows.map(row => (
                    <tr key={`${row.member.id}_${row.dateKey}`}>
                      <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-700 whitespace-nowrap">
                        {row.member.fullName}{row.member.id === user?.id ? ' (Me)' : ''}
                      </td>
                      <td className="px-3 py-2 border border-slate-200 text-slate-500 whitespace-nowrap">{fmtDate(row.dateKey)}</td>
                      <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[row.status!]}`}>
                          {row.status!.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 border border-slate-200 text-slate-600 whitespace-nowrap">{fmtTime(row.rec?.startTime)}</td>
                      <td className="px-3 py-2 border border-slate-200 text-slate-600 whitespace-nowrap">{fmtTime(row.rec?.endTime)}</td>
                      <td className="px-3 py-2 border border-slate-200 text-slate-600 whitespace-nowrap">{fmtDuration(row.rec?.startTime, row.rec?.endTime)}</td>
                      <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                        {attendanceSettings && row.rec?.startTime && (() => {
                          const diff = minutesFromOfficeTime(row.rec!.startTime!, attendanceSettings.startTime)
                          return diff > 0
                            ? <span className="text-red-600 font-semibold">Late {fmtMinutes(diff)}</span>
                            : <span className="text-emerald-600 font-semibold">On time</span>
                        })()}
                        {attendanceSettings && row.rec?.endTime && (() => {
                          const diff = minutesFromOfficeTime(row.rec!.endTime!, attendanceSettings.endTime)
                          return diff < 0
                            ? <span className="ml-2 text-amber-600 font-semibold">Early {fmtMinutes(diff)}</span>
                            : null
                        })()}
                      </td>
                      <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                        {captureThumbnails(row.rec)}
                      </td>
                      <td className="px-3 py-2 border border-slate-200 whitespace-nowrap">
                        <button
                          onClick={() => openEditDialog(row.rec ?? {
                            id: `att_${row.member.id}_${row.dateKey}`, userId: row.member.id, userName: row.member.fullName,
                            date: row.dateKey, status: row.status!, markedBy: user?.name ?? '', createdAt: '', updatedAt: '',
                          })}
                          className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 active:opacity-70">
                          <Pencil size={11} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <>
            {!isLoading && historyRowsFor(user?.id ?? '').length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <p className="text-sm">No attendance history in {monthLabel}</p>
              </div>
            )}
            {historyRowsFor(user?.id ?? '').map(renderHistoryRow)}
          </>
        ))}
      </div>

      {/* Payable-days impact — lets an employee see at a glance how the month's
          marked attendance (Present/Half Day/Absent) adds up, without this app
          computing an actual ₹ salary figure (no wage field exists anywhere
          in this system). */}
      {user && (() => {
        const summary = monthSummaryFor(user.id)
        if (summary.marked === 0) return null
        return (
          <div className="px-4 pt-6">
            <div className="bg-white rounded-2xl border border-slate-100 p-4">
              <p className="text-base font-extrabold text-slate-800 mb-2">My Payable Days — {monthLabel}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>Present: <span className="font-semibold text-emerald-700">{summary.present}</span></span>
                <span>Half Day: <span className="font-semibold text-amber-700">{summary.half}</span></span>
                <span>Absent: <span className="font-semibold text-red-700">{summary.absent}</span></span>
              </div>
              <p className="mt-2 text-lg font-extrabold text-slate-800">
                {summary.payableDays} <span className="text-xs font-semibold text-slate-400">/ {summary.marked} days marked</span>
              </p>
              <p className="mt-1 text-[10px] text-slate-400">Half Day counts as 0.5; Absent counts as 0 toward payable days.</p>
            </div>
          </div>
        )
      })()}

      <div className="px-4 pt-6">
        <div className="bg-white rounded-2xl border border-slate-100 p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
            {monthDays.map(d => {
              const dateKey = toDateKey(d)
              const status = effectiveStatus(user?.id ?? '', dateKey)
              const isSelected = dateKey === selectedDateKey
              const isToday = dateKey === todayKey
              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDateKey(dateKey)}
                  className={`w-full max-w-[46px] mx-auto aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-semibold border transition-colors
                    ${isSelected ? 'border-brand-primary' : 'border-transparent'}
                    ${status ? STATUS_STYLE[status] : isToday ? 'font-extrabold text-slate-800' : 'text-slate-600'}`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 mt-3">
          {STATUS_OPTIONS.map(opt => (
            <div key={opt.value} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
              <span className="text-[11px] text-slate-500">{opt.label}</span>
            </div>
          ))}
        </div>
      </div>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />

      <Dialog
        isOpen={!!absentTarget}
        onClose={() => setAbsentTarget(null)}
        title={`Mark ${absentTarget?.userName ?? ''} Absent`}
        confirmLabel="Mark Absent"
        cancelLabel="Cancel"
        confirmDisabled={!absentReason.trim()}
        onConfirm={confirmMarkAbsent}
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Date</label>
            <DateField value={absentDate} onChange={setAbsentDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Reason *</label>
            <textarea rows={2} value={absentReason} onChange={e => setAbsentReason(e.target.value)}
              placeholder="Reason for absence…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-primary" />
          </div>
        </div>
      </Dialog>

      <BottomSheet isOpen={manageOpen} onClose={() => setManageOpen(false)} title={manageIsNew ? 'Add Attendance' : `Edit Attendance — ${manageUserName}`}>
        <div className="space-y-3">
          {manageError && <p className="text-xs text-red-600 font-semibold">{manageError}</p>}
          {manageIsNew ? (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Employee *</label>
              <SearchableSelect
                value={manageUserId}
                onChange={v => { const m = historyOptions.find(o => o.id === v); setManageUserId(v); setManageUserName(m?.fullName ?? '') }}
                options={historyOptions.map(o => ({ value: o.id, label: o.fullName }))}
                searchPlaceholder="Search employees…"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Employee</label>
              <p className="text-sm font-semibold text-slate-700">{manageUserName}</p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Date *</label>
            <DateField value={manageDate} disabled={!manageIsNew} onChange={setManageDate} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Status *</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setManageStatus(opt.value)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold active:opacity-80 ${
                    manageStatus === opt.value ? STATUS_STYLE[opt.value] : 'border-slate-200 text-slate-600'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">In Time</label>
              <TimeField value={manageStartTime} onChange={setManageStartTime} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Out Time</label>
              <TimeField value={manageEndTime} onChange={setManageEndTime} />
            </div>
          </div>
          {manageStatus === 'absent' && (
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Reason *</label>
              <textarea rows={2} value={manageReason} onChange={e => setManageReason(e.target.value)}
                placeholder="Reason for absence…"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-primary" />
            </div>
          )}
          <button onClick={handleManageSave}
            className="w-full py-3 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
            {manageIsNew ? 'Add Attendance' : 'Save Changes'}
          </button>
        </div>
      </BottomSheet>

      <AttendanceCaptureSheet
        isOpen={!!captureMode}
        onClose={() => setCaptureMode(null)}
        title={captureMode === 'end' ? 'End Attendance' : 'Start Attendance'}
        onCaptured={handleCaptured}
      />

      {viewCapture && (
        <AttendanceCapturePreview
          capture={viewCapture.capture}
          label={viewCapture.label}
          timestamp={viewCapture.timestamp}
          onClose={() => setViewCapture(null)}
        />
      )}
    </div>
  )
}
