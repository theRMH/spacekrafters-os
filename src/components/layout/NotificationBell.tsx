import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from '../../services/notificationService'
import type { AppNotification } from '../../types'

const POLL_MS = 30000

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    setItems(await getMyNotifications())
  }

  useEffect(() => {
    if (!user) return
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handleOpen(n: AppNotification) {
    setOpen(false)
    if (!n.readAt) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      markNotificationRead(n.id)
    }
    if (n.url) navigate(n.url)
  }

  function handleMarkRead(e: ReactMouseEvent, n: AppNotification) {
    e.stopPropagation()
    setItems(prev => prev.map(x => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
    markNotificationRead(n.id)
  }

  function handleMarkAllRead() {
    setItems(prev => prev.map(x => (x.readAt ? x : { ...x, readAt: new Date().toISOString() })))
    markAllNotificationsRead()
  }

  if (!user) return null
  const unreadCount = items.filter(n => !n.readAt).length

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-full flex items-center justify-center active:bg-slate-100"
      >
        <Bell size={19} className="text-slate-600" strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 max-w-[90vw] max-h-96 overflow-y-auto bg-white rounded-2xl shadow-card border border-slate-200 z-40">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-[11px] font-bold text-indigo-600 active:opacity-70 shrink-0">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No notifications yet.</p>
          )}
          {items.map(n => (
            <div
              key={n.id}
              role="button" tabIndex={0}
              onClick={() => handleOpen(n)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleOpen(n) }}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 last:border-b-0 active:bg-slate-50 cursor-pointer ${!n.readAt ? 'bg-blue-50/50' : ''}`}
            >
              <div className="flex items-start gap-2">
                {!n.readAt && <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />}
                <div className={`flex-1 min-w-0 ${n.readAt ? 'pl-4' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm break-words ${!n.readAt ? 'font-bold text-slate-800' : 'font-semibold text-slate-600'}`}>{n.title}</p>
                    {!n.readAt && (
                      <button onClick={e => handleMarkRead(e, n)} aria-label="Mark as read"
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 active:bg-slate-100">
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 break-words">{n.body}</p>
                  <p className="text-[12px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
