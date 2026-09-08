import { ArrowRight } from 'lucide-react'

interface Props {
  title: string
  description: string
  onClick?: () => void
}

export function SuggestionCard({ title, description, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-blue-600 rounded-2xl p-4 flex items-center gap-4 active:bg-blue-700 text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-blue-200 mb-1 uppercase tracking-wider">{title}</p>
        <p className="text-sm font-semibold text-white leading-snug">{description}</p>
      </div>
      <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
        <ArrowRight size={18} className="text-white" />
      </div>
    </button>
  )
}
