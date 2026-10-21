import { useState } from 'react'
import { Download, Eye, FileText, Trash2 } from 'lucide-react'
import { upsertQuotation } from '../../services/quotationService'
import { deleteRemoteFile, getDisplayFileName, getFileUrl, isRemoteFileRef } from '../../utils/fileStorage'
import { downloadQuotationPdf, generateAndUploadQuotationPdf, generateQuotationPdf, PDF_LAYOUT_VERSION } from '../../utils/quotationPdf'
import type { Quotation } from '../../types'

// The quotation's generated PDF: View, Download and Remove (Generate again once removed).
// Shared by the Quotations detail sheet and the Lead page's quotation card.
export function QuotationPdfActions({ quotation, clientName, canEdit, onChanged }: {
  quotation: Quotation
  clientName: string
  canEdit: boolean
  onChanged: (updated: Quotation) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = quotation.documentFiles?.[0]

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    setBusy(false)
  }

  // Builds a fresh PDF from the quotation's data, stores it and saves the reference on the quotation.
  async function regenerate(): Promise<Quotation> {
    const stored = await generateAndUploadQuotationPdf(quotation, quotation.template ?? {}, clientName)
    const updated: Quotation = { ...quotation, documentFiles: [stored], pdfLayout: PDF_LAYOUT_VERSION, updatedAt: new Date().toISOString() }
    const result = await upsertQuotation(updated)
    if (!result.ok) throw new Error(result.error ?? 'Could not save the PDF.')
    if (ref && isRemoteFileRef(ref)) deleteRemoteFile(ref).catch(() => {})
    onChanged(updated)
    return updated
  }

  // The window is opened straight away (inside the click) so the browser doesn't block it while a PDF is being built.
  // A stored PDF built with an older layout is rebuilt first, so View always shows the current design.
  const view = () => run(async () => {
    const win = window.open('', '_blank')
    try {
      let current = quotation
      if ((quotation.pdfLayout ?? 1) < PDF_LAYOUT_VERSION) current = await regenerate()
      const link = current.documentFiles?.[0] ? getFileUrl(current.documentFiles[0]) : undefined
      const target = link ?? URL.createObjectURL(await generateQuotationPdf(current, current.template ?? {}, clientName))
      if (win) win.location.href = target
      else window.open(target, '_blank')
    } catch (err) {
      win?.close()
      throw err
    }
  })

  const download = () => run(() => downloadQuotationPdf(quotation, quotation.template ?? {}, clientName))

  const remove = () => run(async () => {
    if (!ref) return
    const updated: Quotation = { ...quotation, documentFiles: undefined, pdfLayout: undefined, updatedAt: new Date().toISOString() }
    const result = await upsertQuotation(updated)
    if (!result.ok) throw new Error(result.error ?? 'Could not remove the PDF.')
    if (isRemoteFileRef(ref)) deleteRemoteFile(ref).catch(() => {})
    onChanged(updated)
  })

  const generate = () => run(async () => { await regenerate() })

  const btn = 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold disabled:opacity-50'

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <FileText size={16} className="text-slate-400 shrink-0" />
        <p className="text-xs font-bold text-slate-700 truncate">{ref ? getDisplayFileName(ref) : 'Quotation PDF'}</p>
      </div>
      {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
      {ref ? (
        <div className="flex gap-2">
          <button disabled={busy} onClick={view} className={`${btn} border-slate-200 bg-white text-slate-700`}>
            <Eye size={14} /> {busy ? 'Please wait…' : 'View'}
          </button>
          <button disabled={busy} onClick={download} className={`${btn} border-slate-200 bg-white text-slate-700`}>
            <Download size={14} /> Download
          </button>
          {canEdit && (
            <button disabled={busy} onClick={remove} className={`${btn} border-red-200 bg-white text-red-600`}>
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">No PDF yet.</p>
          <button disabled={busy} onClick={generate} className={`${btn} w-full border-slate-200 bg-white text-slate-700`}>
            {busy ? 'Generating…' : 'Generate PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
