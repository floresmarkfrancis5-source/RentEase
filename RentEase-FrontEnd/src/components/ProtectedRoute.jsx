import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** role = 'superadmin' | 'admin' | 'tenant' | undefined (any signed-in user). */
export default function ProtectedRoute({ children, role }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (user.role === 'admin' && user.onboarding_completed === false && loc.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }
  if (user.must_change_password && loc.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  if (role && user.role !== role) return <Navigate to={home(user)} replace />
  return children
}

export const home = (u) => (u?.role === 'superadmin' ? '/superadmin' : u?.role === 'admin' ? '/admin' : '/tenant')
