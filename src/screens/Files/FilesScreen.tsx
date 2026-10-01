import { useEffect, useMemo, useState } from 'react'
import { Plus, FileText, Image as ImageIcon } from 'lucide-react'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { FilterChips } from '../../components/forms/FilterChips'
import { DateField } from '../../components/forms/DateField'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { FilePreviewModal } from '../../components/feedback/FilePreviewModal'
import { useAuth } from '../../context/AuthContext'
import { resolveFileUrl, isImageFileName } from '../../utils/sessionStore'
import { getAllProjects } from '../../services/projectService'
import { getAllLeads } from '../../services/leadService'
import { getAllDocuments, getAllDocumentVersions, upsertDocument, addDocumentVersion } from '../../services/documentService'
import { getAllSiteVisits } from '../../services/siteVisitService'
import { getAllRequirements } from '../../services/requirementService'
import { getAllQuotations } from '../../services/quotationService'
import { getAllMRFs } from '../../services/mrfService'
import { getAllDesignPackages, getAllDesignVersions } from '../../services/designService'
import { getAllDiaryEntries } from '../../services/dailyDiaryService'
import { getAllPunchListItems } from '../../services/punchListService'
import { getAllExpenseRequests } from '../../services/expenseService'
import { aggregateAllFiles, CATEGORY_LABELS, CATEGORY_COLORS } from './fileAggregators'
import type { AggregatedFile, FileCategory } from './fileAggregators'
import type {
  Project, Lead, ProjectDocument, ProjectDocumentVersion, SiteVisit, Requirement, Quotation,
  MaterialRequestForm, DesignPackage, DesignVersion, DailyDiaryEntry, PunchListItem, ExpenseRequest,
} from '../../types'

type CategoryFilter = 'all' | FileCategory
type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'

const CATEGORY_CHIPS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...(Object.keys(CATEGORY_LABELS) as FileCategory[]).map(c => ({ value: c as CategoryFilter, label: CATEGORY_LABELS[c] })),
]

const DATE_CHIPS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
]

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function subtitleFor(f: AggregatedFile): string {
  const scope = f.projectName ?? f.clientName ?? (f.category === 'expenses' ? 'Company' : 'Unassigned')
  return `${f.recordLabel} · ${scope}`
}

function inDateRange(d: Date | null, filter: DateFilter, from: string, to: string): boolean {
  if (filter === 'all') return true
  if (!d) return false
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (filter === 'today') return d >= startOfToday
  if (filter === 'yesterday') {
    const startYesterday = new Date(startOfToday)
    startYesterday.setDate(startYesterday.getDate() - 1)
    return d >= startYesterday && d < startOfToday
  }
  if (filter === 'week') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 7)
    return d >= start
  }
  if (filter === 'month') {
    const start = new Date(startOfToday)
    start.setDate(start.getDate() - 30)
    return d >= start
  }
  // custom
  if (from && d < new Date(from)) return false
  if (to) {
    const toDate = new Date(to)
    toDate.setHours(23, 59, 59, 999)
    if (d > toDate) return false
  }
  return true
}

