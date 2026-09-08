interface Chip<T extends string> {
  value: T
  label: string
  count?: number
}

interface Props<T extends string> {
  chips: Chip<T>[]
  active: T
  onChange: (v: T) => void
  className?: string
}

export function FilterChips<T extends string>({ chips, active, onChange, className = '' }: Props<T>) {
  return (
    <div className={`flex gap-2 overflow-x-auto scrollbar-hide pb-1 ${className}`}>
      {chips.map(chip => {
        const isActive = chip.value === active
        return (
          <button
            key={chip.value}
            onClick={() => onChange(chip.value)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-semibold transition-colors active:scale-95 ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span className={`text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {chip.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
