import { upsertProject } from '../../services/projectService'
import { upsertPaymentMilestone, addReceipt } from '../../services/financeService'
import { getAllClients } from '../../services/clientService'
import type { Lead, Quotation, Project, PaymentMilestone, Receipt } from '../../types'

// Creates the minimal Project shell (type: 'product_sale') for a Product Sale
// once its Quotation has been client-approved — mirrors the exact
// Lead-advance-payment → milestone/receipt auto-creation logic already used
// for Interior Projects (see ProjectsScreen.tsx's commitSave), so Finance
// screens (Receivables, Dashboard, etc.) need zero changes to understand a
// Product Sale's payment milestone. `stage`/`pendingStageRequest` are left at
// an inert 'closed' sentinel — never read, since product_sale rows are
// filtered out of every Interior Projects screen — the real progress lives in
// productSaleStage/pendingProductSaleStageRequest instead.
export async function createProductSaleShell(
  lead: Lead, quotation: Quotation, coordinatorName: string,
): Promise<{ ok: boolean; error?: string; project?: Project }> {
  const now = new Date().toISOString()
  const clients = await getAllClients()
  const matchedClient = clients.find(c => c.phone === lead.phone)

  const project: Project = {
    id: `prj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${lead.name} — Product Sale`,
    leadId: lead.id,
    quotationId: quotation.id,
    clientId: matchedClient?.id,
    coordinatorId: lead.ownerId ?? '',
    clientName: lead.name,
    clientPhone: lead.phone,
    coordinatorName,
    stage: 'closed',
    status: 'active',
    contractValue: quotation.netAmount,
    type: 'product_sale',
    productSaleStage: 'payment',
    createdAt: now,
    updatedAt: now,
  }
  const projectResult = await upsertProject(project)
  if (!projectResult.ok) return { ok: false, error: projectResult.error ?? 'Could not create the product sale.' }

  const milestone: PaymentMilestone = {
    id: `mst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    projectId: project.id,
    title: 'Full Order Value',
    amount: quotation.netAmount,
    status: 'pending',
    receivedAmount: 0,
    receivedDates: [],
    createdAt: now,
    updatedAt: now,
  }
  if (quotation.advancePaymentReceived && quotation.advancePaymentAmount) {
    milestone.receivedAmount = quotation.advancePaymentAmount
    milestone.receivedDates = [quotation.advancePaymentAt ?? now]
    milestone.status = quotation.advancePaymentAmount >= milestone.amount ? 'received' : 'partial'
  }
  await upsertPaymentMilestone(milestone)

  if (quotation.advancePaymentReceived && quotation.advancePaymentAmount) {
    const receipt: Receipt = {
      id: `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      projectId: project.id,
      milestoneId: milestone.id,
      amount: quotation.advancePaymentAmount,
      receivedDate: quotation.advancePaymentAt ?? now,
      reference: quotation.advancePaymentRef,
      notes: 'Advance payment carried over from Quotation.',
      createdAt: now,
    }
    await addReceipt(receipt)
    const projectWithAdvance = { ...project, advanceReceived: quotation.advancePaymentAmount }
    await upsertProject(projectWithAdvance)
    return { ok: true, project: projectWithAdvance }
  }

  return { ok: true, project }
}
