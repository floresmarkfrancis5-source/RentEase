import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'

export default function Footer() {
  const { settings } = useSettings()
  const { user } = useAuth()
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>© {new Date().getFullYear()} {settings.site_name} · {settings.footer_text}</span>
        <Link to={user ? (user.role === 'superadmin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/tenant') : '/login'}>{user ? 'My account' : 'Log in'}</Link>
      </div>
    </footer>
  )
}
