import { supabase } from '../lib/supabase'
import type {
  PersonalAccount, PersonalCategory, PersonalSubcategory,
  PersonalTransaction, PersonalCommitment, PersonalPlan,
} from '../types'

const ACCOUNTS_TABLE      = 'sks_personal_accounts'
const CATEGORIES_TABLE    = 'sks_personal_categories'
const SUBCATEGORIES_TABLE = 'sks_personal_subcategories'
const TRANSACTIONS_TABLE  = 'sks_personal_transactions'
const COMMITMENTS_TABLE   = 'sks_personal_commitments'
const PLANS_TABLE         = 'sks_personal_plans'

export async function getAllPersonalAccounts(): Promise<PersonalAccount[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(ACCOUNTS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PersonalAccount)
}

export async function upsertPersonalAccount(account: PersonalAccount): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(ACCOUNTS_TABLE).upsert({
    id:         account.id,
    data:       account,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPersonalCategories(): Promise<PersonalCategory[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(CATEGORIES_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PersonalCategory)
}

export async function upsertPersonalCategory(category: PersonalCategory): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(CATEGORIES_TABLE).upsert({ id: category.id, data: category }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPersonalSubcategories(): Promise<PersonalSubcategory[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(SUBCATEGORIES_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PersonalSubcategory)
}

export async function upsertPersonalSubcategory(sub: PersonalSubcategory): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(SUBCATEGORIES_TABLE).upsert({
    id:          sub.id,
    category_id: sub.categoryId,
    data:        sub,
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPersonalTransactions(): Promise<PersonalTransaction[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TRANSACTIONS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PersonalTransaction)
}

export async function addPersonalTransaction(txn: PersonalTransaction): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TRANSACTIONS_TABLE).insert({
    id:         txn.id,
    account_id: txn.accountId,
    data:       txn,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPersonalCommitments(): Promise<PersonalCommitment[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(COMMITMENTS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PersonalCommitment)
}

export async function upsertPersonalCommitment(commitment: PersonalCommitment): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(COMMITMENTS_TABLE).upsert({
    id:     commitment.id,
    status: commitment.status,
    data:   commitment,
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllPersonalPlans(): Promise<PersonalPlan[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(PLANS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as PersonalPlan)
}

export async function upsertPersonalPlan(plan: PersonalPlan): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(PLANS_TABLE).upsert({ id: plan.id, data: plan }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
