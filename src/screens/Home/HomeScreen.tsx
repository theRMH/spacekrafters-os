import { useAuth } from '../../context/AuthContext'
import { getRoleDisplayLabel } from '../../data/permissions'

export default function HomeScreen() {
  const { user } = useAuth()

  return (
    <div className="p-4 pb-24 lg:pb-8">
      <h1 className="text-xl font-extrabold text-slate-800">
        Welcome, {user?.name ?? 'there'}
      </h1>
      <p className="text-sm text-slate-500 mt-1">
        {user ? getRoleDisplayLabel(user.role, user.displayRole) : ''}
      </p>
    </div>
  )
}
