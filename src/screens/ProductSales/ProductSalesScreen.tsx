import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Phone } from 'lucide-react'
import { useCRM } from '../../context/CRMContext'
import { PermissionGate } from '../../components/layout/PermissionGate'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { Snackbar } from '../../components/feedback/Snackbar'
import { StatusBadge } from '../../components/badges/StatusBadge'
import { BUSINESS_BRAND_LABEL } from '../../data/businessDivisions'
import { getAllQuotations } from '../../services/quotationService'
import { getAllProjects } from '../../services/projectService'
import { deriveProductSaleStage } from './productSaleStage'
import { PRODUCT_SALE_STAGE_LABEL } from './ProductSaleStatusSheet'
import { ProductSaleEnquiryForm } from './ProductSaleEnquiryForm'
import type { Quotation, Project } from '../../types'

export default function ProductSalesScreen() {
  const navigate = useNavigate()
  const { leads } = useCRM()
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '' })

  useEffect(() => {
    getAllQuotations().then(setQuotations)
    getAllProjects().then(ps => setProjects(ps.filter(p => p.type === 'product_sale')))
  }, [])

  const fgdLeads = leads.filter(l => l.businessDivision === 'fgd')

  const rows = fgdLeads
    .map(lead => {
      const shell = projects.find(p => p.leadId === lead.id)
      return { lead, shell, stage: deriveProductSaleStage(lead, quotations, shell) }
    })
    .filter(r => !search
      || r.lead.name.toLowerCase().includes(search.toLowerCase())
      || r.lead.phone.includes(search))
    .sort((a, b) => b.lead.createdAt.localeCompare(a.lead.createdAt))

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-extrabold text-slate-800">Product Sales</h1>
          <PermissionGate permission="create_product_sale">
            <button onClick={() => setShowNew(true)} aria-label="New enquiry"
              className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-fab active:bg-indigo-700 flex-shrink-0">
              <Plus size={18} className="text-white" />
            </button>
          </PermissionGate>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or phone…" />
      </div>

      <div className="px-4 pt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No product sale enquiries yet.</p>
        ) : (
          rows.map(({ lead, stage }) => (
            <button key={lead.id} onClick={() => navigate(`/product-sales/${lead.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 shadow-sm active:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{lead.name}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Phone size={11} />{lead.phone}</p>
                  {lead.businessBrand && <p className="text-[11px] text-slate-400 mt-0.5">{BUSINESS_BRAND_LABEL[lead.businessBrand]}</p>}
                </div>
                <StatusBadge status={stage} label={PRODUCT_SALE_STAGE_LABEL[stage]} />
              </div>
            </button>
          ))
        )}
      </div>

      <ProductSaleEnquiryForm isOpen={showNew} onClose={() => setShowNew(false)}
        onCreated={msg => setSnack({ open: true, msg })} />
      <Snackbar isOpen={snack.open} message={snack.msg} onClose={() => setSnack({ open: false, msg: '' })} />
    </div>
  )
}
