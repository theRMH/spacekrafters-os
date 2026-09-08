import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { AppHeader } from '../../components/layout/AppHeader'
import { Accordion } from '../../components/layout/Accordion'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { getAllProjects } from '../../services/projectService'
import { getManagedUsersDirectory } from '../../services/userService'
import { getAllRequirements } from '../../services/requirementService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllDesignPackages, getAllDesignVersions } from '../../services/designService'
import { getAllTasks } from '../../services/taskService'
import type { Project, ManagedUser, Requirement, Quotation, DesignPackage, DesignVersion, Task } from '../../types'

type Tab = 'overview' | 'gantt' | 'team' | 'requirements' | 'boq' | 'design' | 'finance' | 'procurement' | 'documents' | 'handover'

const TABS: { value: Tab; label: string; placeholder?: boolean }[] = [
  { value: 'overview',     label: 'Overview' },
  { value: 'gantt',        label: 'Gantt', placeholder: true },
  { value: 'team',         label: 'Team' },
  { value: 'requirements', label: 'Requirements' },
  { value: 'boq',          label: 'BOQ' },
  { value: 'design',       label: 'Design' },
  { value: 'finance',      label: 'Finance', placeholder: true },
  { value: 'procurement',  label: 'Procurement', placeholder: true },
  { value: 'documents',    label: 'Documents', placeholder: true },
  { value: 'handover',     label: 'Handover', placeholder: true },
]

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

export default function ProjectWorkspaceScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [designPackages, setDesignPackages] = useState<DesignPackage[]>([])
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([])
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [projects, dirUsers, reqs, quotes, pkgs, versions, allTasks] = await Promise.all([
        getAllProjects(),
        getManagedUsersDirectory(),
        getAllRequirements(),
        getAllQuotations(),
        getAllDesignPackages(),
        getAllDesignVersions(),
        getAllTasks(),
      ])
      setProject(projects.find(p => p.id === id) ?? null)
      setUsers(dirUsers)
      setRequirements(reqs)
      setQuotations(quotes)
      setDesignPackages(pkgs)
      setDesignVersions(versions)
      setTasks(allTasks)
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

  const projectRequirements = requirements.filter(r => r.projectId === project.id)
  const projectQuotation = quotations.find(q => q.projectId === project.id)
  const projectDesignPackages = designPackages.filter(p => p.projectId === project.id)
  const projectTasks = tasks.filter(t => t.projectId === project.id)
  const assigneeIds = Array.from(new Set(projectTasks.map(t => t.assigneeId).filter(Boolean))) as string[]
  const teamMembers = users.filter(u => u.id === project.coordinatorId || assigneeIds.includes(u.id))

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-24">
      <AppHeader />

      <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-200 sticky top-14 z-20">
        <button onClick={() => navigate('/projects')}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-2 active:text-slate-700">
          <ChevronLeft size={14} /> Projects
        </button>
        <div className="flex items-start justify-between gap-2 mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">{project.name}</h1>
          <StatusBadge status={project.status} />
        </div>
        <p className="text-xs text-slate-500 mb-3">{project.clientName}</p>

        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {TABS.map(t => (
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

        {(tab === 'gantt' || tab === 'finance' || tab === 'procurement' || tab === 'documents' || tab === 'handover') && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-sm">Coming soon.</p>
          </div>
        )}
      </div>
    </div>
  )
}
