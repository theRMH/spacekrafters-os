import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { hasRole } from '../../utils/permissions'
import { AppHeader } from '../../components/layout/AppHeader'
import { Accordion } from '../../components/layout/Accordion'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAllProjects, upsertProject } from '../../services/projectService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllRequirements } from '../../services/requirementService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllDesignPackages, getAllDesignVersions } from '../../services/designService'
import { getAllTasks, upsertTask, getAllTaskDependencies } from '../../services/taskService'
import { getAllDiaryEntries, upsertDiaryEntry } from '../../services/dailyDiaryService'
import { getAllExpenseRequests } from '../../services/expenseService'
import { getAllPaymentMilestones, getAllReceipts } from '../../services/financeService'
import { getAllPunchListItems, upsertPunchListItem } from '../../services/punchListService'
import { getAllDocuments, upsertDocument, getAllDocumentVersions, addDocumentVersion } from '../../services/documentService'
import { getAllMRFs } from '../../services/mrfService'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { Dialog } from '../../components/feedback/Dialog'
import { GanttChart } from './GanttChart'
import { ProjectStatusSheet, ROLE_FOR_PROJECT_STAGE, PROJECT_STAGE_LABEL } from './ProjectStatusSheet'
import { ROLE_LABELS } from '../../data/permissions'
import type { Project, ManagedUser, Requirement, Quotation, DesignPackage, DesignVersion, Task, TaskDependency, DailyDiaryEntry, ExpenseRequest, PaymentMilestone, Receipt, SiteVisit, PunchListItem, ProjectDocument, ProjectDocumentVersion, UserRole, MaterialRequestForm } from '../../types'

type Tab = 'overview' | 'gantt' | 'team' | 'tasks' | 'requirements' | 'boq' | 'design' | 'diary' | 'finance' | 'procurement' | 'documents' | 'handover'

const TABS: { value: Tab; label: string; placeholder?: boolean }[] = [
  { value: 'overview',     label: 'Overview' },
  { value: 'gantt',        label: 'Gantt' },
  { value: 'team',         label: 'Team' },
  { value: 'tasks',        label: 'Tasks' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'boq',          label: 'BOQ' },
  { value: 'design',       label: 'Design' },
  { value: 'diary',        label: 'Diary' },
  { value: 'finance',      label: 'Finance' },
  { value: 'procurement',  label: 'Procurement', placeholder: true },
  { value: 'documents',    label: 'Documents' },
  { value: 'handover',     label: 'Handover' },
]

