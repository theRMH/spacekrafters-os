import { useRef, useState } from 'react'
import { Upload, FileDown, CheckCircle2, AlertTriangle, Copy } from 'lucide-react'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { parseLeadCsv, sampleLeadCsvText, downloadCsv, type ParsedLeadRow } from '../../utils/leadCsv'
import type { Lead, ManagedUser } from '../../types'
import type { useCRM } from '../../context/CRMContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  existingLeads: Lead[]
  assignableMembers: ManagedUser[]
  addLead: ReturnType<typeof useCRM>['addLead']
  onDone: (msg: string) => void
}

type RowStatus = 'valid' | 'duplicate' | 'error'

interface PreviewRow extends ParsedLeadRow {
  status: RowStatus
}

function normalizePhone(p: string): string {
  return p.replace(/\D/g, '')
}

export function ImportLeadsSheet({ isOpen, onClose, existingLeads, assignableMembers, addLead, onDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number; duplicates: number; errors: number } | null>(null)

  function reset() {
    setFileName(''); setRows(null); setImporting(false); setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseLeadCsv(String(reader.result ?? ''))
      const existingPhones = new Set(existingLeads.map(l => normalizePhone(l.phone)))
      const seenInFile = new Set<string>()
      const preview: PreviewRow[] = parsed.map(row => {
        if (row.errors.length > 0) return { ...row, status: 'error' }
        const phoneKey = normalizePhone(row.phone)
        if (existingPhones.has(phoneKey) || seenInFile.has(phoneKey)) return { ...row, status: 'duplicate' }
        seenInFile.add(phoneKey)
        return { ...row, status: 'valid' }
      })
      setRows(preview)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!rows) return
    setImporting(true)
    let imported = 0
    for (const row of rows) {
      if (row.status !== 'valid' || !row.input) continue
      const member = assignableMembers.find(m => m.fullName.trim().toLowerCase() === row.input!.ownerNameRaw.trim().toLowerCase())
      const now = new Date()
      const result = await addLead({
        name: row.input.name, leadCodePrefix: row.input.leadCodePrefix,
        siteNo: row.input.siteNo, phone: row.input.phone, email: row.input.email, city: row.input.city,
        businessDivision: row.input.businessDivision, businessCategory: row.input.businessCategory, businessBrand: row.input.businessBrand,
        requirement: row.input.requirement, notes: row.input.notes,
        source: row.input.source, subSource: row.input.subSource,
        interest: row.input.interest, status: 'new',
        ownerId: member?.id, ownerName: member?.fullName ?? row.input.ownerNameRaw.trim(),
        slaDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      })
      if (result.ok) imported++
    }
    const duplicates = rows.filter(r => r.status === 'duplicate').length
    const errors = rows.filter(r => r.status === 'error').length
    setImporting(false)
    setResult({ imported, duplicates, errors })
    onDone(`${imported} lead${imported === 1 ? '' : 's'} imported.`)
  }

  const validCount = rows?.filter(r => r.status === 'valid').length ?? 0
  const duplicateCount = rows?.filter(r => r.status === 'duplicate').length ?? 0
  const errorCount = rows?.filter(r => r.status === 'error').length ?? 0

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="Import Leads" height="full">
      <div className="space-y-4 pb-4">
        {result ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
            <p className="text-base font-bold text-slate-800">{result.imported} lead{result.imported === 1 ? '' : 's'} imported</p>
            <p className="text-xs text-slate-500">
              {result.duplicates} duplicate{result.duplicates === 1 ? '' : 's'} skipped · {result.errors} row{result.errors === 1 ? '' : 's'} with errors skipped
            </p>
            <button onClick={handleClose} className="mt-3 w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90" style={{ background: '#0F2A4A' }}>
              Done
            </button>
          </div>
        ) : !rows ? (
          <>
            <label className="block border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-2xl py-10 text-center cursor-pointer active:bg-indigo-100">
              <Upload size={22} className="text-indigo-500 mx-auto mb-2" />
              <span className="text-sm font-bold text-indigo-600">{fileName || 'Tap to upload CSV file'}</span>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </label>
            <button onClick={() => downloadCsv('SpaceKrafters_Leads_Sample.csv', sampleLeadCsvText())}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50">
              <FileDown size={15} /> Download Sample File
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">{validCount} ready</span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">{duplicateCount} duplicate</span>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 text-red-700">{errorCount} error</span>
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {rows.map(row => (
                <div key={row.rowNumber} className="bg-white rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{row.name || `Row ${row.rowNumber}`}</p>
                      {row.phone && <p className="text-xs text-slate-500">{row.phone}</p>}
                    </div>
                    {row.status === 'valid' && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Ready</span>}
                    {row.status === 'duplicate' && <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"><Copy size={10} /> Duplicate</span>}
                    {row.status === 'error' && <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700"><AlertTriangle size={10} /> Error</span>}
                  </div>
                  {row.errors.length > 0 && <p className="text-[11px] text-red-600 mt-1">{row.errors.join(' · ')}</p>}
                  {row.status === 'duplicate' && <p className="text-[11px] text-amber-600 mt-1">Phone number already exists in Leads.</p>}
                </div>
              ))}
            </div>
            <button disabled={validCount === 0 || importing} onClick={handleImport}
              className="w-full py-3 rounded-xl text-sm font-bold text-white active:opacity-90 disabled:opacity-50" style={{ background: '#0F2A4A' }}>
              {importing ? 'Importing…' : `Import ${validCount} Lead${validCount === 1 ? '' : 's'}`}
            </button>
            <button onClick={reset} className="w-full py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 active:bg-slate-50">
              Choose a different file
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
