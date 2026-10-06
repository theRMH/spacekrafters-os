import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { useCRM } from '../../context/CRMContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { SearchBar } from '../../components/forms/SearchBar'
import { MultiFileUploadField } from '../../components/forms/MultiFileUploadField'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { getAllSiteVisits } from '../../services/siteVisitService'
import type { SiteVisit } from '../../types'

function fmtDate(val: string): string {
  const d = new Date(val)
  if (isNaN(d.getTime())) return val
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Derived, not a stored field — a site visit has no workflow status of its
// own today, only a checklist. "Complete" here means every checklist item is
// checked, not that the visit has been reviewed/approved by anyone.
function visitStatus(visit: SiteVisit): { label: string; tone: 'good' | 'pending' } {
  const total = visit.checklist.length
  const done = visit.checklist.filter(c => c.checked).length
  if (total > 0 && done === total) return { label: 'Complete', tone: 'good' }
  return { label: `${done}/${total} checklist items done`, tone: 'pending' }
}

export default function SiteVisitReportScreen() {
  const { leads } = useCRM()
  const [visits, setVisits] = useState<SiteVisit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<SiteVisit | null>(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setVisits(await getAllSiteVisits())
      setIsLoading(false)
    }
    load()
  }, [])

  function lead(id: string) {
    return leads.find(l => l.id === id)
  }
  function leadName(id: string): string {
    return lead(id)?.name ?? id
  }

  const sorted = [...visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate))
  const filtered = sorted.filter(v => !search || leadName(v.leadId).toLowerCase().includes(search.toLowerCase()))

  const totalPhotos = (visit: SiteVisit) => visit.rooms.reduce((sum, r) => sum + (r.photos?.length ?? 0), 0)

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <h1 className="text-lg font-extrabold text-slate-800">Site Visit Report</h1>
        <p className="text-xs text-slate-400 mb-3">Every site visit submitted by the team, in one place.</p>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by lead name…" />
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && filtered.map(visit => {
          const status = visitStatus(visit)
          const l = lead(visit.leadId)
          return (
            <div key={visit.id} onClick={() => setSelected(visit)}
              className="w-full text-left bg-white rounded-2xl shadow-card border border-slate-100 p-4 active:scale-[0.98] transition-transform cursor-pointer">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{leadName(visit.leadId)}</span>
                    <span className="text-slate-300 text-xs">|</span>
                    <span className="text-xs text-slate-500">{fmtDate(visit.visitDate)}</span>
                  </div>
                  {l?.city && (
                    <p className="text-xs text-slate-600 flex items-center gap-1 mb-1">
                      <MapPin size={12} className="text-slate-400" /> {l.city}
                    </p>
                  )}
                  {visit.teamMemberNames && visit.teamMemberNames.length > 0 && (
                    <p className="text-[12px] text-slate-400">Team: {visit.teamMemberNames.join(', ')}</p>
                  )}
                  <p className="text-[12px] text-slate-400 mt-0.5">
                    {visit.rooms.length} room{visit.rooms.length !== 1 ? 's' : ''} · {totalPhotos(visit)} photo{totalPhotos(visit) !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  status.tone === 'good' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {status.label}
                </span>
              </div>
            </div>
          )
        })}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <p className="text-3xl mb-2">📐</p>
            <p className="text-sm">No site visits found</p>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected ? leadName(selected.leadId) : ''} height="full">
        {selected && (() => {
          const l = lead(selected.leadId)
          const status = visitStatus(selected)
          return (
            <div className="space-y-4">
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                status.tone === 'good' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {status.label}
              </span>

              <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5">
                {[
                  { label: 'Client / Lead', value: l?.name ?? selected.leadId },
                  { label: 'Phone',         value: l?.phone ?? '—' },
                  { label: 'Location',      value: l?.city ?? '—' },
                  { label: 'Visit Date',    value: fmtDate(selected.visitDate) },
                  { label: 'Team Members',  value: selected.teamMemberNames && selected.teamMemberNames.length > 0 ? selected.teamMemberNames.join(', ') : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span className="text-xs text-slate-400 font-medium flex-shrink-0">{label}</span>
                    <span className="text-xs font-semibold text-slate-700 text-right">{value}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Rooms</p>
                <div className="space-y-2">
                  {selected.rooms.map(room => (
                    <div key={room.id} className="bg-slate-50 rounded-2xl p-3.5">
                      <p className="text-sm font-bold text-slate-800 mb-1">{room.name}</p>
                      {room.measurements && <p className="text-xs text-slate-600 mb-1">📏 {room.measurements}</p>}
                      {room.notes && <p className="text-xs text-slate-500">{room.notes}</p>}
                      {room.photos && room.photos.length > 0 && (
                        <MultiFileUploadField label="Room Photos" files={room.photos} onChange={() => {}} accept="image/*" uploadButtonLabel="Upload Photo" readOnly />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Checklist</p>
                <div className="bg-white border border-slate-100 rounded-2xl p-3.5 space-y-2">
                  {selected.checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <span className={`text-sm ${item.checked ? 'text-emerald-600' : 'text-slate-300'}`}>{item.checked ? '✓' : '○'}</span>
                      <span className={`text-xs ${item.checked ? 'text-slate-700' : 'text-slate-400'}`}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {selected.notes && (
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-xs text-slate-600">{selected.notes}</p>
                </div>
              )}
            </div>
          )
        })()}
      </BottomSheet>
    </div>
  )
}
