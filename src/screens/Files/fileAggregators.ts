import { getDisplayFileName, getFileTypeLabel, getUploadedAt } from '../../utils/fileStorage'
import { migrateMrfVendors } from '../MRF/MRFPanel'
import type {
  Project, Lead, ProjectDocument, ProjectDocumentVersion, SiteVisit, Requirement, Quotation,
  MaterialRequestForm, DesignPackage, DesignVersion, DailyDiaryEntry, PunchListItem, ExpenseRequest,
} from '../../types'

export type FileCategory =
  | 'site_photos' | 'measurement' | 'quotation' | 'project_documents'
  | 'mrf' | 'design' | 'daily_diary' | 'punch_list' | 'expenses'

export interface AggregatedFile {
  key: string
  url: string
  displayName: string
  typeLabel: string
  category: FileCategory
  recordLabel: string
  projectName?: string
  clientName?: string
  date: Date | null
}

export const CATEGORY_LABELS: Record<FileCategory, string> = {
  site_photos:       'Site Photos',
  measurement:        'Measurement',
  quotation:           'Quotation',
  project_documents:   'Project Documents',
  mrf:                 'MRF',
  design:              'Design',
  daily_diary:         'Daily Diary',
  punch_list:          'Punch List',
  expenses:            'Expenses',
}

export const CATEGORY_COLORS: Record<FileCategory, string> = {
  site_photos:       'bg-violet-100 text-violet-700',
  measurement:        'bg-teal-100 text-teal-700',
  quotation:           'bg-amber-100 text-amber-700',
  project_documents:   'bg-indigo-100 text-indigo-700',
  mrf:                 'bg-blue-100 text-blue-700',
  design:              'bg-purple-100 text-purple-700',
  daily_diary:         'bg-sky-100 text-sky-700',
  punch_list:          'bg-red-100 text-red-700',
  expenses:            'bg-emerald-100 text-emerald-700',
}

export interface FileAggregationInput {
  projects: Project[]
  leads: Lead[]
  documents: ProjectDocument[]
  documentVersions: ProjectDocumentVersion[]
  siteVisits: SiteVisit[]
  requirements: Requirement[]
  quotations: Quotation[]
  mrfs: MaterialRequestForm[]
  designPackages: DesignPackage[]
  designVersions: DesignVersion[]
  diaryEntries: DailyDiaryEntry[]
  punchListItems: PunchListItem[]
  expenseRequests: ExpenseRequest[]
}

interface Lookups {
  projectsById: Map<string, Project>
  leadsById: Map<string, Lead>
  siteVisitsById: Map<string, SiteVisit>
  quotationsById: Map<string, Quotation>
}

// Prefers the denormalized Project.clientName (Project.clientId is optional/
// not always reliable) — falls back to the Lead when there's no Project yet.
function resolveProjectClient(projectId: string | undefined, leadId: string | undefined, lookups: Lookups): { projectName?: string; clientName?: string } {
  const project = projectId ? lookups.projectsById.get(projectId) : undefined
  if (project) return { projectName: project.name, clientName: project.clientName }
  const lead = leadId ? lookups.leadsById.get(leadId) : undefined
  if (lead) return { clientName: lead.name }
  return {}
}

