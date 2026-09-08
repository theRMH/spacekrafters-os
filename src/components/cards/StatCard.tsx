import type { ReactNode } from 'react'

interface Props {
  value: string | number
  label: string
  icon?: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

const STYLES = {
  default: { bg: 'bg-blue-50',    value: 'text-blue-700',    icon: 'bg-blue-100'     },
  success: { bg: 'bg-emerald-50', value: 'text-emerald-700', icon: 'bg-emerald-100'  },
  warning: { bg: 'bg-amber-50',   value: 'text-amber-700',   icon: 'bg-amber-100'    },
  danger:  { bg: 'bg-red-50',     value: 'text-red-700',     icon: 'bg-red-100'      },
}

export function StatCard({ value, label, icon, variant = 'default' }: Props) {
  const styles = STYLES[variant]

  return (
    <div className={`${styles.bg} rounded-2xl p-4 flex-1`}>
      {icon && (
        <div className={`w-9 h-9 ${styles.icon} rounded-xl flex items-center justify-center mb-2.5`}>
          {icon}
        </div>
      )}
      <p className={`text-2xl font-extrabold ${styles.value}`}>{value}</p>
      <p className="text-xs text-slate-500 font-medium mt-1 leading-snug">{label}</p>
    </div>
  )
}