export default function FilesScreen() {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(true)

  const [projects, setProjects] = useState<Project[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [documentVersions, setDocumentVersions] = useState<ProjectDocumentVersion[]>([])
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([])
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [mrfs, setMrfs] = useState<MaterialRequestForm[]>([])
  const [designPackages, setDesignPackages] = useState<DesignPackage[]>([])
  const [designVersions, setDesignVersions] = useState<DesignVersion[]>([])
  const [diaryEntries, setDiaryEntries] = useState<DailyDiaryEntry[]>([])
  const [punchListItems, setPunchListItems] = useState<PunchListItem[]>([])
  const [expenseRequests, setExpenseRequests] = useState<ExpenseRequest[]>([])

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [preview, setPreview] = useState<AggregatedFile | null>(null)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploadFiles, setUploadFiles] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [
        allProjects, allLeads, docs, docVersions, visits, reqs, quotes,
        allMrfs, pkgs, versions, diary, punchItems, expenses,
      ] = await Promise.all([
        getAllProjects(), getAllLeads(),
        getAllDocuments(), getAllDocumentVersions(),
        getAllSiteVisits(), getAllRequirements(), getAllQuotations(),
        getAllMRFs(),
        getAllDesignPackages(), getAllDesignVersions(),
        getAllDiaryEntries(), getAllPunchListItems(), getAllExpenseRequests(),
      ])
      setProjects(allProjects)
      setLeads(allLeads)
      setDocuments(docs)
      setDocumentVersions(docVersions)
      setSiteVisits(visits)
      setRequirements(reqs)
      setQuotations(quotes)
      setMrfs(allMrfs)
      setDesignPackages(pkgs)
      setDesignVersions(versions)
      setDiaryEntries(diary)
      setPunchListItems(punchItems)
      setExpenseRequests(expenses)
      setIsLoading(false)
    }
    load()
  }, [])

  const allFiles = useMemo(() => aggregateAllFiles({
    projects, leads, documents, documentVersions, siteVisits, requirements, quotations,
    mrfs, designPackages, designVersions, diaryEntries, punchListItems, expenseRequests,
  }), [projects, leads, documents, documentVersions, siteVisits, requirements, quotations, mrfs, designPackages, designVersions, diaryEntries, punchListItems, expenseRequests])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allFiles.filter(f => {
      if (category !== 'all' && f.category !== category) return false
      if (!inDateRange(f.date, dateFilter, customFrom, customTo)) return false
      if (q) {
        const haystack = `${f.displayName} ${f.recordLabel} ${f.projectName ?? ''} ${f.clientName ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allFiles, category, dateFilter, customFrom, customTo, search])

  async function handleUpload() {
    if (!user || !uploadName.trim() || uploadFiles.length === 0) return
    setUploading(true)
    const now = new Date().toISOString()
    const doc: ProjectDocument = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: uploadProjectId || undefined,
      name: uploadName.trim(),
      createdBy: user.name,
      createdAt: now,
      updatedAt: now,
    }
    const docResult = await upsertDocument(doc)
    if (!docResult.ok) {
      setUploading(false)
      setSnack({ open: true, msg: docResult.error ?? 'Failed to create file record.', type: 'error' })
      return
    }
    const version: ProjectDocumentVersion = {
      id: `docver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      documentId: doc.id,
      versionNumber: 1,
      files: uploadFiles,
      createdBy: user.name,
      createdAt: now,
    }
    const versionResult = await addDocumentVersion(version)
    setUploading(false)
    if (!versionResult.ok) {
      setSnack({ open: true, msg: versionResult.error ?? 'Failed to save files.', type: 'error' })
      return
    }
    setDocuments(prev => [doc, ...prev])
    setDocumentVersions(prev => [version, ...prev])
    setShowUpload(false)
    setUploadName('')
    setUploadProjectId('')
    setUploadFiles([])
    setSnack({ open: true, msg: 'File uploaded.', type: 'success' })
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-5 pt-4 pb-3 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-slate-800">Files</h1>
            <p className="text-xs text-slate-400">{filtered.length} file{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setShowUpload(true)}
            className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center active:bg-indigo-700 shadow-sm flex-shrink-0">
            <Plus size={18} />
          </button>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search files, projects, clients…" />
        <FilterChips chips={CATEGORY_CHIPS} active={category} onChange={setCategory} />
        <FilterChips chips={DATE_CHIPS} active={dateFilter} onChange={setDateFilter} />
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="flex-1"><DateField value={customFrom} onChange={setCustomFrom} placeholder="From" max={customTo || undefined} /></div>
            <div className="flex-1"><DateField value={customTo} onChange={setCustomTo} placeholder="To" min={customFrom || undefined} /></div>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(f => (
          <button key={f.key} onClick={() => setPreview(f)}
            className="w-full text-left bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 active:bg-slate-50 flex items-center gap-3">
            {isImageFileName(f.url) && resolveFileUrl(f.url) ? (
              <img src={resolveFileUrl(f.url)} alt={f.displayName} className="w-11 h-11 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 border border-slate-100">
                {isImageFileName(f.url) ? <ImageIcon size={17} className="text-slate-400" /> : <FileText size={17} className="text-slate-400" />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{f.displayName}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{subtitleFor(f)}</p>
              <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${CATEGORY_COLORS[f.category]}`}>
                {CATEGORY_LABELS[f.category]}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtDate(f.date)}</span>
          </button>
        ))}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📁</p>
            <p className="text-sm">No files found</p>
          </div>
        )}
      </div>

      {preview && (
        <FilePreviewModal src={resolveFileUrl(preview.url) ?? preview.url} name={preview.displayName} onClose={() => setPreview(null)} />
      )}

      <BottomSheet isOpen={showUpload} onClose={() => setShowUpload(false)} title="Upload File" height="full">
        <div className="space-y-4 pb-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Name</label>
            <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="File name"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400" autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Project (optional)</label>
            <SearchableSelect value={uploadProjectId} onChange={setUploadProjectId}
              options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="Unassigned" searchPlaceholder="Search projects…" />
          </div>
          <MultiFileUploadField label="Files" files={uploadFiles} onChange={setUploadFiles} required uploadButtonLabel="Upload Files" />
          <button onClick={handleUpload} disabled={uploading || !uploadName.trim() || uploadFiles.length === 0}
            className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-40"
            style={{ background: '#0F2A4A' }}>
            {uploading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </BottomSheet>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
