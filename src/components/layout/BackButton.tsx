import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function BackButton() {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(-1)}
      className="w-9 h-9 flex items-center justify-center rounded-xl active:bg-slate-100 flex-shrink-0"
    >
      <ArrowLeft size={20} className="text-slate-700" strokeWidth={2.5} />
    </button>
  )
}
