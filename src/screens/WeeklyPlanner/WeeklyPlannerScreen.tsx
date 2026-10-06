import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllWeeklyPlans, upsertWeeklyPlan, deleteWeeklyPlan } from '../../services/weeklyPlanService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllAuditLogs } from '../../services/auditLogService'
import { getRoleDisplayLabel } from '../../data/permissions'
import type { WeeklyPlanEntry, ManagedUser, AuditLog } from '../../types'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function mondayOf(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  date.setHours(0, 0, 0, 0)
  return date
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function WeeklyPlannerScreen() {
  const { user, can } = useAuth()
  const canManageTeam = can('approve_leave')

  const [entries, setEntries] = useState<WeeklyPlanEntry[]>([])
  const [team, setTeam] = useState<ManagedUser[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  }), [weekStart])

  const [editTarget, setEditTarget] = useState<{ dateKey: string } | null>(null)
  const [activity, setActivity] = useState('')
  const [notes, setNotes] = useState('')
  const [viewTarget, setViewTarget] = useState<{ member: ManagedUser; dateKey: string } | null>(null)

  // RLS on sks_weekly_plans already restricts a non-manager's fetch to their
  // own row (see supabase/rls-policies.sql) — this filter is defense in
  // depth so a non-manager's React state never holds anyone else's plan
  // even transiently, not the only thing standing between them and it.
  async function refresh() {
    setIsLoading(true)
    const [ent, dir, logs] = await Promise.all([getAllWeeklyPlans(), getManagedUsersDirectory(), getAllAuditLogs()])
    setEntries(canManageTeam || !user ? ent : ent.filter(e => e.userId === user.id))
    setTeam(dir)
    setAuditLogs(logs)
    setIsLoading(false)
  }

  useEffect(() => { refresh() }, [canManageTeam])

  // Non-managers only ever see their own row here — the shared team
  // directory itself still lists everyone (other screens need that), but
  // this screen's data (plans) is owner/admin-only beyond your own.
  const orderedTeam = useMemo(() => {
    if (!user) return []
    if (!canManageTeam) {
      const self = team.find(m => m.id === user.id)
      return self ? [self] : []
    }
    const mine = team.filter(m => m.id === user.id)
    const rest = team.filter(m => m.id !== user.id)
    return [...mine, ...rest]
  }, [team, user, canManageTeam])

  function entryFor(userId: string, dateKey: string): WeeklyPlanEntry | undefined {
    return entries.find(e => e.userId === userId && e.date === dateKey)
  }

  // Real completed work (e.g. "Project X closed"), matched by name since
  // AuditLog only records createdBy as a display name, not a user id — same
  // as every other place in the app that renders audit entries. Shown
  // alongside manually-planned activity so the planner reflects what someone
  // actually did that day, not just what they said they'd do.
  function activityLogsFor(fullName: string, dateKey: string): AuditLog[] {
    return auditLogs.filter(l => l.createdBy === fullName && toDateKey(new Date(l.createdAt)) === dateKey)
  }

  function goPrevWeek() {
    const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d)
  }
  function goNextWeek() {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d)
  }
  function goThisWeek() {
    setWeekStart(mondayOf(new Date()))
  }

  function openEdit(dateKey: string) {
    if (!user) return
    const existing = entryFor(user.id, dateKey)
    setActivity(existing?.activity ?? '')
    setNotes(existing?.notes ?? '')
    setEditTarget({ dateKey })
  }

  async function handleSave() {
    if (!user || !editTarget) return
    if (!activity.trim()) { setSnack({ open: true, msg: 'Enter what you plan to do that day.', type: 'error' }); return }
    const existing = entryFor(user.id, editTarget.dateKey)
    const now = new Date().toISOString()
    const entry: WeeklyPlanEntry = {
      id: existing?.id ?? `wplan_${user.id}_${editTarget.dateKey}`,
      userId: user.id,
      userName: user.name,
      date: editTarget.dateKey,
      activity: activity.trim(),
      notes: notes.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    // Optimistic — don't make the click wait on the network round-trip.
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      if (idx === -1) return [...prev, entry]
      const next = [...prev]; next[idx] = entry
      return next
    })
    setEditTarget(null)
    const result = await upsertWeeklyPlan(entry)
    if (!result.ok) {
      setEntries(prev => existing ? prev.map(e => (e.id === entry.id ? existing : e)) : prev.filter(e => e.id !== entry.id))
      setSnack({ open: true, msg: result.error ?? 'Could not save plan.', type: 'error' })
      return
    }
    setSnack({ open: true, msg: 'Plan saved.', type: 'success' })
  }

  async function handleDelete() {
    if (!user || !editTarget) return
    const existing = entryFor(user.id, editTarget.dateKey)
    if (!existing) { setEditTarget(null); return }
    setEntries(prev => prev.filter(e => e.id !== existing.id))
    setEditTarget(null)
    const result = await deleteWeeklyPlan(existing.id)
    if (!result.ok) {
      setEntries(prev => [...prev, existing])
      setSnack({ open: true, msg: result.error ?? 'Could not delete plan.', type: 'error' })
      return
    }
    setSnack({ open: true, msg: 'Plan removed.', type: 'success' })
  }

  const weekRangeLabel = `${fmtDay(days[0])} – ${fmtDay(days[6])}`
  const editDate = editTarget ? days.find(d => toDateKey(d) === editTarget.dateKey) : undefined
  const editDayActivities = editTarget && user ? activityLogsFor(user.name, editTarget.dateKey) : []

  const viewDate = viewTarget ? days.find(d => toDateKey(d) === viewTarget.dateKey) : undefined
  const viewEntry = viewTarget ? entryFor(viewTarget.member.id, viewTarget.dateKey) : undefined
  const viewActivities = viewTarget ? activityLogsFor(viewTarget.member.fullName, viewTarget.dateKey) : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-4 pt-3.5 pb-3.5 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-extrabold text-slate-800">Weekly Planner</h1>
          <button onClick={goThisWeek} className="text-[11px] font-semibold text-indigo-600">This Week</button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <button onClick={goPrevWeek} className="p-1.5 rounded-lg active:bg-slate-100">
            <ChevronLeft size={18} className="text-slate-500" />
          </button>
          <span className="text-sm font-bold text-slate-700">{weekRangeLabel}</span>
          <button onClick={goNextWeek} className="p-1.5 rounded-lg active:bg-slate-100">
            <ChevronRight size={18} className="text-slate-500" />
          </button>
        </div>
        <p className="text-[12px] text-slate-400 mt-1">
          {canManageTeam ? 'Visible to the whole team — tap a day on your own row to plan it.' : 'Only you can see this — tap a day to plan it.'}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && orderedTeam.map(member => {
          const isSelf = member.id === user?.id
          return (
            <div key={member.id} className="bg-white rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{member.fullName}{isSelf ? ' (Me)' : ''}</p>
                  <p className="text-[12px] text-slate-400">{getRoleDisplayLabel(member.role, member.displayRole)}</p>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d, i) => {
                  const dateKey = toDateKey(d)
                  const entry = entryFor(member.id, dateKey)
                  const activities = activityLogsFor(member.fullName, dateKey)
                  const hasActivity = activities.length > 0
                  const clickable = isSelf || !!entry || hasActivity
                  const cellText = entry?.activity ?? (hasActivity ? activities[0].description : undefined)
                  return (
                    <button
                      key={dateKey}
                      disabled={!clickable}
                      onClick={() => (isSelf ? openEdit(dateKey) : (entry || hasActivity) && setViewTarget({ member, dateKey }))}
                      className={`relative rounded-lg border px-1 py-1.5 text-left min-h-[52px] transition-colors ${
                        entry ? 'bg-indigo-50 border-indigo-200' : hasActivity ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                      } ${!clickable ? 'opacity-60' : 'active:opacity-80'}`}
                    >
                      <p className="text-[9px] font-bold text-slate-400">{DAY_LABELS[i]}</p>
                      <p className={`text-[10px] leading-tight mt-0.5 line-clamp-2 ${
                        entry ? 'text-indigo-700 font-semibold' : hasActivity ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                      }`}>
                        {cellText ?? (isSelf ? '+ Add' : '—')}
                      </p>
                      {entry && hasActivity && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" title="Also has real activity logged" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {!isLoading && orderedTeam.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">No team members found</p>
          </div>
        )}
      </div>

      {/* Edit my own day */}
      <BottomSheet isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={editDate ? `Plan — ${fmtDay(editDate)}` : 'Plan'}>
        <div className="space-y-4 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Planned Activity *</label>
            <textarea rows={2} value={activity} onChange={e => setActivity(e.target.value)}
              placeholder="e.g. Site visit — Velachery"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Notes <span className="text-slate-300 font-normal">(optional)</span></label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional notes…"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleSave} className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90" style={{ background: '#0F2A4A' }}>
            Save Plan
          </button>
          {editTarget && user && entryFor(user.id, editTarget.dateKey) && (
            <button onClick={handleDelete} className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-red-500 py-2">
              <Trash2 size={13} /> Remove this day's plan
            </button>
          )}
          {editDayActivities.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Actually done that day (auto-logged)</p>
              <div className="space-y-1.5">
                {editDayActivities.map(log => (
                  <div key={log.id} className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                    <p className="text-xs text-emerald-800">{log.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* View someone else's day (read-only) */}
      <BottomSheet isOpen={!!viewTarget} onClose={() => setViewTarget(null)} title={viewTarget && viewDate ? `${viewTarget.member.fullName} — ${fmtDay(viewDate)}` : ''}>
        {viewTarget && (
          <div className="space-y-4 pb-4">
            {viewEntry && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1">Planned Activity</p>
                <p className="text-sm text-slate-800">{viewEntry.activity}</p>
                {viewEntry.notes && (
                  <>
                    <p className="text-xs font-semibold text-slate-500 mb-1 mt-2">Notes</p>
                    <p className="text-sm text-slate-600">{viewEntry.notes}</p>
                  </>
                )}
              </div>
            )}
            {viewActivities.length > 0 && (
              <div className={viewEntry ? 'pt-3 border-t border-slate-100' : ''}>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Actually done that day (auto-logged)</p>
                <div className="space-y-1.5">
                  {viewActivities.map(log => (
                    <div key={log.id} className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      <p className="text-xs text-emerald-800">{log.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
