interface CircularProgressProps {
  percent: number
  hasIssue?: boolean
  delayDays?: number
  size?: number
}

export default function CircularProgress({ percent, hasIssue, delayDays, size = 80 }: CircularProgressProps) {
  const r = (size - 8) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference - (percent / 100) * circumference
  const color = hasIssue ? '#ef4444' : percent === 100 ? '#22c55e' : '#3b82f6'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-sm font-bold text-slate-800">{percent}%</span>
        {delayDays && delayDays > 0 && (
          <span className="text-xs text-red-500">-{delayDays}d</span>
        )}
      </div>
    </div>
  )
}
