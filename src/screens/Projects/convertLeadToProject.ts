import { upsertProject } from '../../services/projectService'
import { getAllClients, upsertClient } from '../../services/clientService'
import { upsertQuotation } from '../../services/quotationService'
import { upsertPaymentMilestone, addReceipt } from '../../services/financeService'
import { getAllDesignPackages, upsertDesignPackage } from '../../services/designService'
import { addAuditLog } from '../../services/auditLogService'
import type { AuthUser, Client, Lead, PaymentMilestone, Project, Quotation, Receipt } from '../../types'

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

// The project's display ID follows the lead it comes from: lead SK-0012 becomes project PRJ-SK-0012.
export function projectNumberForLead(lead: Pick<Lead, 'id' | 'leadNumber'>): string {
  return `PRJ-${lead.leadNumber ?? lead.id}`
}

// Creates the project for a lead whose quotation the client approved — the same things the Projects page does when
// a project is created from a lead: the client record, the project itself (starting at Advance Payment), the lead's
// design packages and quotation linked to it, and the payment milestone (with the advance already received, if any).
export async function convertLeadToProject(params: {
  lead: Lead
  quotation: Quotation | null
  name: string
  dueDate: string
  user: AuthUser | null
}): Promise<{ ok: boolean; error?: string; project?: Project }> {
  const { lead, quotation, name, dueDate, user } = params
  const now = new Date().toISOString()

  // The client: reuse the one with the same phone, otherwise add it.
  const clients = await getAllClients()
  let client: Client | undefined = clients.find(c => c.phone === lead.phone)
  if (!client) {
    client = { id: newId('client'), name: lead.name, phone: lead.phone, email: lead.email, createdAt: now, updatedAt: now }
    const clientResult = await upsertClient(client)
    if (!clientResult.ok) return { ok: false, error: clientResult.error ?? 'Could not add the client.' }
  }

  const project: Project = {
    id: newId('prj'),
    projectNumber: projectNumberForLead(lead),
    name: name.trim(),
    leadId: lead.id,
    quotationId: quotation?.id,
    clientId: client.id,
    clientName: lead.name,
    clientPhone: lead.phone,
    coordinatorId: lead.ownerId ?? user?.id ?? '',
    coordinatorName: lead.ownerName,
    stage: 'advance_payment',
    status: 'active',
    contractValue: quotation?.netAmount,
    expectedHandoverDate: dueDate,
    statusHistory: user ? [{ stage: 'advance_payment', note: 'Project created from lead', updatedBy: user.name, updatedRole: user.role, updatedAt: now }] : undefined,
    createdAt: now,
    updatedAt: now,
  }
  const result = await upsertProject(project)
  if (!result.ok) return { ok: false, error: result.error ?? 'Could not create the project.' }

  // Design work already started for this lead now belongs to the project.
  const leadPackages = (await getAllDesignPackages()).filter(pkg => pkg.leadId === lead.id && !pkg.projectId)
  for (const pkg of leadPackages) await upsertDesignPackage({ ...pkg, projectId: project.id, updatedAt: now })

  let finalProject = project
  if (quotation) {
    await upsertQuotation({ ...quotation, projectId: project.id })
    const advance = lead.advancePaymentAmount
    const milestone: PaymentMilestone = {
      id: newId('mst'), projectId: project.id, title: 'Full Contract Value', amount: quotation.netAmount,
      status: 'pending', receivedAmount: 0, receivedDates: [], createdAt: now, updatedAt: now,
    }
    if (advance) {
      milestone.receivedAmount = advance
      milestone.receivedDates = [now]
      milestone.status = advance >= milestone.amount ? 'received' : 'partial'
    }
    await upsertPaymentMilestone(milestone)
    if (advance) {
      const receipt: Receipt = {
        id: newId('rcpt'), projectId: project.id, milestoneId: milestone.id, amount: advance, receivedDate: now,
        reference: lead.advancePaymentRef, notes: 'Advance payment carried over from Lead.', createdAt: now,
      }
      await addReceipt(receipt)
      finalProject = { ...project, advanceReceived: advance }
      await upsertProject(finalProject)
    }
  }

  if (user) {
    addAuditLog({
      id: newId('audit'), projectId: project.id, action: 'project_created',
      description: `Project "${project.name}" created.`, createdBy: user.name, createdByRole: user.role, createdAt: now,
    })
  }
  return { ok: true, project: finalProject }
}
