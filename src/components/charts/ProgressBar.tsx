interface Props {
  percent: number
  height?: number      // px, default 8
  label?: string
  showLabel?: boolean
}

export function ProgressBar({ percent, height = 8, label, showLabel = true }: Props) {
  const color = percent <= 30 ? 'bg-red-500'
    : percent <= 60 ? 'bg-orange-500'
    : percent <= 85 ? 'bg-blue-500'
    : 'bg-emerald-500'

  const textColor = percent <= 30 ? 'text-red-600'
    : percent <= 60 ? 'text-orange-600'
    : percent <= 85 ? 'text-blue-600'
    : 'text-emerald-600'

  return (
    <div>
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-slate-500">{label ?? 'Completion'}</span>
          <span className={`text-xs font-extrabold ${textColor}`}>{percent}%</span>
        </div>
      )}
      <div className="bg-slate-100 rounded-full overflow-hidden" style={{ height }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  )
}
