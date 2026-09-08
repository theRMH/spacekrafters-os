import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import type { Lead, LeadActivityItem } from '../types'
import { getAllLeads, upsertLead, deleteLead as deleteLeadRow } from '../services/leadService'
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
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)

  async function refreshLeads() {
    setIsLoading(true)
    setLeads(await getAllLeads())
    setIsLoading(false)
  }

  useEffect(() => { refreshLeads() }, [])

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

  async function deleteLead(id: string) {
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
