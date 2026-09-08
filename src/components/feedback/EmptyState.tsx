import { Inbox, type LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

interface Props {
  icon?: ComponentType<LucideProps>
  title?: string
  message?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  message = 'No items to show right now.',
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Icon size={36} className="text-slate-400" strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed max-w-[240px]">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 bg-blue-600 text-white text-sm font-semibold px-6 min-h-[44px] rounded-xl active:bg-blue-700 transition-colors duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3" aria-busy="true" aria-label={message}>
      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  )
}
