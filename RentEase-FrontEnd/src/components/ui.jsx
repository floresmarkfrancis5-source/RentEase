import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import Glass from './Glass'

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
  return (
    <div className="pagehead">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="pagehead__actions">{children}</div>}
    </div>
  )
}

const TONE = {
  paid: 'ok', resolved: 'ok', active: 'ok', occupied: 'ok', sent: 'ok', approved: 'ok',
  unpaid: 'warn', pending: 'warn', in_progress: 'warn', vacant: 'info', maintenance: 'warn', under_maintenance: 'warn', good_condition: 'ok', medium: 'warn',
  overdue: 'bad', high: 'bad', failed: 'bad', rejected: 'bad', ended: 'muted', low: 'muted', cancelled: 'muted',
}
export const StatusPill = ({ value }) => (
  <span className={`tag tag--${TONE[value] || 'muted'}`}>{String(value ?? '—').replace('_', ' ')}</span>
)

export function State({ loading, error, empty, children }) {
  if (loading) return <p className="muted state">Loading…</p>
  if (error) return <p className="alert alert--error" role="alert">{error}</p>
  if (empty) return <Glass className="empty"><p>{empty}</p></Glass>
  return children
}

/** columns: [{ key, label, render?(row), align? }] */
export function Table({ columns, rows, actions }) {
  return (
    <Glass className="tablewrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}
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

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Glass className="modal__card">
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="btn btn--ghost btn--sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </Glass>
    </div>
  )
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  )
}

/** Small form modal: fields declared as [{ name, label, type, options, ... }]. onSubmit(values) must throw ApiError to show errors. */
export function FormModal({ title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose }) {
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
          <Field key={f.name} label={f.label} hint={f.hint} error={errors[f.name]}>
            {f.type === 'select' ? (
              <select required={f.required} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]}>
                {f.placeholder && <option value="">{f.placeholder}</option>}
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea rows={3} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]} />
            ) : (
              <input type={f.type || 'text'} step={f.step} min={f.min} value={v[f.name]} placeholder={f.placeholder}
                onChange={(e) => setV({ ...v, [f.name]: e.target.value })} aria-invalid={!!errors[f.name]} />
            )}
          </Field>
        ))}
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--accent" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
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
