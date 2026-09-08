import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useEffect } from 'react'

type SnackType = 'success' | 'error' | 'info'

interface Props {
  isOpen: boolean
  message: string
  type?: SnackType
  onClose: () => void
  duration?: number
}

const TYPE_CONFIG: Record<SnackType, { bg: string; icon: React.ReactNode }> = {
  success: { bg: 'bg-emerald-600', icon: <CheckCircle2 size={16} className="text-white" /> },
  error:   { bg: 'bg-red-600',     icon: <AlertCircle size={16} className="text-white" />  },
  info:    { bg: 'bg-indigo-600',  icon: <CheckCircle2 size={16} className="text-white" /> },
}

export function Snackbar({ isOpen, message, type = 'success', onClose, duration = 3000 }: Props) {
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [isOpen, duration, onClose])

  if (!isOpen) return null
  const cfg = TYPE_CONFIG[type]

  return (
    <div className={`fixed bottom-24 left-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl text-white shadow-fab animate-snack-in ${cfg.bg}`}>
      {cfg.icon}
      <span className="flex-1 text-sm font-medium">{message}</span>
      <button onClick={onClose} className="flex-shrink-0 opacity-70 active:opacity-100">
        <X size={15} />
      </button>
    </div>
  )
}
