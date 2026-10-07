import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wrench, CalendarCheck, MapPin, Clock, CheckCircle2, FolderKanban, ListChecks } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCRM } from '../../context/CRMContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getAllTasks } from '../../services/taskService'
import { getAllMRFs } from '../../services/mrfService'
import { getAllAppointments } from '../../services/appointmentService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllDailyReports } from '../../services/dailyReportService'
import { getAllLeaveApplications } from '../../services/leaveService'
import { getAllExpenseRequests } from '../../services/expenseService'
import { getAllPurchaseRequests, getAllPurchaseOrders } from '../../services/procurementService'
import { PROJECT_STAGE_ORDER, PROJECT_STAGE_LABEL } from '../ProjectWorkspace/ProjectStatusSheet'
import { buildMyTaskFeed } from './myTaskFeed'
import type {
  Appointment, DailyReport, Lead, MaterialRequestForm, Project,
  PurchaseOrder, PurchaseRequest, SiteVisit, Task, ExpenseRequest, LeaveApplication,
} from '../../types'

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString()
}
function fmtShort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function MyTaskScreen() {
  const { user } = useAuth()
  const { leads } = useCRM()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>([])
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([])
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setIsLoading(true)
      const [p, t, m, a, sv, dr, la, er, pr, po] = await Promise.all([
        getAllProjects(), getAllTasks(), getAllMRFs(), getAllAppointments(), getAllSiteVisits(),
        getAllDailyReports(), getAllLeaveApplications(), getAllExpenseRequests(),
        getAllPurchaseRequests(), getAllPurchaseOrders(),
      ])
      setProjects(p); setTasks(t); setMrfs(m); setAppointments(a); setSiteVisits(sv)
      setDailyReports(dr); setLeaveApplications(la); setExpenseRequests(er)
      setPurchaseRequests(pr); setPurchaseOrders(po)
      setIsLoading(false)
    })()
  }, [])

  const feed = useMemo(() => {
    if (!user) return []
    return buildMyTaskFeed({
      user, leads: leads as Lead[], projects, tasks, mrfs, appointments, siteVisits, dailyReports,
      leaveApplications, expenseRequests, purchaseRequests, purchaseOrders,
    })
  }, [user, leads, projects, tasks, mrfs, appointments, siteVisits, dailyReports, leaveApplications, expenseRequests, purchaseRequests, purchaseOrders])

  const completedTasks = useMemo(() => tasks.filter(t => t.assigneeId === user?.id && t.status === 'completed'), [tasks, user])
  const todayVisits = useMemo(() => {
    const apptCount = appointments.filter(a => a.status !== 'cancelled' && isToday(a.scheduledAt) && (a.assignedToIds ?? (a.coordinatorId ? [a.coordinatorId] : [])).includes(user?.id ?? '')).length
    const svCount = siteVisits.filter(v => isToday(v.visitDate) && (v.teamMemberIds ?? []).includes(user?.id ?? '')).length
    return apptCount + svCount
  }, [appointments, siteVisits, user])

  // Active Projects — coordinator, current stage-assignee, or has an open task here.
  const activeProjects = useMemo(() => {
    if (!user) return []
    return projects.filter(p =>
      p.status === 'active' && (
        p.coordinatorId === user.id ||
        p.assignedToId === user.id ||
        tasks.some(t => t.projectId === p.id && t.assigneeId === user.id && t.status !== 'completed')
      ),
    )
  }, [projects, tasks, user])

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-4 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-extrabold text-slate-800">Task</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3 max-w-2xl mx-auto">
        {/* Summary banner */}
        <div className="rounded-2xl border p-4 flex items-center justify-between" style={{ background: '#DBEAFE', borderColor: '#BFDBFE' }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#1D4ED8' }}>Your Tasks</p>
            <p className="text-3xl font-extrabold leading-tight" style={{ color: '#1D4ED8' }}>{feed.length}</p>
            <p className="text-xs" style={{ color: '#1D4ED8' }}>waiting for your action</p>
          </div>
          <Wrench size={26} style={{ color: '#3B82F6' }} />
        </div>

        {/* Live counts */}
        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
          {([
            { label: 'Tasks', value: feed.length + completedTasks.length, Icon: CalendarCheck, tint: 'bg-blue-100 text-blue-600' },
            { label: 'Today Visits', value: todayVisits, Icon: MapPin, tint: 'bg-orange-100 text-orange-600' },
            { label: 'Pending', value: feed.length, Icon: Clock, tint: 'bg-red-100 text-red-600' },
            { label: 'Done', value: completedTasks.length, Icon: CheckCircle2, tint: 'bg-emerald-100 text-emerald-600' },
          ] as const).map(({ label, value, Icon, tint }) => (
            <div key={label} className="bg-white rounded-2xl shadow-card border border-slate-100 py-3 px-1 flex flex-col items-center text-center">
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${tint}`}><Icon size={15} /></span>
              <span className="text-xl font-extrabold text-slate-800 leading-none">{value}</span>
              <span className="text-[11px] font-semibold text-slate-400 mt-1">{label}</span>
            </div>
          ))}
        </div>

        {/* Ready for Next Step */}
        <div className="flex items-center gap-2 pt-1">
          <span className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center"><ListChecks size={14} /></span>
          <h2 className="text-sm font-extrabold text-slate-800">Ready for Next Step</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{feed.length}</span>
        </div>

        {!isLoading && feed.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">Nothing needs your action right now.</p>
        )}

        <div className="space-y-2.5">
          {feed.map(item => (
            <div key={item.key} className="bg-white rounded-2xl shadow-card border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] text-slate-400 shrink-0 mt-0.5">{fmtShort(item.at)}</span>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${item.badgeCls}`}>{item.badge}</span>
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 mt-2">{item.title}</h3>
              <p className="text-xs text-slate-600 mt-1.5 break-words">
                <span className="text-slate-400">{item.subjectLabel}: </span>
                <span className="font-semibold">{item.subject}</span>
              </p>
              {item.meta.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                  {item.meta.map((m, i) => <span key={i} className="text-xs text-slate-400 break-words">{m}</span>)}
                </div>
              )}
              {item.note && <p className="text-xs text-slate-500 mt-2 italic break-words">&ldquo;{item.note}&rdquo;</p>}
              {item.person && <p className="text-xs font-semibold text-teal-700 mt-3">Assigned to: {item.person}</p>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-500">Pending</span>
                <button onClick={() => navigate(item.linkTo)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 active:bg-blue-700">
                  Update Status
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Active Projects */}
        <div className="flex items-center gap-2 pt-1">
          <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><FolderKanban size={16} /></span>
          <h2 className="text-base font-extrabold text-slate-800">Active Projects</h2>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{activeProjects.length}</span>
        </div>

        {!isLoading && activeProjects.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No active projects assigned to you.</p>
        )}

        <div className="grid gap-3 xl:grid-cols-2">
          {activeProjects.map(p => {
            const stageIdx = PROJECT_STAGE_ORDER.indexOf(p.stage)
            const pct = stageIdx >= 0 ? Math.round(((stageIdx + 1) / PROJECT_STAGE_ORDER.length) * 100) : 0
            return (
              <button key={p.id} onClick={() => navigate(`/my-tasks/project/${p.id}`)}
                className="text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                  <StatusBadge status={p.status} />
                </div>
                <p className="text-xs text-slate-400 mb-2">{PROJECT_STAGE_LABEL[p.stage]} · {p.clientName}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-bold text-slate-600">{pct}%</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
