import { ShieldOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function NoPermission() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <ShieldOff size={32} className="text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">You cannot open this page</h2>
      <p className="text-sm text-slate-500 mb-6">You do not have permission to view this page.</p>
      <button
        onClick={() => navigate('/home')}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl active:bg-blue-700"
      >
        Go to Task
      </button>
    </div>
  )
}
