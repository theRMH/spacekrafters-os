import { supabase } from '../lib/supabase'
import type { Vendor } from '../types'

const TABLE = 'sks_vendors'

export async function getAllVendors(): Promise<Vendor[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Vendor)
}

export async function upsertVendor(vendor: Vendor): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         vendor.id,
    status:     vendor.status,
    data:       vendor,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
