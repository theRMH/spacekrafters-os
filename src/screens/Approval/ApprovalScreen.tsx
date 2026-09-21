import { useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { ApprovalSection, type ApprovalTab } from '../MDTasks/ApprovalSection'
import { ApprovalHistory } from '../MDTasks/ApprovalHistory'

// MD-only Approval tab: the pending items of the selected category at the top,
// and below them the decision history of that same category only — Quotation
// shows Quotation history, Designing shows Designing history, never mixed.
// (Route is gated by `view_md_tasks`, which only the owner/MD has.)
export default function ApprovalScreen() {
  const [tab, setTab] = useState<ApprovalTab>('quotation')
  // Bumped after every decision so the history refetches straight away.
  const [historyKey, setHistoryKey] = useState(0)

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Approval</h1>
      </div>

      <div className="px-4 pt-4 space-y-6">
        <ApprovalSection tab={tab} onTabChange={setTab} onDecided={() => setHistoryKey(k => k + 1)} />
        {tab === 'quotation'
          ? <ApprovalHistory refreshKey={historyKey} types={['Quotation']} title="Quotation Approval History" />
          : <ApprovalHistory refreshKey={historyKey} types={['Designing']} title="Designing Approval History" />}
      </div>
    </div>
  )
}
