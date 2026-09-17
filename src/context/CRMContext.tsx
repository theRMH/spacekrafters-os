import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Lead, LeadActivityItem } from '../types'
import { getAllLeads, upsertLead, deleteLead as deleteLeadRow } from '../services/leadService'
import { getAllQuotations, deleteQuotation } from '../services/quotationService'
import { getAllDesignPackages, upsertDesignPackage } from '../services/designService'
import { useAuth } from './AuthContext'

interface CRMContextValue {
  leads:        Lead[]
  isLoading:    boolean
  refreshLeads: () => Promise<void>
  addLead:      (lead: Omit<Lead, 'id' | 'activity' | 'createdAt' | 'updatedAt'>) => Promise<{ ok: boolean; error?: string }>
  updateLead:   (id: string, updates: Partial<Lead>, activityNote?: string) => Promise<{ ok: boolean; error?: string }>
  deleteLead:   (id: string) => Promise<{ ok: boolean; error?: string }>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthReady, user?.id])

  async function addLead(lead: Omit<Lead, 'id' | 'activity' | 'createdAt' | 'updatedAt'>) {
    const now = new Date().toISOString()
    const newLead: Lead = {
      ...lead,
      id: `lead_${Date.now()}`,
      activity: [{
        id: `act_${Date.now()}`,
        label: 'Lead Created',
        updatedBy: user?.name ?? 'System',
        updatedAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    }
    const result = await upsertLead(newLead)
    if (result.ok) setLeads(prev => [newLead, ...prev])
    return result
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

  // Appointments, Follow-ups, Site Visits, Requirements, and the lead's own
  // activity log all cascade-delete automatically at the DB level (FKs with
  // ON DELETE CASCADE — see supabase/schema.sql). Quotations don't (deleting
  // a lead with a linked quotation would otherwise fail outright with a
  // foreign-key violation), so those are deleted explicitly first, same as
  // the client wants a lead deletable regardless of stage. Design Packages
  // survive — their leadId is optional, so they're detached (not deleted)
  // since there's no delete permission for that table at all.
  async function deleteLead(id: string) {
    const [quotations, designPackages] = await Promise.all([getAllQuotations(), getAllDesignPackages()])

    for (const q of quotations.filter(q => q.leadId === id)) {
      const result = await deleteQuotation(q.id)
      if (!result.ok) return result
    }
    for (const pkg of designPackages.filter(p => p.leadId === id)) {
      const result = await upsertDesignPackage({ ...pkg, leadId: undefined, updatedAt: new Date().toISOString() })
      if (!result.ok) return result
    }

    const result = await deleteLeadRow(id)
    if (result.ok) setLeads(prev => prev.filter(l => l.id !== id))
    return result
  }

  return (
    <CRMContext.Provider value={{ leads, isLoading, refreshLeads, addLead, updateLead, deleteLead }}>
      {children}
    </CRMContext.Provider>
  )
}

export function useCRM(): CRMContextValue {
  const ctx = useContext(CRMContext)
  if (!ctx) throw new Error('useCRM must be used within CRMProvider')
  return ctx
}
