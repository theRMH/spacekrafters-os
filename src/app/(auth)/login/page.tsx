'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#1a2236' }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center w-full max-w-[180px] h-16 rounded-xl mb-4 p-3" style={{ backgroundColor: '#1a2236' }}>
              <Image src="/logo.webp" alt="Spacekrafters" width={150} height={48} className="object-contain" priority />
            </div>
            <p className="text-slate-500 text-sm">Operations Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                style={{ '--tw-ring-color': '#1a2236' } as React.CSSProperties}
                placeholder="you@spacekrafters.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input id="password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent transition"
                placeholder="••••••••" />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60"
              style={{ backgroundColor: loading ? '#2d3c5e' : '#1a2236' }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#64748b' }}>
          Spacekrafters Operations Management System &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