// Field roles (site_engineer, designer) can open a project workspace to
// reach tasks assigned to them (see 'project-workspace' in permissions.ts),
// but Finance/BOQ/Procurement show contract value, budget, margin, and
// payment milestones with no further gating of their own — hide those three
// tabs specifically for these two roles rather than widening view_projects
// itself, which would also expose the same figures on the Projects list.
const FIELD_ROLES: UserRole[] = ['site_engineer', 'designer']
const SENSITIVE_TABS: Tab[] = ['finance', 'boq', 'procurement']

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function fmtDate(val?: string): string {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtCurrency(n?: number): string {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function emptyTask(projectId: string, createdBy: string): Task {
  const now = new Date().toISOString()
  return {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId, title: '', status: 'not_started',
    createdBy, createdAt: now, updatedAt: now,
  }
}

export default function ProjectWorkspaceScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, can } = useAuth()

  const isFieldRole = user ? FIELD_ROLES.some(r => hasRole(user, r)) : false
  const visibleTabs = isFieldRole ? TABS.filter(t => !SENSITIVE_TABS.includes(t.value)) : TABS

  const tabParam = searchParams.get('tab') as Tab | null
  const [tab, setTab] = useState<Tab>(tabParam && visibleTabs.some(t => t.value === tabParam) ? tabParam : 'overview')
  const [isLoading, setIsLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [designPackages, setDesignPackages] = useState<DesignPackage[]>([])
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [dependencies, setDependencies] = useState<TaskDependency[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DailyDiaryEntry[]>([])
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([])
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [punchListItems, setPunchListItems] = useState<PunchListItem[]>([])
  const [showNewPunchItem, setShowNewPunchItem] = useState(false)
  const [punchDescription, setPunchDescription] = useState('')
  const [punchLocation, setPunchLocation] = useState('')
  const [punchPhotos, setPunchPhotos] = useState<string[]>([])
  const [showHandoverConfirm, setShowHandoverConfirm] = useState(false)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [documentVersions, setDocumentVersions] = useState<ProjectDocumentVersion[]>([])
  const [selectedDocument, setSelectedDocument] = useState<ProjectDocument | null>(null)
  const [showNewDocument, setShowNewDocument] = useState(false)
  const [showNewDocVersion, setShowNewDocVersion] = useState(false)
  const [newDocName, setNewDocName] = useState('')
  const [docVersionFiles, setDocVersionFiles] = useState<string[]>([])
  const [docVersionNote, setDocVersionNote] = useState('')
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState('')
  const [showNewDiary, setShowNewDiary] = useState(false)
  const [diaryDate, setDiaryDate] = useState(todayISO())
  const [diaryWorkDone, setDiaryWorkDone] = useState('')
  const [diaryBlockers, setDiaryBlockers] = useState('')
  const [diaryPhotos, setDiaryPhotos] = useState<string[]>([])
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [projects, dirUsers, reqs, quotes, pkgs, versions, allTasks, allDeps, allDiary, allExpenses, allMilestones, allReceipts, allSiteVisits, allPunchItems, allDocuments, allDocumentVersions, allMrfs] = await Promise.all([
        getAllProjects(),
        getManagedUsersDirectory(),
        getAllRequirements(),
        getAllQuotations(),
        getAllDesignPackages(),
        getAllDesignVersions(),
        getAllTasks(),
        getAllTaskDependencies(),
        getAllDiaryEntries(),
        getAllExpenseRequests(),
        getAllPaymentMilestones(),
        getAllReceipts(),
        getAllSiteVisits(),
        getAllPunchListItems(),
        getAllDocuments(),
        getAllDocumentVersions(),
        getAllMRFs(),
      ])
      setProject(projects.find(p => p.id === id) ?? null)
      setUsers(dirUsers)
      setRequirements(reqs)
      setQuotations(quotes)
      setDesignPackages(pkgs)
      setDesignVersions(versions)
      setTasks(allTasks)
      setDependencies(allDeps)
      setDiaryEntries(allDiary)
      setExpenseRequests(allExpenses)
      setMilestones(allMilestones)
      setReceipts(allReceipts)
      setSiteVisits(allSiteVisits)
      setPunchListItems(allPunchItems)
      setDocuments(allDocuments)
      setDocumentVersions(allDocumentVersions)
      setMrfs(allMrfs)
      setIsLoading(false)
    }
    load()
  }, [id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">Loading…</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AppHeader />
        <p className="text-sm text-slate-400 text-center py-16">Project not found.</p>
      </div>
    )
  }

  const projectRequirements = requirements.filter(r => {
    if (r.projectId) return r.projectId === project.id
    const visit = siteVisits.find(v => v.id === r.siteVisitId)
    return visit?.leadId != null && visit.leadId === project.leadId
  })
  const projectQuotation = quotations.find(q => q.projectId === project.id)
  const projectDesignPackages = designPackages.filter(p => p.projectId === project.id)
  const projectTasks = tasks.filter(t => t.projectId === project.id)
  const projectDependencies = dependencies.filter(d => d.projectId === project.id)
  const topLevelTasks = projectTasks.filter(t => !t.parentTaskId)
  // Employees (anyone without edit_task, i.e. no manage-tasks permission) only
  // ever see tasks assigned to themselves — matches the same rule applied in
  // TaskDetailScreen's subtasks and TasksScreen's per-project counts. Owner/
  // project_coordinator (who can edit_task) see and manage everything.
  const canManageTasks = can('edit_task')
  const visibleTopLevelTasks = canManageTasks ? topLevelTasks : topLevelTasks.filter(t => t.assigneeId === user?.id)
  const projectDiaryEntries = diaryEntries.filter(e => e.projectId === project.id)
  const projectExpenses = expenseRequests.filter(e => e.projectId === project.id && e.status === 'paid')
  const projectMilestones = milestones.filter(m => m.projectId === project.id)
  const projectReceipts = receipts.filter(r => r.projectId === project.id)
  const projectPunchItems = punchListItems.filter(p => p.projectId === project.id)
  const unresolvedPunchItems = projectPunchItems.filter(p => p.status === 'open').length
  const projectDocuments = documents.filter(d => d.projectId === project.id)
  function docVersionsFor(documentId: string): ProjectDocumentVersion[] {
    return documentVersions.filter(v => v.documentId === documentId).sort((a, b) => b.versionNumber - a.versionNumber)
  }
  const actualSpend = projectExpenses.reduce((sum, e) => sum + (e.paidAmount ?? e.amount), 0)
  const totalCollected = projectReceipts.reduce((sum, r) => sum + r.amount, 0)
  const contractValue = project.contractValue ?? 0
  const internalBudget = project.internalBudget ?? 0
  const margin = contractValue - internalBudget
  const marginPct = contractValue > 0 ? (margin / contractValue) * 100 : 0
  const budgetVariance = internalBudget - actualSpend
  const assigneeIds = Array.from(new Set(projectTasks.map(t => t.assigneeId).filter(Boolean))) as string[]
  const teamMembers = users.filter(u => u.id === project.coordinatorId || assigneeIds.includes(u.id))

  async function handleAddTask() {
    if (!project || !user || !newTaskTitle.trim() || !newTaskAssigneeId) return
    const assignee = users.find(u => u.id === newTaskAssigneeId)
    const task: Task = {
      ...emptyTask(project.id, user.id), title: newTaskTitle.trim(),
      assigneeId: newTaskAssigneeId, assigneeName: assignee?.fullName,
    }
    const result = await upsertTask(task)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add task.', type: 'error' }); return }
    setTasks(prev => [task, ...prev])
    setNewTaskTitle('')
    setNewTaskAssigneeId('')
    setShowNewTask(false)
    setSnack({ open: true, msg: 'Task added.', type: 'success' })
  }

  async function handleAddDiaryEntry() {
    if (!project || !user || !diaryWorkDone.trim()) return
    const now = new Date().toISOString()
    const entry: DailyDiaryEntry = {
      id: `diary_${Date.now()}`,
      projectId: project.id,
      date: diaryDate,
      workDone: diaryWorkDone.trim(),
      blockers: diaryBlockers.trim() || undefined,
      photos: diaryPhotos,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertDiaryEntry(entry)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add diary entry.', type: 'error' }); return }
    setDiaryEntries(prev => [entry, ...prev])
    setDiaryDate(todayISO())
    setDiaryWorkDone('')
    setDiaryBlockers('')
    setDiaryPhotos([])
    setShowNewDiary(false)
    setSnack({ open: true, msg: 'Diary entry saved.', type: 'success' })
  }

  async function handleAddPunchItem() {
    if (!project || !user || !punchDescription.trim()) return
    const now = new Date().toISOString()
    const item: PunchListItem = {
      id: `punch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: project.id,
      description: punchDescription.trim(),
      location: punchLocation.trim() || undefined,
      status: 'open',
      photos: punchPhotos,
      raisedBy: user.id,
      raisedByName: user.name,
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertPunchListItem(item)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add punch item.', type: 'error' }); return }
    setPunchListItems(prev => [item, ...prev])
    setPunchDescription('')
    setPunchLocation('')
    setPunchPhotos([])
    setShowNewPunchItem(false)
    setSnack({ open: true, msg: 'Punch item added.', type: 'success' })
  }

  async function handleSetPunchItemStatus(item: PunchListItem, status: PunchListItem['status']) {
    const updated: PunchListItem = { ...item, status, resolvedAt: status === 'open' ? undefined : new Date().toISOString(), updatedAt: new Date().toISOString() }
    const result = await upsertPunchListItem(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to update punch item.', type: 'error' }); return }
    setPunchListItems(prev => prev.map(p => (p.id === item.id ? updated : p)))
  }

  async function handleAddDocument() {
    if (!project || !user || !newDocName.trim()) return
    const now = new Date().toISOString()
    const doc: ProjectDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: project.id,
      name: newDocName.trim(),
      createdBy: user.name,
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertDocument(doc)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to create document.', type: 'error' }); return }
    setDocuments(prev => [doc, ...prev])
    setNewDocName('')
    setShowNewDocument(false)
    setSnack({ open: true, msg: 'Document created.', type: 'success' })
  }

  function openDocVersionUpload() {
    setDocVersionFiles([])
    setDocVersionNote('')
    setShowNewDocVersion(true)
  }

  async function handleAddDocVersion() {
    if (!user || !selectedDocument || docVersionFiles.length === 0) return
    const nextVersionNumber = docVersionsFor(selectedDocument.id).length + 1
    const version: ProjectDocumentVersion = {
      id: `docver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      documentId: selectedDocument.id,
      versionNumber: nextVersionNumber,
      files: docVersionFiles,
      note: docVersionNote.trim() || undefined,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    }
    const result = await addDocumentVersion(version)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to add version.', type: 'error' }); return }
    setDocumentVersions(prev => [version, ...prev])
    setShowNewDocVersion(false)
    setSnack({ open: true, msg: 'Version added.', type: 'success' })
  }

  async function handleConfirmHandover() {
    if (!project || !user) return
    const updated: Project = { ...project, handoverSignedAt: new Date().toISOString(), handoverSignedBy: user.name, updatedAt: new Date().toISOString() }
    const result = await upsertProject(updated)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Failed to record handover.', type: 'error' }); return }
    setProject(updated)
    setShowHandoverConfirm(false)
    setSnack({ open: true, msg: 'Handover marked complete.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24">
      <AppHeader />

      <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-200 sticky top-14 z-20">
        <button onClick={() => navigate(can('view_projects') ? '/projects' : '/tasks')}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-2 active:text-slate-700">
          <ChevronLeft size={14} /> {can('view_projects') ? 'Projects' : 'Tasks'}
        </button>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
        <p className="text-xs text-slate-500 mb-3">{project.clientName}</p>

        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {visibleTabs.map(t => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                tab === t.value ? 'text-white' : 'bg-slate-100 text-slate-500'
              }`}
              style={tab === t.value ? { background: '#0F2A4A' } : undefined}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {tab === 'overview' && (
          <>
            {project.status !== 'closed' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 mb-4">
                <div>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Current Stage</p>
                  <p className="text-sm font-bold text-slate-800 mt-1">{PROJECT_STAGE_LABEL[project.stage]}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Responsible: {project.assignedToName ?? (ROLE_FOR_PROJECT_STAGE[project.stage] ? ROLE_LABELS[ROLE_FOR_PROJECT_STAGE[project.stage]!] : '—')}
                  </p>
                </div>
                <button onClick={() => setShowStatusSheet(true)}
                  className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90"
                  style={{ background: '#0F2A4A' }}>
                  Update Status →
                </button>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 mb-4">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Material Requests (MRF)</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {mrfs.filter(m => m.projectId === project.id).length === 0
                    ? 'No MRFs raised for this project yet.'
                    : `${mrfs.filter(m => m.projectId === project.id).length} MRF${mrfs.filter(m => m.projectId === project.id).length !== 1 ? 's' : ''} raised.`}
                </p>
              </div>
              <div className="flex gap-2">
                <PermissionGate permission="create_mrf">
                  <button onClick={() => navigate('/mrf', { state: { projectId: project.id } })}
                    className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold active:opacity-90"
                    style={{ background: '#0F2A4A' }}>
                    Send to QS for MRF
                  </button>
                </PermissionGate>
                <button onClick={() => navigate('/mrf')}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                  View MRFs →
                </button>
              </div>
            </div>
          <Accordion
            defaultOpen="details"
            items={[
              {
                id: 'details',
                title: 'Project Details',
                children: (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Stage</span><StatusBadge status={project.stage} /></div>
                    <div className="flex justify-between"><span className="text-slate-500">Client Phone</span><span className="font-semibold text-slate-800">{project.clientPhone || '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Coordinator</span><span className="font-semibold text-slate-800">{project.coordinatorName}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Start Date</span><span className="font-semibold text-slate-800">{fmtDate(project.startDate)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Expected Handover</span><span className="font-semibold text-slate-800">{fmtDate(project.expectedHandoverDate)}</span></div>
                  </div>
                ),
              },
              {
                id: 'finance',
                title: 'Finance Summary',
                children: (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Contract Value</span><span className="font-semibold text-slate-800">{fmtCurrency(project.contractValue)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Internal Budget</span><span className="font-semibold text-slate-800">{fmtCurrency(project.internalBudget)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Advance Received</span><span className="font-semibold text-slate-800">{fmtCurrency(project.advanceReceived)}</span></div>
                  </div>
                ),
              },
            ]}
          />
          </>
        )}

        {tab === 'team' && (
          <div className="space-y-2.5">
            {teamMembers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No team members assigned yet.</p>
            ) : (
              teamMembers.map(member => (
                <div key={member.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{member.fullName}</p>
                    <p className="text-xs text-slate-500">{member.displayRole || member.role}</p>
                  </div>
                  {member.id === project.coordinatorId && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600">Coordinator</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="space-y-2.5">
            <PermissionGate permission="add_task">
              <button onClick={() => setShowNewTask(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-semibold active:bg-slate-50 flex items-center justify-center gap-1">
                <Plus size={14} /> Add Task
              </button>
            </PermissionGate>
            {visibleTopLevelTasks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">
                {topLevelTasks.length === 0 ? 'No tasks yet.' : 'No tasks assigned to you yet.'}
              </p>
            ) : (
              visibleTopLevelTasks.map(t => (
                <button key={t.id} onClick={() => navigate(`/projects/${project.id}/tasks/${t.id}`)}
                  className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.assigneeName && <p className="text-xs text-slate-500 mt-1">{t.assigneeName}</p>}
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'requirements' && (
          <div className="space-y-2.5">
            {projectRequirements.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No requirements linked to this project.</p>
            ) : (
              projectRequirements.map(req => (
                <div key={req.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">{req.lineItems.length} line item{req.lineItems.length !== 1 ? 's' : ''}</p>
                  {req.lineItems.map(item => (
                    <div key={item.id} className="flex justify-between text-xs py-1 border-t border-slate-50 first:border-t-0">
                      <span className="text-slate-700">{item.roomName || item.description}</span>
                      <span className="font-semibold text-slate-600">{item.quantity} {item.unit}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'boq' && (
          <div className="space-y-3">
            {!projectQuotation ? (
              <p className="text-sm text-slate-400 text-center py-10">No BOQ/quotation linked to this project.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <StatusBadge status={projectQuotation.status} />
                  <span className="text-sm font-bold text-slate-800">{fmtCurrency(projectQuotation.netAmount)}</span>
                </div>
                {projectQuotation.sections.map(section => (
                  <div key={section.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <p className="text-sm font-bold text-slate-800 mb-2">{section.title}</p>
                    {section.items.map(item => (
                      <div key={item.id} className="flex justify-between text-xs py-1 border-t border-slate-50 first:border-t-0">
                        <span className="text-slate-700">{item.description}</span>
                        <span className="font-semibold text-slate-600">{fmtCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'design' && (
          <div className="space-y-2.5">
            {projectDesignPackages.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No design packages for this project.</p>
            ) : (
              projectDesignPackages.map(pkg => {
                const versionCount = designVersions.filter(v => v.designPackageId === pkg.id).length
                return (
                  <div key={pkg.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-sm text-slate-800">{pkg.name}</span>
                      <StatusBadge status={pkg.status} />
                    </div>
                    <p className="text-xs text-slate-500">{versionCount} version{versionCount !== 1 ? 's' : ''}</p>
                  </div>
                )
              })
            )}
            <button onClick={() => navigate('/design')}
              className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold active:bg-slate-50">
              Open Design Center
            </button>
          </div>
        )}

        {tab === 'gantt' && (
          <GanttChart
            tasks={projectTasks}
            dependencies={projectDependencies}
            canEditDeadline={can('edit_deadline')}
            onTaskUpdated={updated => setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))}
          />
        )}

        {tab === 'diary' && (
          <div className="space-y-2.5">
            <PermissionGate permission="view_tasks">
              <button onClick={() => setShowNewDiary(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-semibold active:bg-slate-50 flex items-center justify-center gap-1">
                <Plus size={14} /> Add Diary Entry
              </button>
            </PermissionGate>
            {projectDiaryEntries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No diary entries yet.</p>
            ) : (
              projectDiaryEntries.map(entry => (
                <div key={entry.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-800">{fmtDate(entry.date)}</span>
                    <span className="text-xs text-slate-400">{entry.createdByName}</span>
                  </div>
                  <p className="text-xs text-slate-700">{entry.workDone}</p>
                  {entry.blockers && <p className="text-xs text-red-500 mt-1">Blocker: {entry.blockers}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'finance' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <p className="text-[11px] text-slate-400 mb-0.5">Contract Value</p>
                <p className="text-base font-extrabold text-slate-800">{fmtCurrency(contractValue)}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <p className="text-[11px] text-slate-400 mb-0.5">Internal Budget</p>
                <p className="text-base font-extrabold text-slate-800">{fmtCurrency(internalBudget)}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <p className="text-[11px] text-slate-400 mb-0.5">Actual Spend</p>
                <p className="text-base font-extrabold text-slate-800">{fmtCurrency(actualSpend)}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <p className="text-[11px] text-slate-400 mb-0.5">Collections</p>
                <p className="text-base font-extrabold text-slate-800">{fmtCurrency(totalCollected)}</p>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <p className="text-[11px] text-slate-400 mb-0.5">Margin</p>
                <p className={`text-base font-extrabold ${margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmtCurrency(margin)} <span className="text-xs font-semibold">({marginPct.toFixed(1)}%)</span>
                </p>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
                <p className="text-[11px] text-slate-400 mb-0.5">Budget Variance</p>
                <p className={`text-base font-extrabold ${budgetVariance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {fmtCurrency(budgetVariance)}
                </p>
              </div>
            </div>

            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Payment Milestones</h3>
            {projectMilestones.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No payment milestones for this project.</p>
            ) : (
              <div className="space-y-2">
                {projectMilestones.map(m => (
                  <div key={m.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-bold text-sm text-slate-800">{m.title}</span>
                      <StatusBadge status={m.status} />
                    </div>
                    <p className="text-sm font-semibold text-slate-700">{fmtCurrency(m.receivedAmount)} / {fmtCurrency(m.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'procurement' && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">Coming soon.</p>
          </div>
        )}

        {tab === 'documents' && (
          <div className="space-y-2.5">
            <PermissionGate permission="add_task">
              <button onClick={() => setShowNewDocument(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-semibold active:bg-slate-50 flex items-center justify-center gap-1">
                <Plus size={14} /> Add Document
              </button>
            </PermissionGate>
            {projectDocuments.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No documents yet.</p>
            ) : (
              projectDocuments.map(doc => (
                <button key={doc.id} onClick={() => setSelectedDocument(doc)}
                  className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
                  <span className="text-sm font-bold text-slate-800">{doc.name}</span>
                  <p className="text-xs text-slate-400 mt-1">{docVersionsFor(doc.id).length} version{docVersionsFor(doc.id).length !== 1 ? 's' : ''}</p>
                </button>
              ))
            )}
          </div>
        )}

        {tab === 'handover' && (
          <div className="space-y-2.5">
            {project.handoverSignedAt ? (
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                <p className="text-sm font-bold text-emerald-700">Handover complete</p>
                <p className="text-xs text-emerald-600 mt-0.5">Signed off by {project.handoverSignedBy} on {fmtDate(project.handoverSignedAt)}</p>
              </div>
            ) : (
              <PermissionGate permission="add_task">
                <button onClick={() => setShowHandoverConfirm(true)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold active:bg-indigo-700">
                  Mark Handover Complete
                </button>
              </PermissionGate>
            )}

            <PermissionGate permission="add_task">
              <button onClick={() => setShowNewPunchItem(true)}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs font-semibold active:bg-slate-50 flex items-center justify-center gap-1">
                <Plus size={14} /> Add Punch Item
              </button>
            </PermissionGate>

            {projectPunchItems.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-10">No punch list items yet.</p>
            ) : (
              projectPunchItems.map(item => (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-800">{item.description}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.location && <p className="text-xs text-slate-500">{item.location}</p>}
                  <p className="text-xs text-slate-400 mt-1">Raised by {item.raisedByName}</p>
                  {item.status !== 'verified' && (
                    <div className="flex gap-2 mt-2">
                      {item.status === 'open' && (
                        <button onClick={() => handleSetPunchItemStatus(item, 'resolved')}
                          className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold active:bg-slate-200">
                          Mark Resolved
                        </button>
                      )}
                      {item.status === 'resolved' && (
                        <button onClick={() => handleSetPunchItemStatus(item, 'verified')}
                          className="flex-1 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold active:bg-emerald-100">
                          Mark Verified
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <BottomSheet isOpen={showNewTask} onClose={() => { setShowNewTask(false); setNewTaskAssigneeId('') }} title="New Task">
        <div className="space-y-4 pb-4">
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
            value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title" autoFocus
          />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Assign To *</label>
            <select value={newTaskAssigneeId} onChange={e => setNewTaskAssigneeId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">— Select —</option>
              {users.filter(u => u.status === 'active').map(u => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
          <button onClick={handleAddTask} disabled={!newTaskTitle.trim() || !newTaskAssigneeId}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Add Task
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={showNewDiary} onClose={() => setShowNewDiary(false)} title="New Diary Entry" height="full">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Date *</label>
            <input type="date" value={diaryDate} onChange={e => setDiaryDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Work Done *</label>
            <textarea value={diaryWorkDone} onChange={e => setDiaryWorkDone(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Blockers</label>
            <textarea value={diaryBlockers} onChange={e => setDiaryBlockers(e.target.value)} rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <MultiFileUploadField label="Site Photos" files={diaryPhotos} onChange={setDiaryPhotos} accept="image/*" uploadButtonLabel="Upload Photo" />
          <button onClick={handleAddDiaryEntry} disabled={!diaryWorkDone.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Save Entry
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={!!selectedDocument && !showNewDocVersion} onClose={() => setSelectedDocument(null)} title={selectedDocument?.name ?? ''} height="full">
        {selectedDocument && (
          <div className="space-y-4">
            <PermissionGate permission="add_task">
              <button onClick={openDocVersionUpload}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 active:bg-slate-50">
                + Add Version
              </button>
            </PermissionGate>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Version History</p>
              <div className="space-y-2.5">
                {docVersionsFor(selectedDocument.id).map(v => (
                  <div key={v.id} className="bg-white border border-slate-100 rounded-2xl p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Version {v.versionNumber}</span>
                      <span className="text-[11px] text-slate-400">{fmtDate(v.createdAt)}</span>
                    </div>
                    {v.note && <p className="text-[11px] text-slate-500 mt-1">{v.note}</p>}
                    <p className="text-[11px] text-slate-400 mt-1 mb-1.5">by {v.createdBy}</p>
                    <MultiFileUploadField label="" files={v.files} onChange={() => {}} />
                  </div>
                ))}
                {docVersionsFor(selectedDocument.id).length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No versions uploaded yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </BottomSheet>

      <BottomSheet isOpen={showNewDocument} onClose={() => setShowNewDocument(false)} title="Add Document">
        <div className="space-y-4 pb-4">
          <input
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
            value={newDocName} onChange={e => setNewDocName(e.target.value)} placeholder="Document name" autoFocus
          />
          <button onClick={handleAddDocument} disabled={!newDocName.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Create Document
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={showNewDocVersion} onClose={() => setShowNewDocVersion(false)} title="Add Document Version" height="full">
        <div className="space-y-3">
          <MultiFileUploadField label="Files" files={docVersionFiles} onChange={setDocVersionFiles} required uploadButtonLabel="Upload Files" />
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Note</label>
            <textarea value={docVersionNote} onChange={e => setDocVersionNote(e.target.value)} rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <button onClick={handleAddDocVersion} disabled={docVersionFiles.length === 0}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Add Version
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={showNewPunchItem} onClose={() => setShowNewPunchItem(false)} title="Add Punch Item">
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Description *</label>
            <textarea value={punchDescription} onChange={e => setPunchDescription(e.target.value)} rows={3} autoFocus
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Location</label>
            <input value={punchLocation} onChange={e => setPunchLocation(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <MultiFileUploadField label="Photos" files={punchPhotos} onChange={setPunchPhotos} accept="image/*" uploadButtonLabel="Upload Photo" />
          <button onClick={handleAddPunchItem} disabled={!punchDescription.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-40">
            Add Item
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showHandoverConfirm}
        onClose={() => setShowHandoverConfirm(false)}
        title="Mark Handover Complete?"
        message={unresolvedPunchItems > 0
          ? `${unresolvedPunchItems} punch list item${unresolvedPunchItems > 1 ? 's are' : ' is'} still open.`
          : 'All punch list items are resolved.'}
        variant={unresolvedPunchItems > 0 ? 'danger' : 'default'}
        confirmLabel="Mark Complete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmHandover}
      />

      {project && (
        <ProjectStatusSheet
          isOpen={showStatusSheet}
          onClose={() => setShowStatusSheet(false)}
          project={project}
          onDone={async (msg) => {
            const projects = await getAllProjects()
            setProject(projects.find(p => p.id === id) ?? null)
            setSnack({ open: true, msg, type: 'success' })
          }}
        />
      )}

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
