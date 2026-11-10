import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { assetUrl } from '../lib/brand'
import { api } from '../lib/api'
import Avatar from './Avatar'
import BrandMark from './BrandMark'
import { useLanguage } from '../context/LanguageContext'
import { LoadingHouse } from './ui'

const AssistantPage = lazy(() => import('../pages/admin/Assistant'))

// ─── Icons for each nav item ──────────────────────────────────────────────────
const ICONS = {
  Dashboard: <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  Properties: <svg viewBox="0 0 24 24"><rect x="2" y="7" width="9" height="14" /><rect x="13" y="3" width="9" height="18" /></svg>,
  Units: <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><line x1="9" y1="22" x2="9" y2="12" /><line x1="15" y1="22" x2="15" y2="12" /></svg>,
  Tenants: <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
  Leases: <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>,
  Bills: <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
  Payments: <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  Maintenance: <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  'Transfer requests': <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
  'Transfer & move-in requests': <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
  Assistant: <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  Settings: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  Overview: <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  'My bills': <svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
  Repairs: <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  'Unit transfer': <svg viewBox="0 0 24 24"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>,
}

const ADMIN_LINKS = [
  ['/admin', 'Dashboard', true],
  ['/admin/properties', 'Properties'],
  ['/admin/units', 'Units'],
  ['/admin/tenants', 'Tenants'],
  ['/admin/leases', 'Leases'],
  ['/admin/bills', 'Bills'],
  ['/admin/payments', 'Payments'],
  ['/admin/maintenance', 'Maintenance'],
  ['/admin/transfers', 'Transfer & move-in requests'],
  ['/admin/assistant', 'Assistant'],
  ['/admin/settings', 'Settings'],
]
const TENANT_LINKS = [
  ['/tenant', 'Overview', true],
  ['/tenant/bills', 'My bills'],
  ['/tenant/maintenance', 'Repairs'],
  ['/tenant/transfers', 'Unit transfer'],
]
const ADMIN_SECTIONS = [
  ['/admin/leases', 'leases'],
  ['/admin/bills', 'bills'],
  ['/admin/payments', 'payments'],
  ['/admin/maintenance', 'maintenance'],
  ['/admin/transfers', 'transfers'],
]

// Context so children can trigger the assistant panel
export const AssistantCtx = createContext({ open: false, setOpen: () => { } })
export const useAssistant = () => useContext(AssistantCtx)

