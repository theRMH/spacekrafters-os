interface Props { rows?: number; className?: string }

export function LoadingSkeleton({ rows = 3, className = '' }: Props) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-2.5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-slate-200 rounded-full w-3/4" />
              <div className="h-3 bg-slate-100 rounded-full w-1/2" />
            </div>
          </div>
          <div className="h-2 bg-slate-100 rounded-full" />
        </div>
      ))}
    </div>
  )
}
