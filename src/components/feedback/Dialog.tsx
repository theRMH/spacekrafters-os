import { useState } from 'react'
import { X, AlertTriangle, CheckCircle2, Info, Loader } from 'lucide-react'
import { createPortal } from 'react-dom'

type Variant = 'default' | 'danger' | 'success' | 'info'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  message?: string
  variant?: Variant
  confirmLabel?: string
  cancelLabel?: string
  confirmDisabled?: boolean
  onConfirm?: () => void | Promise<void>
  children?: React.ReactNode
}

const VARIANT_CONFIG: Record<Variant, { icon: React.ReactNode; iconBg: string; confirmBtn: string }> = {
  default: { icon: null, iconBg: '', confirmBtn: 'bg-indigo-600 active:bg-indigo-700' },
  danger:  { icon: <AlertTriangle size={22} className="text-red-500" />, iconBg: 'bg-red-50',    confirmBtn: 'bg-red-600 active:bg-red-700'     },
  success: { icon: <CheckCircle2 size={22} className="text-emerald-500" />, iconBg: 'bg-emerald-50', confirmBtn: 'bg-emerald-600 active:bg-emerald-700' },
  info:    { icon: <Info size={22} className="text-blue-500" />, iconBg: 'bg-blue-50',  confirmBtn: 'bg-blue-600 active:bg-blue-700'   },
}

export function Dialog({ isOpen, onClose, title, message, variant = 'default', confirmLabel = 'Confirm', cancelLabel = 'Cancel', confirmDisabled = false, onConfirm, children }: Props) {
  const [isConfirming, setIsConfirming] = useState(false)
  if (!isOpen) return null
  const cfg = VARIANT_CONFIG[variant]

  // onConfirm is often async (e.g. a delete that cascades through several
  // network calls) — closing the dialog immediately on click gave no
  // feedback that anything was happening, so a slow delete looked like it
  // had silently failed even though it went on to succeed a moment later.
  // Wait for it to settle (showing a spinner) before dismissing.
  async function handleConfirm() {
    if (!onConfirm || isConfirming) return
    setIsConfirming(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsConfirming(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={isConfirming ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-sheet w-full max-w-[320px] animate-fade-in">
        <div className="p-5">
          {/* Icon */}
          {cfg.icon && (
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${cfg.iconBg}`}>
              {cfg.icon}
            </div>
          )}
          {/* Close */}
          <button onClick={onClose} disabled={isConfirming} className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none">
            <X size={14} className="text-slate-500" />
          </button>

          <h3 className="text-base font-bold text-slate-800 mb-1">{title}</h3>
          {message && <p className="text-sm text-slate-500 leading-relaxed">{message}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose} disabled={isConfirming} className="flex-1 bg-slate-100 text-slate-700 rounded-xl py-3 text-sm font-semibold active:bg-slate-200 disabled:opacity-40 disabled:pointer-events-none">
            {cancelLabel}
          </button>
          {onConfirm && (
            <button
              onClick={handleConfirm}
              disabled={confirmDisabled || isConfirming}
              className={`flex-1 flex items-center justify-center gap-2 text-white rounded-xl py-3 text-sm font-semibold ${cfg.confirmBtn} ${confirmDisabled || isConfirming ? 'opacity-40 pointer-events-none' : ''}`}>
              {isConfirming && <Loader size={14} className="animate-spin" />}
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
