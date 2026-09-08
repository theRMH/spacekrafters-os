import type { ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'
import type { Permission } from '../../types'

interface PermissionGateProps {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Renders children only if the current user has the given permission.
 * Use this to hide action buttons, forms, or sections from restricted users.
 */
export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const { can } = useAuth()
  if (!can(permission)) return <>{fallback}</>
  return <>{children}</>
}
