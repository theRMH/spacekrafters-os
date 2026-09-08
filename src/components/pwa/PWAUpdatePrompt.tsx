import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

export function PWAUpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[400] bg-slate-800 text-white rounded-2xl shadow-xl p-3.5 flex items-center gap-3">
      <RefreshCw size={16} className="text-blue-400 flex-shrink-0" />
      <p className="text-sm flex-1 font-medium">New update available</p>
      <button type="button" onClick={() => updateServiceWorker(true)}
        className="px-3 py-1.5 text-xs font-bold rounded-lg flex-shrink-0 active:opacity-80"
        style={{ background: '#9DCD3A', color: '#065F2D' }}>
        Update App
      </button>
    </div>
  )
}
