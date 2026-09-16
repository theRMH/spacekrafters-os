import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, LogIn, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import { getAllAttendance, upsertAttendance } from '../../services/attendanceService'
import { getAllLeaveApplications } from '../../services/leaveService'
import { getManagedUsersDirectory } from '../../services/userService'
import { downloadAttendanceExcel } from '../../utils/attendanceExport'
import type { AttendanceRecord, AttendanceStatus, LeaveApplication, ManagedUser } from '../../types'

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

function fmtDate(dateKey: string): string {
  const d = new Date(dateKey)
  if (isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
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
  const [isLoading, setIsLoading] = useState(true)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const today = new Date()
  const todayKey = toDateKey(today)
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)

  async function refresh() {
    setIsLoading(true)
    const [att, lv, dir] = await Promise.all([
      getAllAttendance(),
      getAllLeaveApplications(),
      canManageTeam ? getManagedUsersDirectory() : Promise.resolve([]),
    ])
    setRecords(att)
    setLeaves(lv)
    setTeam(dir)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [canManageTeam])

  const myRecordByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>()
    records.filter(r => r.userId === user?.id).forEach(r => map.set(r.date, r))
    return map
  }, [records, user?.id])

  // Approved leave wins over whatever the attendance record says, and is
  // folded into Absent — Attendance only ever shows Present/Absent/Half Day;
  // Leave is a separate concept tracked in the Leave module. A leave approval
  // is a deliberate, authoritative decision, whereas the attendance record
  // for that same day could just be stale (e.g. marked Absent before the
  // leave was approved, or never updated after).
  function effectiveStatus(userId: string, dateKey: string): AttendanceStatus | undefined {
    if (isOnApprovedLeave(userId, dateKey, leaves)) return 'absent'
    const rec = records.find(r => r.userId === userId && r.date === dateKey)
    return rec?.status
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

  // Start/End are always self-only and always for TODAY — the whole point is
  // the timestamp is captured automatically at the moment of the click, not
  // typed in, so it wouldn't mean anything for a different day or a different
  // person. Manual Present/Absent/Half Day marking (below) still covers
  // correcting past days or days without a clock-in.
  async function handleStart() {
    if (!user) return
    const existing = records.find(r => r.userId === user.id && r.date === todayKey)
    if (existing?.startTime) return
    const now = new Date().toISOString()
    const record: AttendanceRecord = {
      id: existing?.id ?? `att_${user.id}_${todayKey}`,
      userId: user.id, userName: user.name, date: todayKey,
      status: 'present',
      startTime: now,
      endTime: existing?.endTime,
      markedBy: user.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await saveRecord(record, existing)
  }

  async function handleEnd() {
    if (!user) return
    const existing = records.find(r => r.userId === user.id && r.date === todayKey)
    if (!existing?.startTime || existing.endTime) return
    const now = new Date().toISOString()
    const record: AttendanceRecord = { ...existing, endTime: now, updatedAt: now }
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
        {row.status === 'absent' && row.rec?.reason && (
          <p className="mt-1.5 text-[11px] text-slate-500">Reason: {row.rec.reason}</p>
        )}
      </div>
    )
  }

  function historyRowsFor(memberId: string) {
    return monthDays
      .map(d => {
        const dateKey = toDateKey(d)
        const rec = records.find(r => r.userId === memberId && r.date === dateKey)
        const status = isOnApprovedLeave(memberId, dateKey, leaves) ? 'absent' : rec?.status
        return { dateKey, status, rec }
      })
      .filter(row => row.status || row.dateKey <= todayKey) // don't show blank future days
      .filter(row => row.status) // only rows with an actual record/leave
      .reverse()
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

      <div className="px-4 pt-4">
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
              const status = canManageTeam ? undefined : effectiveStatus(user?.id ?? '', dateKey)
              const isSelected = dateKey === selectedDateKey
              const isToday = dateKey === todayKey
              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDateKey(dateKey)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-semibold border transition-colors
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

      {/* My Attendance — always shown, everyone marks/clocks their own regardless of role. */}
      <div className="px-4 pt-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-xs font-bold text-slate-700 mb-1">My Attendance — {selectedDateKey}</p>
          {selectedDayLeaveNote ? (
            <p className="text-xs text-slate-500">Marked as Absent (covered by an approved leave application).</p>
          ) : (
            <>
              {selectedDateKey === todayKey && (
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={handleStart}
                    disabled={!!myTodayRecord?.startTime}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold active:opacity-90 disabled:opacity-50 bg-emerald-600 text-white"
                  >
                    <LogIn size={14} />
                    {myTodayRecord?.startTime ? `Started ${fmtTime(myTodayRecord.startTime)}` : 'Start'}
                  </button>
                  <button
                    onClick={handleEnd}
                    disabled={!myTodayRecord?.startTime || !!myTodayRecord?.endTime}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold active:opacity-90 disabled:opacity-50 bg-slate-700 text-white"
                  >
                    <LogOut size={14} />
                    {myTodayRecord?.endTime ? `Ended ${fmtTime(myTodayRecord.endTime)}` : 'End'}
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mb-2">
                Status: <span className={`font-bold ${myRecordByDate.get(selectedDateKey)?.status ? STATUS_STYLE[myRecordByDate.get(selectedDateKey)!.status].split(' ')[1] : 'text-slate-400'}`}>
                  {myRecordByDate.get(selectedDateKey)?.status
                    ? STATUS_OPTIONS.find(o => o.value === myRecordByDate.get(selectedDateKey)!.status)?.label
                    : 'Not marked yet'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => user && (opt.value === 'absent'
                      ? openAbsentDialog(user.id, user.name, selectedDateKey)
                      : markStatus(user.id, user.name, selectedDateKey, opt.value))}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold active:opacity-80 ${
                      myRecordByDate.get(selectedDateKey)?.status === opt.value ? STATUS_STYLE[opt.value] : 'border-slate-200 text-slate-600'
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


      {/* History — self always sees only their own; MD/Admin see every team member stacked, each collapsible. */}
      <div className="px-4 pt-6 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">History — {monthLabel}</p>
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg active:opacity-80"
            style={{ background: '#0F2A4A', color: 'white' }}>
            <Download size={12} /> {canManageTeam ? 'Download Team Sheet' : 'Download'}
          </button>
        </div>

        {canManageTeam ? (
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
        )}
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
            <input type="date" value={absentDate} onChange={e => setAbsentDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-brand-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Reason *</label>
            <textarea rows={2} value={absentReason} onChange={e => setAbsentReason(e.target.value)}
              placeholder="Reason for absence…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-primary" />
          </div>
        </div>
      </Dialog>
    </div>
  )
}
