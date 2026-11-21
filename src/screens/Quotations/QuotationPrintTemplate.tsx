import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { QUOTATION_LETTERHEAD as L } from '../../data/quotationTemplate'
import { amountInWords } from '../../utils/amountInWords'
import type { Quotation, QuotationTemplateData } from '../../types'

// Print layout of the quotation PDF — follows the sample "Estimate" quotation:
// page 1 = letterhead, QUOTATION header block, BOQ table, totals, notes and sign-off;
// page 2 = Terms & Conditions annexure. Everything variable comes from the quotation
// itself (items, totals) or from its template note boxes (QuotationTemplateFields.tsx).
// Plain inline styles on purpose, so the printed/saved PDF looks the same everywhere.

const NAVY = '#1c2533'
const GOLD = '#c8a96a'
const GREEN = '#7cb342'
const BORDER = '1px solid #000'
// Tables use separate borders (right + bottom on every cell, left + top on the table) with whole-pixel
// line heights: collapsed borders and fractional line heights come out doubled and misaligned when the
// page is captured to an image for the PDF.
const cell: CSSProperties = { borderRight: BORDER, borderBottom: BORDER, padding: '7px 8px', verticalAlign: 'top', lineHeight: '16px' }
const table: CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, borderLeft: BORDER, borderTop: BORDER }

const money = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const lines = (s?: string) => (s ?? '').split('\n').map(x => x.trim()).filter(Boolean)
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

// "Supply and Installation of Glass: Providing and fixing…" → bold lead-in before the first colon.
function Description({ text }: { text: string }) {
  const i = text.indexOf(':')
  if (i > 0 && i < 120) return <><strong>{text.slice(0, i + 1)}</strong>{text.slice(i + 1)}</>
  return <>{text}</>
}

function Bullets({ text }: { text?: string }) {
  const items = lines(text)
  if (items.length === 0) return null
  // Plain flexbox, not a <ul>/native list marker or a negative text-indent
  // hanging-indent — html2canvas (used to capture this page for the PDF)
  // doesn't reliably rasterize either of those, rendering a stray glyph in
  // the wrong position instead of a clean bullet. A fixed-width bullet
  // column + a flexible text column is plain box layout, which captures
  // correctly, and guarantees every line's text starts at the same x
  // position regardless of the bullet character's own width.
  return (
    <div style={{ margin: '3px 0 5px' }}>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', marginBottom: 2 }}>
          <span style={{ width: 12, flexShrink: 0 }}>-</span>
          <span style={{ flex: 1 }}>{t}</span>
        </div>
      ))}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p style={{ fontWeight: 700, margin: '8px 0 0' }}>{children}</p>
}

