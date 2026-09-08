import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { canAccessScreen } from '../../utils/permissions'
import { NoPermission } from './NoPermission'

interface ProtectedRouteProps {
  children: React.ReactNode
  screenPath: string
}

export function ProtectedRoute({ children, screenPath }: ProtectedRouteProps) {
  const { user, isLoggedIn } = useAuth()

  if (!isLoggedIn) return <Navigate to="/login" replace />

  if (!canAccessScreen(user!.roles ?? user!.role, screenPath)) {
    return <NoPermission />
  }

  return <>{children}</>
}
