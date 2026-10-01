import type { Lead, Quotation, Project, ProductSaleStage } from '../../types'

// Customer Enquiry / Quotation / Approval have no Project shell yet — their
// stage is derived purely from the Lead's linked Quotation (there is at most
// one "live" quotation per product-sale lead in practice; the most recently
// updated one is used if more exist, e.g. from a rejected-then-redrafted
// quotation). Once a shell exists (type: 'product_sale'), its own
// productSaleStage is the source of truth — see createProductSaleShell.ts and
// ProductSaleStatusSheet.tsx.
export function deriveProductSaleStage(lead: Lead, quotations: Quotation[], shellProject?: Project): ProductSaleStage {
  if (shellProject?.productSaleStage) return shellProject.productSaleStage
  const leadQuotations = quotations.filter(q => q.leadId === lead.id)
  if (leadQuotations.length === 0) return 'customer_enquiry'
  const latest = [...leadQuotations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (latest.status === 'client_approved') return 'payment'
  if (latest.status === 'internally_approved' || latest.status === 'sent_to_client') return 'approval'
  return 'quotation'
}