// getUploadedAt() only works for files uploaded after the timestamp-prefix
// convention existed — older files fall back to their parent record's own
// createdAt so the date column is never blank/garbage, just less precise.
function resolveDate(url: string, fallbackIso?: string): Date | null {
  const fromName = getUploadedAt(url)
  if (fromName) return fromName
  if (!fallbackIso) return null
  const d = new Date(fallbackIso)
  return isNaN(d.getTime()) ? null : d
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function aggregateSitePhotos(siteVisits: SiteVisit[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const visit of siteVisits) {
    const { projectName, clientName } = resolveProjectClient(visit.projectId, visit.leadId, lookups)
    for (const room of visit.rooms) {
      ;(room.photos ?? []).forEach((url, i) => {
        out.push({
          key: `site_photos:${room.id}:${i}`, url,
          displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
          category: 'site_photos', recordLabel: room.name || 'Site Visit',
          projectName, clientName, date: resolveDate(url, visit.createdAt),
        })
      })
    }
  }
  return out
}

function aggregateMeasurement(requirements: Requirement[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const req of requirements) {
    const visit = lookups.siteVisitsById.get(req.siteVisitId)
    const projectId = req.projectId ?? visit?.projectId
    const { projectName, clientName } = resolveProjectClient(projectId, visit?.leadId, lookups)
    const recordLabel = req.lineItems[0]?.roomName ? `Requirement — ${req.lineItems[0].roomName}` : 'Requirement'
    ;(req.files ?? []).forEach((url, i) => {
      out.push({
        key: `measurement:${req.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'measurement', recordLabel, projectName, clientName,
        date: resolveDate(url, req.createdAt),
      })
    })
  }
  return out
}

function aggregateQuotation(quotations: Quotation[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const q of quotations) {
    const { projectName, clientName } = resolveProjectClient(q.projectId, q.leadId, lookups)
    ;(q.documentFiles ?? []).forEach((url, i) => {
      out.push({
        key: `quotation:${q.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'quotation', recordLabel: `Quotation v${q.version}`,
        projectName, clientName, date: resolveDate(url, q.createdAt),
      })
    })
  }
  return out
}

function aggregateProjectDocuments(documents: ProjectDocument[], versions: ProjectDocumentVersion[], lookups: Lookups): AggregatedFile[] {
  const docsById = new Map(documents.map(d => [d.id, d]))
  const out: AggregatedFile[] = []
  for (const v of versions) {
    const doc = docsById.get(v.documentId)
    const { projectName, clientName } = resolveProjectClient(doc?.projectId, undefined, lookups)
    v.files.forEach((url, i) => {
      out.push({
        key: `project_documents:${v.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'project_documents', recordLabel: `${doc?.name ?? 'Document'} (v${v.versionNumber})`,
        projectName, clientName, date: resolveDate(url, v.createdAt),
      })
    })
  }
  return out
}

function aggregateMrf(mrfs: MaterialRequestForm[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const mrf of mrfs) {
    const { projectName, clientName } = resolveProjectClient(mrf.projectId, undefined, lookups)
    for (const vendor of migrateMrfVendors(mrf)) {
      vendor.files.forEach((url, i) => {
        out.push({
          key: `mrf:${mrf.id}:${vendor.id}:${i}`, url,
          displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
          category: 'mrf', recordLabel: `Vendor: ${vendor.name}`,
          projectName, clientName, date: resolveDate(url, mrf.createdAt),
        })
      })
    }
  }
  return out
}

function aggregateDesign(packages: DesignPackage[], versions: DesignVersion[], lookups: Lookups): AggregatedFile[] {
  const packagesById = new Map(packages.map(p => [p.id, p]))
  const out: AggregatedFile[] = []
  for (const v of versions) {
    const pkg = packagesById.get(v.designPackageId)
    let projectId = pkg?.projectId
    let leadId = pkg?.leadId
    if (!projectId && !leadId && pkg?.quotationId) {
      const q = lookups.quotationsById.get(pkg.quotationId)
      projectId = q?.projectId
      leadId = q?.leadId
    }
    const { projectName, clientName } = resolveProjectClient(projectId, leadId, lookups)
    v.files.forEach((url, i) => {
      out.push({
        key: `design:${v.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'design', recordLabel: `${pkg?.name ?? 'Design'} (v${v.versionNumber})`,
        projectName, clientName, date: resolveDate(url, v.createdAt),
      })
    })
  }
  return out
}

function aggregateDailyDiary(entries: DailyDiaryEntry[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const e of entries) {
    const { projectName, clientName } = resolveProjectClient(e.projectId, undefined, lookups)
    e.photos.forEach((url, i) => {
      out.push({
        key: `daily_diary:${e.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'daily_diary', recordLabel: `Diary — ${fmtShortDate(e.date)}`,
        projectName, clientName, date: resolveDate(url, e.createdAt),
      })
    })
  }
  return out
}

function aggregatePunchList(items: PunchListItem[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const item of items) {
    const { projectName, clientName } = resolveProjectClient(item.projectId, undefined, lookups)
    const recordLabel = item.description.length > 40 ? item.description.slice(0, 40) + '…' : item.description
    ;(item.photos ?? []).forEach((url, i) => {
      out.push({
        key: `punch_list:${item.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'punch_list', recordLabel, projectName, clientName,
        date: resolveDate(url, item.createdAt),
      })
    })
  }
  return out
}

function aggregateExpenses(requests: ExpenseRequest[], lookups: Lookups): AggregatedFile[] {
  const out: AggregatedFile[] = []
  for (const req of requests) {
    const { projectName, clientName } = resolveProjectClient(req.projectId, undefined, lookups)
    ;(req.receiptFiles ?? []).forEach((url, i) => {
      out.push({
        key: `expenses:receipt:${req.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'expenses', recordLabel: `Receipt — ${req.purpose}`,
        projectName, clientName, date: resolveDate(url, req.createdAt),
      })
    })
    ;(req.paymentProofFiles ?? []).forEach((url, i) => {
      out.push({
        key: `expenses:proof:${req.id}:${i}`, url,
        displayName: getDisplayFileName(url), typeLabel: getFileTypeLabel(url),
        category: 'expenses', recordLabel: `Payment Proof — ${req.purpose}`,
        projectName, clientName, date: resolveDate(url, req.paidAt ?? req.createdAt),
      })
    })
  }
  return out
}

// Deliberately out of scope (see plan): StatusHistoryItem.files (per-transition
// files embedded in Project.statusHistory / MRF.history — awkward nested shape,
// low value), VendorBill.documentFiles (Procurement, 3-hop join), and
// AttendanceRecord.startCapture/endCapture photoUrl (HR, no project/client
// relationship, single string not an array).

export function aggregateAllFiles(input: FileAggregationInput): AggregatedFile[] {
  const lookups: Lookups = {
    projectsById: new Map(input.projects.map(p => [p.id, p])),
    leadsById: new Map(input.leads.map(l => [l.id, l])),
    siteVisitsById: new Map(input.siteVisits.map(v => [v.id, v])),
    quotationsById: new Map(input.quotations.map(q => [q.id, q])),
  }
  const all = [
    ...aggregateSitePhotos(input.siteVisits, lookups),
    ...aggregateMeasurement(input.requirements, lookups),
    ...aggregateQuotation(input.quotations, lookups),
    ...aggregateProjectDocuments(input.documents, input.documentVersions, lookups),
    ...aggregateMrf(input.mrfs, lookups),
    ...aggregateDesign(input.designPackages, input.designVersions, lookups),
    ...aggregateDailyDiary(input.diaryEntries, lookups),
    ...aggregatePunchList(input.punchListItems, lookups),
    ...aggregateExpenses(input.expenseRequests, lookups),
  ]
  all.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
  return all
}
