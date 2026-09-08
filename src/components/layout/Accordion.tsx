import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface AccordionItem {
  id: string
  title: string
  subtitle?: string
  badge?: string
  badgeColor?: string
  children: React.ReactNode
}

interface Props {
  items: AccordionItem[]
  defaultOpen?: string
  className?: string
}

export function Accordion({ items, defaultOpen, className = '' }: Props) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen ?? null)

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map(item => {
        const isOpen = openId === item.id
        return (
          <div key={item.id} className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : item.id)}
              className="w-full flex items-center gap-3 p-4 active:bg-slate-50"
            >
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                  {item.badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.badgeColor ?? 'bg-indigo-50 text-indigo-600'}`}>
                      {item.badge}
                    </span>
                  )}
                </div>
                {item.subtitle && <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>}
              </div>
              <ChevronDown
                size={16}
                className={`text-slate-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 px-4 pb-4 pt-3 animate-fade-in">
                {item.children}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
