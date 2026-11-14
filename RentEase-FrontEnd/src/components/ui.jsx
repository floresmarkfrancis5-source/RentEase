import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import Glass from './Glass'
import HelpTip from './HelpTip'
import { helpFor, useLanguage } from '../context/LanguageContext'

/** Load an authenticated GET endpoint. Returns { data, error, loading, reload }. */
export function useLoad(path) {
  const [state, set] = useState({ data: null, error: '', loading: true })
  const reload = useCallback(() => {
    set((s) => ({ ...s, loading: true }))
    return api(path, { auth: true })
      .then((r) => set({ data: r.data ?? r, error: '', loading: false }))
      .catch((e) => set({ data: null, error: e.message, loading: false }))
  }, [path])
  useEffect(() => { reload() }, [reload])
  return { ...state, reload }
}

export function PageHead({ eyebrow, title, sub, children }) {
  const { t } = useLanguage()
  return (
    <div className="pagehead">
      <div>
        {eyebrow && <p className="eyebrow">{t(eyebrow)}</p>}
        <h1 className="page-title">{t(title)}</h1>
        {sub && <p className="page-sub">{t(sub)}</p>}
      </div>
      {children && <div className="pagehead__actions">{children}</div>}
    </div>
  )
}

export function LoadingHouse({ label = 'Loading your RentEase dashboard…', className = '' }) {
  return (
    <div className={`loading-house ${className}`.trim()} role="status" aria-live="polite">
      <svg className="loading-house__drawing" viewBox="0 0 220 150" aria-hidden="true">
        <path className="loading-house__line" pathLength="1"
          d="M4 132H40V58L110 10L180 58V132H216 M40 132H88 M132 132H180 M88 132V96H132V132 M60 72H80V88H60Z M140 72H160V88H140Z" />
      </svg>
      <span className="loading-house__label">{label}</span>
    </div>
  )
}

const TONE = {
  paid: 'ok', resolved: 'ok', active: 'ok', occupied: 'ok', sent: 'ok', approved: 'ok',
  unpaid: 'warn', pending: 'warn', in_progress: 'warn', vacant: 'info', maintenance: 'warn', under_maintenance: 'warn', good_condition: 'ok', medium: 'warn',
  overdue: 'bad', high: 'bad', urgent: 'bad', failed: 'bad', rejected: 'bad', expired: 'bad', offered: 'info', scheduled: 'info', ended: 'muted', low: 'muted', cancelled: 'muted',
}
export const StatusPill = ({ value }) => {
  const { t } = useLanguage()
  const label = String(value === 'urgent' ? 'Urgent' : value ?? '—').replace('_', ' ')
  const translated = label === 'good condition' ? t('Good condition')
    : label === 'under maintenance' ? t('Under maintenance')
      : t(label.charAt(0).toUpperCase() + label.slice(1))
  return <span className={`tag tag--${TONE[value] || 'muted'}`}>{translated}</span>
}

export function State({ loading, error, empty, children }) {
  if (loading) return <LoadingHouse />
  if (error) return <p className="alert alert--error" role="alert">{error}</p>
  if (empty) return <Glass className="empty"><p>{empty}</p></Glass>
  return children
}

/** columns: [{ key, label, render?(row), align? }] */
export function Table({ columns, rows, actions }) {
  const { t } = useLanguage()
  return (
    <Glass className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'r' : ''}>{t(c.label)}</th>)}
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={c.align === 'right' ? 'r' : ''}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
              {actions && <td className="actions">{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Glass>
  )
}

export function Modal({ title, onClose, children, className = '' }) {
  const { t } = useLanguage()
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-label={t(title)} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Glass className={`modal__card${className ? ` ${className}` : ''}`}>
        <div className="modal__head">
          <h2>{t(title)}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label={t('Close')}>✕</button>
        </div>
        {children}
      </Glass>
    </div>,
    document.body
  )
}

export function Field({ label, error, hint, checkbox = false, children }) {
  const { language, t } = useLanguage()
  const help = helpFor(label, language)
  return (
    <label className={`field${checkbox ? ' field--checkbox' : ''}`}>
      <span className="field__label">{t(label)}{help && <HelpTip text={help} label={language === 'tl' ? `Tulong tungkol sa: ${t(label)}` : `Help about: ${label}`} />}</span>
      {children}
      {hint && !error && <span className="field__hint">{t(hint)}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  )
}

/** Small form modal: fields declared as [{ name, label, type, options, ... }]. onSubmit(values) must throw ApiError to show errors. */
export function FormModal({ title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose }) {
  const { t } = useLanguage()
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? f.default ?? ''])))
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(''); setErrors({})
    try {
      await onSubmit(v)
      onClose()
    } catch (err) {
      setError(err.message); setErrors(err.fields || {})
    } finally { setBusy(false) }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="stack" noValidate>
        {fields.map((f) => (
          <Field key={f.name} label={f.label} hint={f.hint} error={errors[f.name]} checkbox={f.type === 'checkbox'}>
            {f.type === 'select' ? (
              <select required={f.required} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]}>
                {f.placeholder && <option value="">{t(f.placeholder)}</option>}
                {f.options.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea rows={3} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]} />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={!!v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} aria-invalid={!!errors[f.name]} />
            ) : (
              <input type={f.type || 'text'} step={f.step} min={f.min} value={v[f.name]} placeholder={f.placeholder}
                onChange={(e) => setV({ ...v, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]} />
            )}
          </Field>
        ))}
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn btn--accent" disabled={busy}>{busy ? t('Saving…') : t(submitLabel)}</button>
        </div>
      </form>
    </Modal>
  )
}

/** Toasts: const [toast, flash] = useToast();  flash('Saved') ... {toast} */
export function useToast() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    if (!msg) return undefined
    const t = setTimeout(() => setMsg(null), 4500)
    return () => clearTimeout(t)
  }, [msg])
  const flash = useCallback((text, tone = 'ok') => setMsg({ text, tone }), [])
  const node = msg && <div className={`toast toast--${msg.tone}`} role="status">{msg.text}</div>
  return [node, flash]
}

export const clean = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))
