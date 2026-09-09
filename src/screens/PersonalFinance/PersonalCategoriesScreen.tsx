import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { AppHeader } from '../../components/layout/AppHeader'
import { BottomSheet } from '../../components/feedback/BottomSheet'
import { Snackbar } from '../../components/feedback/Snackbar'
import { Dialog } from '../../components/feedback/Dialog'
import {
  getAllPersonalCategories, upsertPersonalCategory, deletePersonalCategory,
  getAllPersonalSubcategories, upsertPersonalSubcategory, deletePersonalSubcategory,
} from '../../services/personalFinanceService'
import { addAuditLog } from '../../services/auditLogService'
import type { PersonalCategory, PersonalSubcategory } from '../../types'

function emptyCategory(): PersonalCategory {
  return { id: `pcat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, groupName: '', name: '', code: '', createdAt: new Date().toISOString() }
}

function emptySubcategory(categoryId: string): PersonalSubcategory {
  return { id: `psub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, categoryId, name: '', createdAt: new Date().toISOString() }
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400'
const label = 'block text-xs font-semibold text-slate-500 mb-1'

export default function PersonalCategoriesScreen() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<PersonalCategory[]>([])
  const [subcategories, setSubcategories] = useState<PersonalSubcategory[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [selected, setSelected] = useState<PersonalCategory | null>(null)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [categoryForm, setCategoryForm] = useState<PersonalCategory>(emptyCategory())
  const [showSubForm, setShowSubForm] = useState(false)
  const [subForm, setSubForm] = useState<PersonalSubcategory>(emptySubcategory(''))
  const [showDeleteCategoryDialog, setShowDeleteCategoryDialog] = useState(false)
  const [deleteSubTarget, setDeleteSubTarget] = useState<PersonalSubcategory | null>(null)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [c, s] = await Promise.all([getAllPersonalCategories(), getAllPersonalSubcategories()])
      setCategories(c); setSubcategories(s)
      setIsLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (selected) {
      const fresh = categories.find(c => c.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [categories])

  function openCreateCategory() {
    setCategoryForm(emptyCategory())
    setShowCategoryForm(true)
  }

  async function handleSaveCategory() {
    if (!categoryForm.groupName.trim() || !categoryForm.name.trim()) {
      setSnack({ open: true, msg: 'Group and name are required.', type: 'error' })
      return
    }
    const result = await upsertPersonalCategory(categoryForm)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save category.', type: 'error' })
      return
    }
    setCategories(prev => {
      const exists = prev.some(c => c.id === categoryForm.id)
      return exists ? prev.map(c => (c.id === categoryForm.id ? categoryForm : c)) : [categoryForm, ...prev]
    })
    setShowCategoryForm(false)
    setSnack({ open: true, msg: 'Category saved.', type: 'success' })
  }

  function openAddSubcategory() {
    if (!selected) return
    setSubForm(emptySubcategory(selected.id))
    setShowSubForm(true)
  }

  async function handleSaveSubcategory() {
    if (!subForm.name.trim()) {
      setSnack({ open: true, msg: 'Subcategory name is required.', type: 'error' })
      return
    }
    const result = await upsertPersonalSubcategory(subForm)
    if (!result.ok) {
      setSnack({ open: true, msg: result.error ?? 'Failed to save subcategory.', type: 'error' })
      return
    }
    setSubcategories(prev => {
      const exists = prev.some(s => s.id === subForm.id)
      return exists ? prev.map(s => (s.id === subForm.id ? subForm : s)) : [subForm, ...prev]
    })
    setShowSubForm(false)
    setSnack({ open: true, msg: 'Subcategory saved.', type: 'success' })
  }

  async function confirmDeleteCategory() {
    if (!selected) return
    const result = await deletePersonalCategory(selected.id)
    setShowDeleteCategoryDialog(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete category.', type: 'error' }); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_category_deleted',
        description: `Personal category "${selected.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setCategories(prev => prev.filter(c => c.id !== selected.id))
    setSelected(null)
    setSnack({ open: true, msg: 'Category deleted.', type: 'success' })
  }

  async function confirmDeleteSubcategory() {
    if (!deleteSubTarget) return
    const result = await deletePersonalSubcategory(deleteSubTarget.id)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not delete subcategory.', type: 'error' }); setDeleteSubTarget(null); return }
    if (user) {
      addAuditLog({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        action: 'personal_subcategory_deleted',
        description: `Personal subcategory "${deleteSubTarget.name}" deleted.`,
        createdBy: user.name,
        createdByRole: user.role,
        createdAt: new Date().toISOString(),
      })
    }
    setSubcategories(prev => prev.filter(s => s.id !== deleteSubTarget.id))
    setDeleteSubTarget(null)
    setSnack({ open: true, msg: 'Subcategory deleted.', type: 'success' })
  }

  const selSubcategories = selected ? subcategories.filter(s => s.categoryId === selected.id) : []

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />
      <div className="bg-white px-5 pt-4 pb-4 border-b border-slate-100 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-extrabold text-slate-800">Personal Categories</h1>
          <button onClick={openCreateCategory} aria-label="Add category"
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-fab active:opacity-90"
            style={{ background: '#0F2A4A' }}>
            <Plus size={19} className="text-white" strokeWidth={2.5} />
          </button>
        </div>
        <p className="text-xs text-slate-400">Categories and subcategories used across Personal Finance.</p>
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {!isLoading && categories.map(category => (
          <button key={category.id} onClick={() => setSelected(category)}
            className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:bg-slate-50">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-sm text-slate-800">{category.name}</p>
                <p className="text-[11px] text-slate-400">{category.groupName}</p>
              </div>
              {category.code && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{category.code}</span>
              )}
            </div>
          </button>
        ))}
        {!isLoading && categories.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-16">No categories yet.</p>
        )}
      </div>

      {/* Create category */}
      <BottomSheet isOpen={showCategoryForm} onClose={() => setShowCategoryForm(false)} title="New Category">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Group *</label>
            <input className={inp} value={categoryForm.groupName} onChange={e => setCategoryForm(f => ({ ...f, groupName: e.target.value }))} placeholder="e.g. Household, Investments" />
          </div>
          <div>
            <label className={label}>Name *</label>
            <input className={inp} value={categoryForm.name} onChange={e => setCategoryForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Groceries" />
          </div>
          <button onClick={handleSaveCategory} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Category
          </button>
        </div>
      </BottomSheet>

      {/* Category detail: subcategories */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''} height="full">
        {selected && (
          <div className="space-y-4 pb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Subcategories</h3>
              <button onClick={openAddSubcategory} className="text-xs font-semibold text-indigo-600">+ Add</button>
            </div>
            <div className="space-y-2">
              {selSubcategories.length === 0 && <p className="text-sm text-slate-400 text-center py-10">No subcategories yet.</p>}
              {selSubcategories.map(s => (
                <div key={s.id} className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                  {user?.role === 'owner' && (
                    <button onClick={() => setDeleteSubTarget(s)} className="text-xs font-semibold text-red-500">Delete</button>
                  )}
                </div>
              ))}
            </div>
            {user?.role === 'owner' && (
              <button onClick={() => setShowDeleteCategoryDialog(true)}
                className="w-full text-center text-xs font-semibold text-red-500 py-2">
                Delete Category
              </button>
            )}
          </div>
        )}
      </BottomSheet>

      {/* Add subcategory */}
      <BottomSheet isOpen={showSubForm} onClose={() => setShowSubForm(false)} title="New Subcategory">
        <div className="space-y-4 pb-4">
          <div>
            <label className={label}>Name *</label>
            <input className={inp} value={subForm.name} onChange={e => setSubForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <button onClick={handleSaveSubcategory} className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700">
            Save Subcategory
          </button>
        </div>
      </BottomSheet>

      <Dialog
        isOpen={showDeleteCategoryDialog}
        onClose={() => setShowDeleteCategoryDialog(false)}
        title="Delete Category"
        message="Are you sure you want to delete this category? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteCategory}
        variant="danger"
      />

      <Dialog
        isOpen={!!deleteSubTarget}
        onClose={() => setDeleteSubTarget(null)}
        title="Delete Subcategory"
        message="Are you sure you want to delete this subcategory? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteSubcategory}
        variant="danger"
      />

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
