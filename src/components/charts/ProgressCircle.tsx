interface Props {
  percent: number
  size?: number        // default 80
  strokeWidth?: number // default 9
  dark?: boolean       // true when inside dark/blue card
  label?: string
}

// Color thresholds per spec — cyan for 61-85 so it's visible on both light and dark
function ringColor(p: number): string {
  if (p <= 30)  return '#ef4444'  // red-500
  if (p <= 60)  return '#f97316'  // orange-500
  if (p <= 85)  return '#22d3ee'  // cyan-400 — visible on dark AND light
  return '#10b981'                 // emerald-500
}

export function ProgressCircle({
  percent,
  size       = 80,
  strokeWidth = 9,
  dark       = false,
  label: _label,
}: Props) {
  const r      = (size - strokeWidth * 2) / 2
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(Math.max(percent, 0), 100) / 100)
  const color  = ringColor(percent)

  const trackStroke   = dark ? 'rgba(255,255,255,0.22)' : '#e2e8f0'
  const centerBg      = dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.9)'
  const textColor     = dark ? '#ffffff' : color

  const innerR = size / 2 - strokeWidth - 2   // small circle inside ring for contrast

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* Track ring */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={trackStroke}
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Inner circle for center background (contrast) */}
        <circle
          cx={size / 2} cy={size / 2} r={innerR}
          fill={centerBg}
        />
      </svg>
      <span
        className="absolute font-extrabold leading-none"
        style={{
          color: textColor,
          fontSize: size >= 72 ? '14px' : '11px',
          letterSpacing: '-0.5px',
        }}
      >
        {percent}%
      </span>
    </div>
  )
}
