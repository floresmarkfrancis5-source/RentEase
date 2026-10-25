import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function destination(type, role) {
  if (type === 'new_transfer_request') return '/admin/transfers'
  if (type === 'payment_received') return '/admin/payments'
  if (type === 'new_maintenance_request') return '/admin/maintenance'
  if (type === 'transfer_result') return '/tenant/transfers'
  if (type === 'maintenance_update') return '/tenant/maintenance'
  if (type === 'new_bill' || type === 'due_reminder' || type === 'payment_confirmation') return '/tenant/bills'
  return role === 'admin' ? '/admin' : '/tenant'
}

function timeLabel(value) {
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function NotificationBell({ user }) {
  const [count, setCount] = useState(0)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const box = useRef(null)
  const navigate = useNavigate()
  const base = user.role === 'admin' ? '/api/admin/in-app-notifications' : '/api/my/notifications'

  const refreshCount = useCallback(async () => {
    try {
      const r = await api(`${base}/unread-count`, { auth: true })
      setCount(Number(r.data?.count) || 0)
      setError('')
    } catch (e) { setError(e.message) }
  }, [base])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api(base, { auth: true })
      setItems(r.data || [])
      setError('')
      await refreshCount()
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [base, refreshCount])

  useEffect(() => {
    refreshCount()
    const timer = window.setInterval(refreshCount, 45000)
    return () => window.clearInterval(timer)
  }, [refreshCount])

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const toggle = () => {
    if (!open) loadItems()
    setOpen(!open)
  }

  const markOne = async (item) => {
    try {
      if (!item.is_read) await api(`${base}/${item.id}/read`, { method: 'PATCH', auth: true, body: {} })
      setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, is_read: 1 } : row))
      if (!item.is_read) setCount((n) => Math.max(0, n - 1))
      setOpen(false)
      navigate(destination(item.type, user.role))
    } catch (e) { setError(e.message) }
  }

  const markAll = async () => {
    try {
      await api(`${base}/read-all`, { method: 'PATCH', auth: true, body: {} })
      setItems((rows) => rows.map((row) => ({ ...row, is_read: 1 })))
      setCount(0)
      setError('')
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="notification-bell" ref={box}>
      <button type="button" className="icon-btn notification-bell__button" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open} onClick={toggle}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {!!count && <span className="notification-badge">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel__head">
            <strong>Notifications</strong>
            <button type="button" className="notification-panel__read-all" onClick={markAll} disabled={!count}>Mark all as read</button>
          </div>
          {error && <p className="alert alert--error notification-panel__error" role="alert">{error}</p>}
          {loading ? <p className="notification-panel__empty">Loading…</p> : items.length ? (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id}>
                  <button type="button" className={`notification-item${item.is_read ? '' : ' is-unread'}`} onClick={() => markOne(item)}>
                    <span className="notification-item__top">
                      <strong>{item.title}</strong>
                      {!item.is_read && <i aria-label="Unread" />}
                    </span>
                    <span>{item.message}</span>
                    <time>{timeLabel(item.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          ) : !error ? <p className="notification-panel__empty">You’re all caught up.</p> : null}
          {user.role === 'admin' && <Link className="notification-panel__footer" to="/admin/notifications" onClick={() => setOpen(false)}>View email log</Link>}
        </div>
      )}
    </div>
  )
}
