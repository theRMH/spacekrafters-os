import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Lead, LeadActivityItem } from '../types'
import { getAllLeads, upsertLead, insertLead, getNextLeadNumber, hardDeleteLead } from '../services/leadService'
import { getAllQuotations, deleteQuotations } from '../services/quotationService'
import { getAllDesignPackages, upsertDesignPackage } from '../services/designService'
import { useAuth } from './AuthContext'

interface CRMContextValue {
  leads:                  Lead[]
  isLoading:              boolean
  refreshLeads:           () => Promise<void>
  addLead:                (lead: Omit<Lead, 'id' | 'activity' | 'createdAt' | 'updatedAt' | 'leadNumber'>) => Promise<{ ok: boolean; error?: string; leadNumber?: string }>
  updateLead:             (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
  deleteLead:             (id: string) => Promise<{ ok: boolean; error?: string }>
  bulkDeleteLeads:        (ids: string[]) => Promise<{ ok: boolean; error?: string }>
  restoreLead:            (id: string) => Promise<{ ok: boolean; error?: string }>
  permanentlyDeleteLead:  (id: string) => Promise<{ ok: boolean; error?: string }>
}

const CRMContext = createContext<CRMContextValue | null>(null)

export function CRMProvider({ children }: { children: ReactNode }) {
  const { user, isAuthReady } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function refreshLeads() {
    setIsLoading(true)
    setLeads(await getAllLeads())
    setIsLoading(false)
  }

  useEffect(() => {
    // CRMProvider sits inside AuthProvider and mounts as soon as the app
    // loads — before Supabase has restored the session. Fetching on an
    // empty-deps effect meant this could fire as an anonymous request (RLS
    // silently returns []) and never retry for the rest of the tab's life,
    // since the effect never ran again. Wait for auth to actually resolve,
    // and refetch if the logged-in user changes.
    if (!isAuthReady) return
    refreshLeads()
    // Picks up a lead someone else just assigned/reassigned (e.g. MD hands a
    // lead to a PC from their own session) without the assignee needing to
    // manually reload — same 30s interval NotificationBell.tsx already polls
    // notifications at, for consistency.
    const id = setInterval(refreshLeads, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, user?.id])

  async function addLead(lead: Omit<Lead, 'id' | 'activity' | 'createdAt' | 'updatedAt' | 'leadNumber'>) {
    const now = new Date().toISOString()
    const base: Lead = {
      ...lead,
      // Random suffix: two leads saved in the same millisecond must not share a primary key.
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      activity: [{
        id: `act_${Date.now()}`,
        label: 'Lead Created',
        updatedBy: user?.name ?? 'System',
        updatedAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    }
    // The Lead ID (SK001…) is always assigned here from the database's own
    // highest-used number — never taken from the caller. If another user saves
    // the same number first, the unique index rejects ours and we ask for the
    // next one and try again.
    for (let attempt = 0; attempt < 5; attempt++) {
      const leadNumber = lead.leadCodePrefix ? await getNextLeadNumber(lead.leadCodePrefix) : undefined
      if (lead.leadCodePrefix && !leadNumber) return { ok: false, error: 'Could not generate a Lead ID. Please try again.' }
      const newLead: Lead = { ...base, leadNumber: leadNumber ?? undefined }
      const result = await insertLead(newLead)
      if (result.ok) {
        setLeads(prev => [newLead, ...prev])
        return { ok: true, leadNumber: newLead.leadNumber }
      }
      if (!result.duplicate) return result
    }
    return { ok: false, error: 'Could not assign a unique Lead ID. Please try again.' }
  }

  async function updateLead(id: string, updates: Partial<Lead>, activityNote?: string) {
    const existing = leads.find(l => l.id === id)
    if (!existing) return { ok: false, error: 'Lead not found.' }
    const now = new Date().toISOString()
    const newActivity: LeadActivityItem[] = activityNote
      ? [...existing.activity, {
          id: `act_${Date.now()}`,
          label: activityNote,
          updatedBy: user?.name ?? 'System',
          updatedAt: now,
        }]
      : existing.activity
    const updated: Lead = { ...existing, ...updates, activity: newActivity, updatedAt: now }
    const result = await upsertLead(updated)
    if (result.ok) setLeads(prev => prev.map(l => (l.id === id ? updated : l)))
    return result
  }

  // "Delete" in the Leads UI no longer removes the record. It marks the lead
  // Lost — the exact same status/field LeadStatusSheet's own Lost transition
  // already uses — so the lead keeps its full history (activity log,
  // appointments, quotations, etc.) and still shows up under the Lost filter,
  // instead of a real DB delete. Stashes the status it was at so Restore can
  // put it back exactly where it was rather than resetting to 'new'.
  async function bulkDeleteLeads(ids: string[]) {
    for (const id of ids) {
      const existing = leads.find(l => l.id === id)
      const lostFromStatus = existing && existing.status !== 'lost' ? existing.status : existing?.lostFromStatus
      const result = await updateLead(id, { status: 'lost', lostFromStatus }, 'Marked Lost (removed from active Leads list)')
      if (!result.ok) return result
    }
    return { ok: true }
  }

  async function deleteLead(id: string) {
    return bulkDeleteLeads([id])
  }

  // Only meaningful for a lead currently sitting in Lost — puts it back at
  // the exact stage it was at before (lostFromStatus), or 'new' for a lead
  // marked Lost before that field existed. Clears lostReason/lostFromStatus
  // since they only describe the Lost episode that just ended; the full
  // activity log (including the original "Marked Lost" entries) is untouched.
  async function restoreLead(id: string) {
    const existing = leads.find(l => l.id === id)
    if (!existing) return { ok: false, error: 'Lead not found.' }
    const restoredStatus = existing.lostFromStatus ?? 'new'
    return updateLead(id, {
      status: restoredStatus, lostFromStatus: undefined, lostReason: undefined,
    }, `Restored to ${restoredStatus.replace(/_/g, ' ')}`)
  }

  // Real, permanent delete — only ever invoked (after explicit confirmation)
  // on a lead already in Lost. Mirrors the cascade the old hard-delete path
  // used: quotations don't cascade at the DB level (FK violation otherwise),
  // so they're deleted explicitly first; Design Packages are detached, not
  // deleted, since there's no delete permission on that table at all.
  async function permanentlyDeleteLead(id: string) {
    const [quotations, designPackages] = await Promise.all([getAllQuotations(), getAllDesignPackages()])

    const quotationIds = quotations.filter(q => q.leadId === id).map(q => q.id)
    if (quotationIds.length > 0) {
      const result = await deleteQuotations(quotationIds)
      if (!result.ok) return result
    }

    const affectedPackages = designPackages.filter(p => p.leadId === id)
    if (affectedPackages.length > 0) {
      const results = await Promise.all(affectedPackages.map(pkg =>
        upsertDesignPackage({ ...pkg, leadId: undefined, updatedAt: new Date().toISOString() })
      ))
      const failed = results.find(r => !r.ok)
      if (failed) return failed
    }

    const result = await hardDeleteLead(id)
    if (result.ok) setLeads(prev => prev.filter(l => l.id !== id))
    return result
  }

  return (
    <CRMContext.Provider value={{ leads, isLoading, refreshLeads, addLead, updateLead, deleteLead, bulkDeleteLeads, restoreLead, permanentlyDeleteLead }}>
      {children}
    </CRMContext.Provider>
  )
}

export function useCRM(): CRMContextValue {
  const ctx = useContext(CRMContext)
  if (!ctx) throw new Error('useCRM must be used within CRMProvider')
  return ctx
}
