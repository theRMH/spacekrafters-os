import { supabase } from '../lib/supabase'
import type { Client } from '../types'

const TABLE = 'sks_clients'

export async function getAllClients(): Promise<Client[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as Client)
}

export async function upsertClient(client: Client): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).upsert({
    id:         client.id,
    data:       client,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteClient(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
