import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllAttendance, upsertAttendance } from '../../services/attendanceService'
import { getAllLeaveApplications } from '../../services/leaveService'
import { getManagedUsersDirectory } from '../../services/userService'
import type { AttendanceRecord, AttendanceStatus, LeaveApplication, ManagedUser } from '../../types'

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; dot: string }[] = [
  { value: 'present',  label: 'Present',  dot: 'bg-emerald-500' },
  { value: 'absent',   label: 'Absent',   dot: 'bg-red-500'     },
  { value: 'half_day', label: 'Half Day', dot: 'bg-amber-500'   },
  { value: 'leave',    label: 'Leave',    dot: 'bg-slate-400'   },
]

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  absent:   'bg-red-50 text-red-600 border-red-200',
  half_day: 'bg-amber-50 text-amber-700 border-amber-200',
  leave:    'bg-slate-100 text-slate-500 border-slate-200',
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
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
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey(today))

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

  function effectiveStatus(userId: string, dateKey: string): AttendanceStatus | undefined {
    const rec = records.find(r => r.userId === userId && r.date === dateKey)
    if (rec) return rec.status
    if (isOnApprovedLeave(userId, dateKey, leaves)) return 'leave'
    return undefined
  }

  async function markStatus(targetUserId: string, targetUserName: string, dateKey: string, status: AttendanceStatus) {
    if (!user) return
    const existing = records.find(r => r.userId === targetUserId && r.date === dateKey)
    const now = new Date().toISOString()
    const record: AttendanceRecord = {
      id: existing?.id ?? `att_${targetUserId}_${dateKey}`,
      userId: targetUserId,
      userName: targetUserName,
      date: dateKey,
      status,
      markedBy: user.name,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    const result = await upsertAttendance(record)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not save attendance.', type: 'error' }); return }
    setRecords(prev => {
      const idx = prev.findIndex(r => r.id === record.id)
      if (idx === -1) return [record, ...prev]
      const next = [...prev]
      next[idx] = record
      return next
    })
    setSnack({ open: true, msg: 'Attendance updated.', type: 'success' })
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
  const selectedDayLeaveNote = !canManageTeam && isOnApprovedLeave(user?.id ?? '', selectedDateKey, leaves)

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
              const isToday = dateKey === toDateKey(today)
              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDateKey(dateKey)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-semibold border transition-colors
                    ${isSelected ? 'border-brand-primary' : 'border-transparent'}
                    ${status ? STATUS_STYLE[status] : isToday ? 'bg-slate-100 text-slate-700' : 'text-slate-600'}`}
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

      {!canManageTeam && (
        <div className="px-4 pt-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-bold text-slate-700 mb-1">{selectedDateKey}</p>
            {selectedDayLeaveNote ? (
              <p className="text-xs text-slate-500">Marked as leave (approved leave application covers this date).</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {STATUS_OPTIONS.filter(o => o.value !== 'leave').map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => user && markStatus(user.id, user.name, selectedDateKey, opt.value)}
                    className={`px-3 py-2 rounded-xl border text-xs font-semibold active:opacity-80 ${
                      myRecordByDate.get(selectedDateKey)?.status === opt.value ? STATUS_STYLE[opt.value] : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {canManageTeam && (
        <div className="px-4 pt-4 space-y-2.5">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Team — {selectedDateKey}</p>
          {!isLoading && team.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">No team members found</p>
            </div>
          )}
          {team.map(member => {
            const status = effectiveStatus(member.id, selectedDateKey)
            const onLeave = isOnApprovedLeave(member.id, selectedDateKey, leaves)
            return (
              <div key={member.id} className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{member.fullName}</p>
                    <p className="text-[11px] text-slate-400">{member.displayRole}</p>
                  </div>
                  {status && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLE[status]}`}>
                      {status.replace('_', ' ')}
                    </span>
                  )}
                </div>
                {!onLeave && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                    {STATUS_OPTIONS.filter(o => o.value !== 'leave').map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => markStatus(member.id, member.fullName, selectedDateKey, opt.value)}
                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-semibold active:opacity-80 ${
                          status === opt.value ? STATUS_STYLE[opt.value] : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