export function QuotationPrintTemplate({ q, tpl, clientName }: { q: Quotation; tpl: QuotationTemplateData; clientName: string }) {
  const sections = q.sections.filter(s => s.items.length > 0)
  let serial = 0
  const taxPercents = new Set(q.sections.flatMap(s => s.items.map(i => i.taxPercent ?? 0)).filter(p => p > 0))
  const taxLabel = taxPercents.size === 1 ? `Tax @ ${[...taxPercents][0]}% (Additional)` : 'Tax (Additional)'
  const transport = q.transportCost ?? 0
  const attn = tpl.kindAttn || clientName
  const hasLegacyTerms = !!(q.terms || q.paymentTerms)
  const stages = (tpl.paymentStages ?? []).filter(s => s.stage.trim() || s.percent.trim())

  return (
    <div style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: 11, color: '#000', lineHeight: '16px', background: '#fff' }}>
      {/* ───────── Page 1 ───────── */}
      <div data-pdf-page="1" style={{ border: BORDER }}>
        <div style={{ padding: '10px 14px 4px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <img src={L.mark} alt="" style={{ height: 64, display: 'block' }} />
            <div style={{ fontStyle: 'italic', color: '#666', borderBottom: `1px solid ${GREEN}`, paddingBottom: 2, marginTop: 46, fontSize: 10 }}>{L.tagline}</div>
          </div>
          <img src={L.logo} alt="" style={{ height: 96, display: 'block', margin: '0 auto 6px' }} />
          <div style={{ fontSize: 10, paddingBottom: 3 }}>{L.address}<br />{L.phone}</div>
        </div>

        <div style={{ borderTop: BORDER, textAlign: 'center', paddingBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 17, lineHeight: '22px', letterSpacing: 0.5 }}>QUOTATION</div>
          <div style={{ fontStyle: 'italic', color: '#666', fontSize: 10, lineHeight: '14px' }}>{tpl.workTitle}</div>
        </div>

        <table style={{ ...table, tableLayout: 'fixed', borderLeft: 'none', fontSize: 10.5 }}>
          <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
          <tbody>
            <tr>
              <td style={{ ...cell, padding: '3px 8px', borderBottom: 'none' }}><strong>Kind Attn.:</strong> {tpl.kindAttn}</td>
              <td style={{ ...cell, padding: '3px 8px', borderRight: 'none', borderBottom: 'none' }}><strong>Project MD:</strong> {tpl.projectMd}</td>
            </tr>
            <tr>
              <td style={{ ...cell, padding: '3px 8px', borderBottom: 'none' }}><strong>Site:</strong> {tpl.siteName}</td>
              <td style={{ ...cell, padding: '3px 8px', borderRight: 'none', borderBottom: 'none' }}><strong>Project Lead:</strong> {tpl.projectLead}</td>
            </tr>
            <tr>
              <td style={{ ...cell, padding: '3px 8px', borderBottom: 'none' }}><strong>Project Type:</strong> {tpl.projectType}</td>
              <td style={{ ...cell, padding: '3px 8px', borderRight: 'none', borderBottom: 'none' }}><strong>Project QS:</strong> {tpl.projectQs}</td>
            </tr>
            <tr>
              <td style={{ ...cell, padding: '3px 8px' }}><strong>Date:</strong> {fmtDate(q.createdAt)}</td>
              <td style={{ ...cell, padding: '3px 8px', borderRight: 'none' }} />
            </tr>
          </tbody>
        </table>

        <table style={{ ...table, tableLayout: 'fixed', borderLeft: 'none' }}>
          <colgroup>
            <col style={{ width: '6%' }} /><col style={{ width: '46%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: NAVY, color: '#fff' }}>
              {['S.No', 'Description of Work', 'UoM', 'Qty', 'Rate (₹)', 'Amount (₹)'].map(h => (
                <th key={h} style={{ ...cell, textAlign: h === 'Description of Work' ? 'left' : 'center', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(section => (
              <Fragment key={section.id}>
                <tr style={{ background: GOLD }}>
                  <td colSpan={6} style={{ ...cell, fontWeight: 700, height: 14 }}>{section.title}</td>
                </tr>
                {section.items.map(item => {
                  serial += 1
                  return (
                    <tr key={item.id} style={{ breakInside: 'avoid' }}>
                      <td style={{ ...cell, textAlign: 'center' }}>{serial}</td>
                      <td style={{ ...cell, textAlign: 'justify' }}><Description text={item.description} /></td>
                      <td style={{ ...cell, textAlign: 'center' }}>{item.unit}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{item.quantity}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{money(item.rate)}</td>
                      <td style={{ ...cell, textAlign: 'center' }}>{money(item.amount)}</td>
                    </tr>
                  )
                })}
                {section.notes && (
                  <tr>
                    <td colSpan={6} style={{ ...cell, fontStyle: 'italic' }}>Notes: {section.notes}</td>
                  </tr>
                )}
              </Fragment>
            ))}
            {transport > 0 && (
              <tr>
                <td style={{ ...cell, textAlign: 'center' }}>{serial + 1}</td>
                <td style={{ ...cell, textAlign: 'justify' }}>Transport</td>
                <td style={{ ...cell, textAlign: 'center' }}>Lsm</td>
                <td style={{ ...cell, textAlign: 'center' }}>1.00</td>
                <td style={{ ...cell, textAlign: 'center' }}>{money(transport)}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{money(transport)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>TOTAL AMOUNT</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 700, background: GOLD }}>{money(q.totalAmount + transport)}</td>
            </tr>
            {q.discountAmount > 0 && (
              <tr>
                <td colSpan={5} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>
                  Discount{q.discountType === 'percentage' && q.discountValue ? ` (${q.discountValue}%)` : ''}
                </td>
                <td style={{ ...cell, textAlign: 'center' }}>-{money(q.discountAmount)}</td>
              </tr>
            )}
            <tr>
              <td colSpan={5} style={{ ...cell, textAlign: 'right' }}>{taxLabel}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{money(q.taxAmount)}</td>
            </tr>
            <tr style={{ background: NAVY, color: '#fff' }}>
              <td colSpan={5} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>GRAND TOTAL</td>
              <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{money(q.netAmount)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ padding: '4px 6px', borderTop: BORDER }}>
          <p style={{ margin: 0 }}><strong><em>Amount in Words:</em></strong> <em>{amountInWords(q.netAmount)}</em></p>
          <p style={{ margin: '4px 0 0', fontWeight: 700 }}>Payment Notes:</p>
          {tpl.paymentNotes && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{tpl.paymentNotes}</p>}
          {tpl.closingNote && <p style={{ margin: '4px 0 0' }}><strong>Note:</strong> {tpl.closingNote}</p>}
          <p style={{ margin: '4px 0 0' }}>Thanks and Regards,</p>
          <p style={{ margin: 0, fontWeight: 700 }}>{tpl.signName}</p>
          <p style={{ margin: 0 }}>{tpl.signDesignation} <em>– Turnkey Projects &amp; Constructions</em></p>
          <p style={{ margin: '4px 0 0' }}>{tpl.signPhone}</p>
        </div>
      </div>

      {/* ───────── Page 2: Terms & Conditions ───────── */}
      <div data-pdf-page="2" style={{ border: BORDER, padding: '6px 8px' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 12, lineHeight: '16px' }}>TERMS &amp; CONDITIONS</p>
        <p style={{ margin: 0, fontStyle: 'italic', color: '#666' }}>Annexure to Quotation – {attn}</p>

        {hasLegacyTerms && !tpl.commercialTerms ? (
          <>
            {q.terms && <><SectionTitle>Terms</SectionTitle><Bullets text={q.terms} /></>}
            {q.paymentTerms && <><SectionTitle>Payment Terms</SectionTitle><Bullets text={q.paymentTerms} /></>}
          </>
        ) : (
          <>
            <SectionTitle>1. Commercial Terms</SectionTitle><Bullets text={tpl.commercialTerms} />
            <SectionTitle>2. Client's Scope of Work (Site Provisions)</SectionTitle><Bullets text={tpl.clientScope} />
            <SectionTitle>3. Scope, Design &amp; Variations</SectionTitle><Bullets text={tpl.scopeVariations} />
            <SectionTitle>4. Payment Terms</SectionTitle>
            {stages.length > 0 && (
              <table style={{ ...table, margin: '6px 0' }}>
                <thead>
                  <tr style={{ background: NAVY, color: '#fff' }}>
                    <th style={{ ...cell, textAlign: 'left' }}>Stage</th>
                    <th style={{ ...cell, width: '25%', textAlign: 'center' }}>Payment %</th>
                  </tr>
                </thead>
                <tbody>
                  {stages.map((s, i) => (
                    <tr key={i}>
                      <td style={cell}>{s.stage}</td>
                      <td style={{ ...cell, textAlign: 'center', fontWeight: 700 }}>{s.percent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Bullets text={tpl.paymentFooter} />
            <SectionTitle>5. Execution &amp; Timeline</SectionTitle><Bullets text={tpl.executionTimeline} />
            <SectionTitle>6. General</SectionTitle><Bullets text={tpl.generalTerms} />
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, breakInside: 'avoid' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>{L.signingCompany}</p>
            <p style={{ margin: '14px 0 0', fontWeight: 700 }}>{tpl.projectMd}</p>
            <p style={{ margin: 0, fontStyle: 'italic' }}>Managing Director</p>
          </div>
          <div style={{ minWidth: '38%' }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Accepted by Client</p>
            <p style={{ margin: '14px 0 0', fontWeight: 700 }}>Name &amp; Signature:</p>
            <p style={{ margin: 0, fontStyle: 'italic' }}>Date:</p>
          </div>
        </div>
      </div>
    </div>
  )
}
