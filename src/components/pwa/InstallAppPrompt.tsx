import { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || hidden) return null

  async function handleInstall() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
    setHidden(true)
  }

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[400] bg-white border border-green-200 rounded-2xl shadow-xl p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white border border-green-100 flex items-center justify-center p-1">
        <img src="/brand/fenster-logo.png" alt="Fenster" className="w-full object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 leading-tight">Install Fenster</p>
        <p className="text-[11px] text-slate-500 mt-0.5">Use this app faster from your home screen.</p>
      </div>
      <button type="button" onClick={handleInstall}
        className="px-3 py-1.5 text-xs font-bold rounded-lg flex-shrink-0 active:opacity-80"
        style={{ background: '#9DCD3A', color: '#065F2D' }}>
        Install
      </button>
      <button type="button" onClick={() => setHidden(true)}
        className="w-6 h-6 flex items-center justify-center text-slate-400 flex-shrink-0 active:opacity-70">
        <X size={13} />
      </button>
    </div>
  )
}
