import { Plus, Trash2 } from 'lucide-react'
import type { QuotationTemplateData } from '../../types'

interface Props {
  value: QuotationTemplateData
  onChange: (next: QuotationTemplateData) => void
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-indigo-400'
const lbl = 'text-sm font-semibold text-slate-500 mb-1 block'

// The note boxes behind the quotation PDF (QuotationPrintTemplate.tsx): whatever is
// typed here is placed into the matching block of the template.
export function QuotationTemplateFields({ value, onChange }: Props) {
  const set = (patch: Partial<QuotationTemplateData>) => onChange({ ...value, ...patch })
  const stages = value.paymentStages ?? []

  const text = (key: keyof QuotationTemplateData, label: string, placeholder?: string) => (
    <div>
      <label className={lbl}>{label}</label>
      <input className={inp} value={(value[key] as string | undefined) ?? ''} placeholder={placeholder}
        onChange={e => set({ [key]: e.target.value } as Partial<QuotationTemplateData>)} />
    </div>
  )
  const area = (key: keyof QuotationTemplateData, label: string, rows: number, hint?: string) => (
    <div>
      <label className={lbl}>{label}{hint && <span className="font-normal text-slate-400"> — {hint}</span>}</label>
      <textarea className={`${inp} resize-y`} rows={rows} value={(value[key] as string | undefined) ?? ''}
        onChange={e => set({ [key]: e.target.value } as Partial<QuotationTemplateData>)} />
    </div>
  )

  function setStage(i: number, patch: Partial<{ stage: string; percent: string }>) {
    set({ paymentStages: stages.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }

  return (
    <div className="space-y-4 border-t border-slate-200 pt-4">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quotation PDF — template details</p>

      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">Header</p>
        {text('workTitle', 'Work type (under "QUOTATION")', 'Interior Fit-Out Works')}
        <div className="grid grid-cols-2 gap-3">
          {text('kindAttn', 'Kind Attn.')}
          {text('siteName', 'Site')}
          {text('projectType', 'Project Type')}
          {text('projectMd', 'Project MD')}
          {text('projectLead', 'Project Lead')}
          {text('projectQs', 'Project QS')}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">Below the totals</p>
        {area('paymentNotes', 'Payment Notes', 2)}
        {area('closingNote', 'Note', 3)}
        <div className="grid grid-cols-2 gap-3">
          {text('signName', 'Signed by (Thanks and Regards)')}
          {text('signDesignation', 'Designation')}
          {text('signPhone', 'Phone')}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">Terms &amp; Conditions page</p>
        {area('commercialTerms', '1. Commercial Terms', 4, 'one point per line')}
        {area('clientScope', "2. Client's Scope of Work (Site Provisions)", 5, 'one point per line')}
        {area('scopeVariations', '3. Scope, Design & Variations', 4, 'one point per line')}

        <div>
          <label className={lbl}>4. Payment Terms</label>
          <div className="space-y-2">
            {stages.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className={`${inp} flex-1`} value={s.stage} placeholder="Stage" onChange={e => setStage(i, { stage: e.target.value })} />
                <input className={`${inp} w-24`} value={s.percent} placeholder="%" onChange={e => setStage(i, { percent: e.target.value })} />
                <button type="button" aria-label="Remove stage" onClick={() => set({ paymentStages: stages.filter((_, idx) => idx !== i) })}
                  className="text-red-500 p-1"><Trash2 size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={() => set({ paymentStages: [...stages, { stage: '', percent: '' }] })}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600"><Plus size={14} /> Add stage</button>
          </div>
        </div>
        {area('paymentFooter', 'Payment terms note (under the stage table)', 2)}

        {area('executionTimeline', '5. Execution & Timeline', 4, 'one point per line')}
        {area('generalTerms', '6. General', 4, 'one point per line')}
      </div>
    </div>
  )
}