export default function DashLayout({ role }) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('rentease_dash_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantExpanded, setAssistantExpanded] = useState(false)
  const [assistantDraftHandoff, setAssistantDraftHandoff] = useState(null)
  const [sidebarCounts, setSidebarCounts] = useState({})
  const [sidebarCountError, setSidebarCountError] = useState('')
  const sidebarCountRequest = useRef(0)
  const loc = useLocation()

  // Close mobile sidebar on navigation
  useEffect(() => {
    setMobileOpen(false)
    if (loc.pathname === '/admin/assistant') setAssistantOpen(false)
  }, [loc.pathname])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('rentease_dash_collapsed', String(next))
      } catch {}
      return next
    })
  }

  const links = role === 'admin' ? ADMIN_LINKS : TENANT_LINKS
  const isAdmin = role === 'admin'

  const refreshSidebarCounts = useCallback(async () => {
    if (!isAdmin || document.hidden) return
    const requestId = ++sidebarCountRequest.current
    try {
      const response = await api('/api/admin/in-app-notifications/sidebar-counts', { auth: true })
      if (requestId !== sidebarCountRequest.current) return
      setSidebarCounts(response.data || {})
      setSidebarCountError('')
    } catch (error) {
      if (requestId === sidebarCountRequest.current) {
        setSidebarCountError(error.message || 'Could not load sidebar notifications.')
      }
    }
  }, [isAdmin])

  const markSidebarSectionRead = useCallback(async (section) => {
    try {
      await api(`/api/admin/in-app-notifications/sections/${section}/read`, {
        method: 'PATCH',
        auth: true,
        body: {},
      })
      sidebarCountRequest.current += 1
      setSidebarCounts((counts) => ({ ...counts, [section]: 0 }))
      window.dispatchEvent(new Event('rentease:notifications-read'))
      await refreshSidebarCounts()
    } catch (error) {
      setSidebarCountError(error.message || 'Could not mark section notifications as read.')
    }
  }, [refreshSidebarCounts])

  useEffect(() => {
    if (!isAdmin) return undefined
    refreshSidebarCounts()
    const timer = window.setInterval(refreshSidebarCounts, 60000)
    const onVisibilityChange = () => {
      if (!document.hidden) refreshSidebarCounts()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isAdmin, refreshSidebarCounts])

  useEffect(() => {
    if (!isAdmin) return
    const section = ADMIN_SECTIONS.find(([path]) =>
      loc.pathname === path || loc.pathname.startsWith(`${path}/`)
    )?.[1]
    if (section) markSidebarSectionRead(section)
  }, [isAdmin, loc.pathname, markSidebarSectionRead])

  return (
    <AssistantCtx.Provider value={{ open: assistantOpen, setOpen: setAssistantOpen }}>
      <div className={`dash2 ${collapsed ? 'dash2--collapsed' : ''} ${mobileOpen ? 'dash2--mobile-open' : ''}`}>

        {/* ── Mobile overlay ── */}
        {mobileOpen && <div className="dash2__overlay" onClick={() => setMobileOpen(false)} aria-hidden />}

        {/* ── Sidebar ── */}
        <aside className="sidenav2" aria-label={t(isAdmin ? 'Landlord menu' : 'Tenant menu')}>

          {/* Brand + collapse toggle */}
          <div className="sidenav2__head">
            <div className="sidenav2__brand">
              {settings.logo_url ? (
                <img className="sidenav2__brand-logo" src={assetUrl(settings.logo_url)} alt="" />
              ) : (
                <span className="sidenav2__brand-mark"><BrandMark /></span>
              )}
              <span className="sidenav2__brand-text">RentEase</span>
            </div>
            <button
              type="button"
              className="sidenav2__toggle"
              onClick={toggleCollapsed}
              aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
              title={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d={collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
              </svg>
            </button>
            <button
              type="button"
              className="sidenav2__mobile-close"
              onClick={() => setMobileOpen(false)}
              aria-label="Close sidebar menu"
              title={t('Close menu')}
            >
              <svg viewBox="0 0 24 24" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          {/* User card */}
          <div className="sidenav2__user" title={collapsed ? `${user?.full_name || user?.username} (${isAdmin ? 'Landlord' : 'Tenant'})` : undefined}>
            <Avatar user={user} />
            <div className="sidenav2__user-info">
              <span className="sidenav2__user-name">{user?.full_name?.split(' ')[0] || user?.username}</span>
              <span className="sidenav2__user-role">{t(isAdmin ? 'Landlord' : 'Tenant')}</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="sidenav2__nav">
            {links.map(([to, label, end]) => {
              const section = isAdmin ? ADMIN_SECTIONS.find(([path]) => path === to)?.[1] : null
              const count = Number(section ? sidebarCounts[section] : 0) || 0
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className="sidenav2__link"
                  title={collapsed ? t(label) : undefined}
                  onClick={() => {
                    if (section && loc.pathname === to) markSidebarSectionRead(section)
                  }}
                >
                  <span className="sidenav2__icon" aria-hidden>{ICONS[label]}</span>
                  <span className="sidenav2__label">{t(label)}</span>
                  {count > 0 && (
                    <span className="sidenav2__badge" aria-label={`${count} unread`}>
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>

          {sidebarCountError && <p className="sidenav2__error" role="alert">{sidebarCountError}</p>}
          <div className="sidenav2__spacer" />
        </aside>

        {/* ── Mobile hamburger ── */}
        <button
          type="button"
          className="dash2__hamburger"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={t('Open menu')}
          aria-expanded={mobileOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>

        {/* ── Main content ── */}
        <div className={`dash2__main${loc.pathname === '/admin/assistant' ? ' dash2__main--assistant' : ''}`}>
          <Outlet context={{ assistantDraftHandoff, setAssistantDraftHandoff }} />
        </div>

        {/* ── Floating AI chat button ── */}
        {isAdmin && loc.pathname !== '/admin/assistant' && (
          <button
            className={`ai-fab ${assistantOpen ? 'ai-fab--open' : ''}`}
            onClick={() => setAssistantOpen((o) => !o)}
            aria-label={t(assistantOpen ? 'Close assistant' : 'Open assistant')}
            title={t('Assistant')}
          >
            {assistantOpen ? (
              <svg viewBox="0 0 24 24" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <circle cx="9" cy="10" r=".5" fill="currentColor" />
                <circle cx="12" cy="10" r=".5" fill="currentColor" />
                <circle cx="15" cy="10" r=".5" fill="currentColor" />
              </svg>
            )}
          </button>
        )}

        {/* ── Assistant slide-up panel ── */}
        {isAdmin && loc.pathname !== '/admin/assistant' && (
          <div className={`ai-panel ${assistantOpen ? 'ai-panel--open' : ''}${assistantExpanded ? ' ai-panel--expanded' : ''}`} aria-hidden={!assistantOpen}>
            <AssistantPanel
              onClose={() => setAssistantOpen(false)}
              onExpandedChange={setAssistantExpanded}
              handoffDraft={assistantDraftHandoff}
              onHandoffChange={setAssistantDraftHandoff}
              onMaximize={() => {
                setAssistantOpen(false)
                navigate('/admin/assistant')
              }}
            />
          </div>
        )}
      </div>
    </AssistantCtx.Provider>
  )
}

// Lazy-load the assistant inside the panel
function AssistantPanel({ onClose, onExpandedChange, handoffDraft, onHandoffChange, onMaximize }) {
  const { t } = useLanguage()
  return (
    <div className="ai-panel__inner">
      <div className="ai-panel__head">
        <div className="ai-panel__head-title">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden style={{ flexShrink: 0 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <span>RentEaseAssist</span>
        </div>
        <div className="ai-panel__head-actions">
          <button className="ai-panel__maximize" onClick={onMaximize} aria-label={t('Open Assistant dashboard')} title={t('Open full Assistant dashboard')}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden stroke="currentColor" strokeWidth="1.8" fill="none"><path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" /></svg>
            <span>{t('Maximize')}</span>
          </button>
          <button className="ai-panel__close" onClick={onClose} aria-label={t('Close assistant')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      </div>
      <div className="ai-panel__body">
        <Suspense fallback={<LoadingHouse label="Opening RentEaseAssist…" className="loading-house--embedded" />}>
          <AssistantPage embedded onExpandedChange={onExpandedChange} handoffDraft={handoffDraft} onHandoffChange={onHandoffChange} />
        </Suspense>
      </div>
    </div>
  )
}
