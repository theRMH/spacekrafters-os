import { useEffect, useMemo, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { getAllCompanyAccounts, getAllCompanyTransactions } from '../../services/companyAccountService'
import { getAllPersonalAccounts, getAllPersonalTransactions } from '../../services/personalFinanceService'
import type { CompanyAccount, CompanyTransaction, PersonalAccount, PersonalTransaction, PersonalTransactionType } from '../../types'

function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100">
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-extrabold ${tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 px-1">{title}</h3>
      {children}
    </div>
  )
}

const INFLOW_TYPES = new Set<PersonalTransactionType>(['income', 'advance_received', 'loan_received'])

function personalBalance(account: PersonalAccount, transactions: PersonalTransaction[]): number {
  return transactions
    .filter(t => t.accountId === account.id)
    .reduce((bal, t) => bal + (INFLOW_TYPES.has(t.type) ? t.amount : -t.amount), account.openingBalance)
}

function companyBalance(account: CompanyAccount, transactions: CompanyTransaction[]): number {
  return transactions
    .filter(t => t.accountId === account.id)
    .reduce((bal, t) => bal + (t.type === 'credit' ? t.amount : -t.amount), account.openingBalance)
}

export default function CombinedFinanceScreen() {
  const [companyAccounts, setCompanyAccounts] = useState<CompanyAccount[]>([])
  const [companyTxns, setCompanyTxns] = useState<CompanyTransaction[]>([])
  const [personalAccounts, setPersonalAccounts] = useState<PersonalAccount[]>([])
  const [personalTxns, setPersonalTxns] = useState<PersonalTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [ca, ct, pa, pt] = await Promise.all([
        getAllCompanyAccounts(), getAllCompanyTransactions(),
        getAllPersonalAccounts(), getAllPersonalTransactions(),
      ])
      setCompanyAccounts(ca); setCompanyTxns(ct); setPersonalAccounts(pa); setPersonalTxns(pt)
      setIsLoading(false)
    }
    load()
  }, [])

  const companyTotal = useMemo(() => companyAccounts.reduce((s, a) => s + companyBalance(a, companyTxns), 0), [companyAccounts, companyTxns])
  const personalTotal = useMemo(() => personalAccounts.reduce((s, a) => s + personalBalance(a, personalTxns), 0), [personalAccounts, personalTxns])

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Combined Finance</h1>
        <p className="text-xs text-slate-400">Read-only rollup. Make changes from Company or Personal Finance.</p>
      </div>

      <div className="px-4 pt-4">
        {!isLoading && (
          <>
            <Section title="Overview">
              <div className="grid grid-cols-3 gap-2.5">
                <StatCard label="Company" value={fmtCurrency(companyTotal)} />
                <StatCard label="Personal" value={fmtCurrency(personalTotal)} />
                <StatCard label="Total" value={fmtCurrency(companyTotal + personalTotal)} />
              </div>
            </Section>

            <Section title="Company Accounts">
              <div className="space-y-2">
                {companyAccounts.map(a => (
                  <div key={a.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                    <p className="text-sm font-bold text-slate-700">{fmtCurrency(companyBalance(a, companyTxns))}</p>
                  </div>
                ))}
                {companyAccounts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No company accounts.</p>}
              </div>
            </Section>

            <Section title="Personal Accounts">
              <div className="space-y-2">
                {personalAccounts.map(a => (
                  <div key={a.id} className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{a.name}</p>
                    <p className="text-sm font-bold text-slate-700">{fmtCurrency(personalBalance(a, personalTxns))}</p>
                  </div>
                ))}
                {personalAccounts.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No personal accounts.</p>}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
