import { useState } from 'react'
import { Download, Eye, FileText, Trash2 } from 'lucide-react'
import { upsertQuotation } from '../../services/quotationService'
import { deleteRemoteFile, getDisplayFileName, getFileUrl, isRemoteFileRef } from '../../utils/fileStorage'
import { downloadQuotationPdf, generateAndUploadQuotationPdf, generateQuotationPdf } from '../../utils/quotationPdf'
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
  const url = ref ? getFileUrl(ref) : undefined

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError('')
    try { await fn() } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    setBusy(false)
  }

  // Opens the stored PDF; if it only exists as a local/session reference, rebuilds it from the quotation.
  const view = () => run(async () => {
    if (url) { window.open(url, '_blank', 'noopener'); return }
    const blob = await generateQuotationPdf(quotation, quotation.template ?? {}, clientName)
    window.open(URL.createObjectURL(blob), '_blank')
  })

  const download = () => run(() => downloadQuotationPdf(quotation, quotation.template ?? {}, clientName))

  const remove = () => run(async () => {
    if (!ref) return
    const updated: Quotation = { ...quotation, documentFiles: undefined, updatedAt: new Date().toISOString() }
    const result = await upsertQuotation(updated)
    if (!result.ok) throw new Error(result.error ?? 'Could not remove the PDF.')
    if (isRemoteFileRef(ref)) deleteRemoteFile(ref).catch(() => {})
    onChanged(updated)
  })

  const generate = () => run(async () => {
    const stored = await generateAndUploadQuotationPdf(quotation, quotation.template ?? {}, clientName)
    const updated: Quotation = { ...quotation, documentFiles: [stored], updatedAt: new Date().toISOString() }
    const result = await upsertQuotation(updated)
    if (!result.ok) throw new Error(result.error ?? 'Could not save the PDF.')
    onChanged(updated)
  })

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
            <Eye size={14} /> View
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
