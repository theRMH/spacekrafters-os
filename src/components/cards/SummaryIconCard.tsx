import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import { ChevronRight } from 'lucide-react'

interface Props {
  icon: ComponentType<LucideProps>
  iconColor: string
  iconBg: string
  bgClass?: string   // e.g. 'bg-gradient-to-br from-purple-50 to-purple-100'
  title: string
  value: string | number
  description?: string
  onClick?: () => void
}

export function SummaryIconCard({ icon: Icon, iconColor, iconBg, bgClass = 'bg-white', title, value, description, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-full ${bgClass} rounded-2xl border border-slate-100 p-4 text-left shadow-sm active:opacity-80 transition-opacity`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon size={19} className={iconColor} strokeWidth={2} aria-hidden="true" />
        </div>
        {onClick && <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" aria-hidden="true" />}
      </div>
      <p className="text-2xl font-extrabold text-slate-800 mt-3 leading-none">{value}</p>
      <p className={`text-xs font-bold mt-1 ${iconColor}`}>{title}</p>
      {description && <p className="text-[11px] text-slate-400 mt-0.5">{description}</p>}
    </button>
  )
}
