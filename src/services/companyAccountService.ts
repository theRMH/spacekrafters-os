import { supabase } from '../lib/supabase'
import type { CompanyAccount, CompanyTransaction } from '../types'

const ACCOUNTS_TABLE     = 'sks_company_accounts'
const TRANSACTIONS_TABLE = 'sks_company_transactions'

export async function getAllCompanyAccounts(): Promise<CompanyAccount[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(ACCOUNTS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as CompanyAccount)
}

export async function upsertCompanyAccount(account: CompanyAccount): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(ACCOUNTS_TABLE).upsert({
    id:         account.id,
    data:       account,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllCompanyTransactions(): Promise<CompanyTransaction[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from(TRANSACTIONS_TABLE).select('data').order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map(r => r.data as CompanyTransaction)
}

export async function addCompanyTransaction(txn: CompanyTransaction): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not configured.' }
  const { error } = await supabase.from(TRANSACTIONS_TABLE).insert({
    id:         txn.id,
    account_id: txn.accountId,
    data:       txn,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
