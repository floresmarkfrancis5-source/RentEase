import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'
import Brand from './Brand'
import NotificationBell from './NotificationBell'
import ThemeToggle from './ThemeToggle'

function AccountMenu({ user, onLogout }) {
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
  const roleLabel = user.role === 'superadmin' ? 'Superadmin' : user.role === 'admin' ? 'Landlord' : 'Tenant'
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
          <Link role="menuitem" to={home}>{roleLabel === 'Superadmin' ? 'Platform control' : roleLabel === 'Landlord' ? 'Landlord dashboard' : 'My rent'}</Link>
          <Link role="menuitem" to="/profile">My profile</Link>
          {user.role === 'admin' && <Link role="menuitem" to="/admin/settings">Site settings</Link>}
          <Link role="menuitem" to="/change-password">Change password</Link>
          <button type="button" role="menuitem" className="danger" onClick={onLogout}>Log out</button>
        </div>
      )}
    </div>
  )
}

export default function Header() {
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

  // Transparent over the hero photo (home, at the top of the page); solid header bar everywhere else.
  const onHero = pathname === '/' && top
  const ready = user && !user.must_change_password

  return (
    <header className={`site-header${onHero ? ' on-hero' : ''}`}>
      <div className="wrap">
        <Brand />
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end className="nav-link">Home</NavLink>
          {ready && <NavLink to={user.role === 'superadmin' ? '/superadmin' : user.role === 'admin' ? '/admin' : '/tenant'} className="nav-link">{user.role === 'superadmin' ? 'Platform' : user.role === 'admin' ? 'Dashboard' : 'My rent'}</NavLink>}
          {!user && <NavLink to="/login" className="nav-link">Log in</NavLink>}
          {user && <AccountMenu user={user} onLogout={() => { logout(); navigate('/') }} />}
          {ready && user.role !== 'superadmin' && <NotificationBell user={user} />}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}
