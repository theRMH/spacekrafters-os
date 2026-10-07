import { supabase } from '../lib/supabase'
import type { Lead, LeadCodePrefix } from '../types'

const TABLE = 'sks_leads'

export async function getAllLeads(): Promise<Lead[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Lead)
}

export async function getNextLeadNumber(prefix: LeadCodePrefix): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('sks_next_lead_number', { p_prefix: prefix })
  if (error || typeof data !== 'string') return null
  return data
}

// Plain insert (not upsert) for brand-new leads so the unique Lead ID index
// can reject a duplicate — `duplicate` lets the caller fetch a fresh number
// and retry when two users create a lead at the same instant.
export async function insertLead(lead: Lead): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).insert({
    id:         lead.id,
    owner_id:   lead.ownerId || null,
    status:     lead.status,
    data:       lead,
    updated_at: new Date().toISOString(),
  })
  if (error) return { ok: false, error: error.message, duplicate: error.code === '23505' && error.message.includes('sks_leads_lead_number_uniq') }
  return { ok: true }
}

export async function upsertLead(lead: Lead): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         lead.id,
    owner_id:   lead.ownerId || null, // never '' — that's not a valid sks_managed_users FK reference
    status:     lead.status,
    data:       lead,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Real, permanent row delete — distinct from marking a lead Lost (a plain
// status update). Only ever called for a lead already sitting in Lost, after
// an explicit "Delete" confirmation.
export async function hardDeleteLead(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
