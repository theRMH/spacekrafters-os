import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDefaultRoute } from '../../utils/permissions'

export default function LoginScreen() {
  const { loginWithCredentials, isAuthReady } = useAuth()
  const navigate = useNavigate()

  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!phone.trim())      { setError('Please enter your phone number.'); return }
    if (phone.length !== 10) { setError('Enter a valid 10-digit phone number.'); return }
    if (!password)          { setError('Please enter your password.'); return }
    setLoading(true)
    const result = await loginWithCredentials(phone, password)
    setLoading(false)
    if (!result.success) {
      setError(result.error ?? 'Invalid phone number or password.')
      return
    }
    navigate(result.role ? getDefaultRoute(result.role) : '/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-14 pb-10 text-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #081B32 0%, #0F2A4A 60%, #1a3f6b 100%)' }}>
        <div className="flex items-center justify-center mb-5">
          <img
            src="/brand/spacekrafters-logo.png"
            alt="SpaceKrafters"
            className="object-contain"
            style={{ height: 64, maxWidth: 240 }}
          />
        </div>
        <p className="text-[#C9A24B] text-sm mt-1">Operating System</p>
      </div>

      {/* Form */}
      <div className="flex-1 bg-white rounded-t-3xl -mt-5 px-5 pt-8 pb-10">
        <h2 className="text-xl font-extrabold text-slate-800 mb-1">Welcome back</h2>
        <p className="text-sm text-slate-500 mb-6">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div>
            <label htmlFor="login-phone" className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Phone Number</label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 flex items-center gap-1.5 pointer-events-none">
                <Phone size={16} className="text-slate-400" />
                <span className="text-sm font-semibold text-slate-500">+91</span>
              </div>
              <input
                id="login-phone"
                type="tel" inputMode="numeric" autoComplete="tel" autoFocus
                maxLength={10}
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError('') }}
                placeholder="10-digit number"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pl-[4.75rem] pr-4 py-3.5 text-sm focus:outline-none focus:border-[#0F2A4A] transition-colors"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block">Password</label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <Lock size={16} className="text-slate-400" />
              </div>
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'} autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Enter your password"
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pl-10 pr-12 py-3.5 text-sm focus:outline-none focus:border-[#0F2A4A] transition-colors"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 active:text-slate-600">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-red-600">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading || !isAuthReady}
            className="w-full flex items-center justify-center text-white rounded-xl font-bold text-base min-h-[52px] transition-colors mt-1 disabled:opacity-70 active:opacity-90"
            style={{ background: '#C9A24B' }}>
            {loading || !isAuthReady
              ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : 'Login to SpaceKrafters OS'}
          </button>
        </form>
      </div>
    </div>
  )
}
