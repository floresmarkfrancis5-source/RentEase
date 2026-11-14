import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import Brand from './Brand'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'
import LanguagePicker from './LanguagePicker'
import { useLanguage } from '../context/LanguageContext'

function AccountMenu({ user, onLogout }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const loc = useLocation()

  useEffect(() => setOpen(false), [loc.pathname])
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const home = user.role === 'superadmin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/tenant'
  const roleLabel = t(user.role === 'superadmin' ? 'Superadmin' : user.role === 'admin' ? 'Landlord' : 'Tenant')
  return (
    <div className="acct" ref={box}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar user={user} />
        <span className="acct-name">{user.full_name || user.username}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-head">
            <Avatar user={user} large />
            <div>
              <b>{user.full_name || user.username}</b>
              <small>{user.email}</small>
              <small className="acct-role">{roleLabel} · @{user.username}</small>
            </div>
          </div>
          <Link role="menuitem" to={home}>{t(user.role === 'superadmin' ? 'Platform control' : user.role === 'admin' ? 'Landlord dashboard' : 'My rent')}</Link>
          <Link role="menuitem" to="/profile">{t('My profile')}</Link>
          {user.role === 'admin' && <Link role="menuitem" to="/admin/settings">{t('Site settings')}</Link>}
          <Link role="menuitem" to="/change-password">{t('Change password')}</Link>
          <button type="button" role="menuitem" className="danger" onClick={onLogout}>{t('Log out')}</button>
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const { t } = useLanguage()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [top, setTop] = useState(() => window.scrollY < 60)

  useEffect(() => {
    const on = () => setTop(window.scrollY < 60)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [pathname])

  // Transparent over full-bleed photo backgrounds while the page is at the top.
  const onHero = (pathname === '/' || pathname === '/onboarding') && top
  const ready = user && !user.must_change_password
  const isDashboard = pathname.startsWith('/admin') || pathname.startsWith('/tenant') || pathname.startsWith('/superadmin')

  return (
    <header className={`site-header${onHero ? ' on-hero' : ''}${isDashboard ? ' site-header--dashboard' : ''}${ready ? ' site-header--authenticated' : ''}`}>
      <div className="wrap">
        <Brand />
        <nav className="nav" aria-label={t('Main navigation')}>
          <NavLink to="/" end className="nav-link">{t('Home')}</NavLink>
          {ready && <NavLink to={user.role === 'superadmin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/tenant'} className="nav-link">{t(user.role === 'superadmin' ? 'Platform' : user.role === 'admin' ? 'Dashboard' : 'My rent')}</NavLink>}
          {!user && <NavLink to="/login" className="nav-link">{t('Log in')}</NavLink>}
          {user && <AccountMenu user={user} onLogout={() => { logout(); navigate('/') }} />}
          <LanguagePicker />
          {ready && user.role !== 'superadmin' && <NotificationBell user={user} />}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
