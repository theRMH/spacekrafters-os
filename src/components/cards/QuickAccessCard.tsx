import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'

interface Props {
  icon: ComponentType<LucideProps>
  iconColor: string
  iconBg: string
  label: string
  onClick?: () => void
}

export function QuickAccessCard({ icon: Icon, iconColor, iconBg, label, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-slate-100 shadow-sm active:bg-slate-50 active:scale-95 transition-all duration-150 min-h-[80px] justify-center"
    >
      <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center`}>
        <Icon size={20} className={iconColor} strokeWidth={2} aria-hidden="true" />
      </div>
      <span className="text-[11px] font-semibold text-slate-600 text-center leading-tight">{label}</span>
    </button>
  )
}
