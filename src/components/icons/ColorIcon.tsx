import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'

interface Props {
  icon: ComponentType<LucideProps>
  color: string      // Tailwind text color e.g. 'text-blue-600'
  bg: string         // Tailwind bg color e.g. 'bg-blue-100'
  size?: number      // icon size, default 20
  className?: string
  strokeWidth?: number
}

export function ColorIcon({ icon: Icon, color, bg, size = 20, className = '', strokeWidth = 2 }: Props) {
  return (
    <div className={`rounded-2xl flex items-center justify-center flex-shrink-0 ${bg} ${className}`}>
      <Icon size={size} className={color} strokeWidth={strokeWidth} aria-hidden="true" />
    </div>
  )
}
