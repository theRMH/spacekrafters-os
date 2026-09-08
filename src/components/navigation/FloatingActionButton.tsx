import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  onClick: () => void
  icon?: ReactNode
  label?: string
  bottom?: string
}

export function FloatingActionButton({ onClick, icon, label, bottom = 'bottom-24' }: Props) {
  return (
    <button
      onClick={onClick}
      className={`fixed right-4 ${bottom} z-30 flex items-center gap-2 rounded-2xl shadow-fab active:scale-95 transition-transform`}
      style={{ background: '#9DCD3A', color: '#065F2D', padding: label ? '12px 20px' : '14px' }}
    >
      {icon ?? <Plus size={22} strokeWidth={2.5} />}
      {label && <span className="text-sm font-semibold">{label}</span>}
    </button>
  )
}
