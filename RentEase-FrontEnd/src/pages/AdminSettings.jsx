import { useEffect, useMemo, useRef, useState } from 'react'
import Glass from '../components/Glass'
import Hero from '../components/Hero'
import { DEFAULT_SETTINGS, useSettings } from '../context/SettingsContext'
import { api } from '../lib/api'
import { assetUrl } from '../lib/brand'
import { compressImage } from '../lib/image'

const HEX = /^#[0-9a-fA-F]{6}$/
const COLOR_KEYS = ['accent_color', 'header_color', 'hero_color_from', 'hero_color_to']
const APPEARANCE_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter((key) => !key.startsWith('billing_'))

const PRESETS = [
  { name: 'Modern Barangay', accent_color: '#E05A47', header_color: '#1E4620', hero_color_from: '#1E4620', hero_color_to: '#4A7450' },
  { name: 'Red Clay', accent_color: '#C9655D', header_color: '#482C2A', hero_color_from: '#8F413B', hero_color_to: '#BE6F60' },
  { name: 'Warm Orange', accent_color: '#D0703D', header_color: '#4F3628', hero_color_from: '#A35632', hero_color_to: '#C77B44' },
  { name: 'Soft Marigold', accent_color: '#B18A2E', header_color: '#463A1F', hero_color_from: '#86702E', hero_color_to: '#B39445' },
  { name: 'Garden Green', accent_color: '#66886A', header_color: '#293F2C', hero_color_from: '#365B3A', hero_color_to: '#6E8F70' },
  { name: 'Quiet Blue', accent_color: '#5B7D92', header_color: '#293F50', hero_color_from: '#3D6177', hero_color_to: '#7291A0' },
  { name: 'Soft Indigo', accent_color: '#707BA8', header_color: '#34374F', hero_color_from: '#4A537F', hero_color_to: '#8089AE' },
  { name: 'Muted Violet', accent_color: '#8B739D', header_color: '#403649', hero_color_from: '#65527B', hero_color_to: '#9583A6' },
  { name: 'Dusty Pink', accent_color: '#B36E83', header_color: '#49303A', hero_color_from: '#885469', hero_color_to: '#B67A8A' },
]

function ColorField({ label, hint, value, onChange, error }) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="color-field">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          aria-label={`${label} hex value`}
          value={value}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`)}
        />
      </div>
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </div>
  )
}

function Text({ label, name, draft, set, errors, multiline, max, placeholder, hint }) {
  const Tag = multiline ? 'textarea' : 'input'
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {max && <em className="field__count">{draft[name].length}/{max}</em>}
      </span>
      <Tag
        value={draft[name]}
        onChange={(e) => set(name, e.target.value)}
        maxLength={max}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        aria-invalid={!!errors[name]}
      />
      {hint && !errors[name] && <span className="field__hint">{hint}</span>}
      {errors[name] && <span className="field__error">{errors[name]}</span>}
    </label>
  )
}


const SLOTS = [
  { slot: 'logo', key: 'logo_url', label: 'Sidebar logo', hint: 'This logo appears only in your dashboard sidebar and your tenants’ sidebars. RentEase branding in the header stays unchanged.', maxSide: 512, maxBytes: 380 * 1024, keepAlpha: true },
  { slot: 'hero', key: 'hero_image_url', label: 'Tenant homepage image', hint: 'Your tenants see this image on their RentEase homepage. It does not replace the public RentEase information page.', maxSide: 1920, maxBytes: 2300 * 1024 },
]

function ImageField({ cfg, value, onLink, onSaved, error }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const input = useRef(null)
  const url = assetUrl(value)

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      const image = await compressImage(file, cfg)
      const r = await api('/api/admin/settings/image', { method: 'PUT', auth: true, body: { key: cfg.slot, image } })
      onSaved(r.data)
      setMsg({ ok: true, text: 'Uploaded — it is live on the site now.' })
    } catch (err) {
      setMsg({ ok: false, text: err.fields?.image || err.message })
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`Remove the ${cfg.label.toLowerCase()}?`)) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await api(`/api/admin/settings/image/${cfg.slot}`, { method: 'DELETE', auth: true })
      onSaved(r.data)
      setMsg({ ok: true, text: 'Removed.' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="imgfield">
      <div className={`imgfield__thumb imgfield__thumb--${cfg.slot}`}>
        {url ? <img src={url} alt={`Current ${cfg.label.toLowerCase()}`} /> : <span>No image</span>}
      </div>
      <div className="imgfield__body">
        <span className="field__label">{cfg.label}</span>
        <span className="field__hint">{cfg.hint}</span>
        <div className="imgfield__actions">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Working…' : url ? 'Replace image' : 'Upload image'}</button>
          {value && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}>Remove</button>}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
        </div>
        {msg && <span className={msg.ok ? 'field__hint field__hint--ok' : 'field__error'} role="status">{msg.text}</span>}
        <label className="imgfield__link">
          <span className="field__hint">or use an image link</span>
          <input type="text" value={value && !value.startsWith('/api/') ? value : ''} placeholder="https://…" onChange={(e) => onLink(e.target.value)} aria-invalid={!!error} />
        </label>
        {error && <span className="field__error">{error}</span>}
      </div>
    </div>
  )
}

function SettingsForm() {
  const { saved, commit, setPreview } = useSettings()
  const [draft, setDraft] = useState(saved)
  const [touched, setTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null) // {type, text}
  const [history, setHistory] = useState(null)

  const dirty = useMemo(() => APPEARANCE_SETTING_KEYS.some((key) => draft[key] !== saved[key]), [draft, saved])

  useEffect(() => {
    if (!touched) setDraft(saved)
  }, [saved, touched])

  // Preview only this landlord's account theme and tenant homepage.
  useEffect(() => {
    if (!dirty) return setPreview(null)
    const p = { ...draft }
    COLOR_KEYS.forEach((k) => { if (!HEX.test(p[k])) p[k] = saved[k] })
    setPreview(p)
  }, [draft, dirty, saved, setPreview])
  useEffect(() => () => setPreview(null), [setPreview])

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const set = (k, v) => {
    setTouched(true)
    setDraft((d) => ({ ...d, [k]: v }))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
    setNotice(null)
  }

  async function save(e) {
    e?.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const appearanceDraft = Object.fromEntries(APPEARANCE_SETTING_KEYS.map((key) => [key, draft[key]]))
      const r = await api('/api/admin/settings', { method: 'PUT', body: appearanceDraft, auth: true })
      commit(r.data)
      setDraft({ ...DEFAULT_SETTINGS, ...r.data })
      setTouched(false)
      setErrors({})
      setHistory(null)
      setNotice({ type: 'ok', text: r.changed?.length ? 'Settings saved for you and your tenants.' : 'Nothing to change.' })
    } catch (err) {
      setErrors(err.fields || {})
      setNotice({ type: 'error', text: err.status === 422 ? 'Please fix the highlighted fields.' : err.message })
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!window.confirm('Restore every setting to the original defaults?')) return
    setSaving(true)
    try {
      const r = await api('/api/admin/settings/reset', { method: 'POST', auth: true })
      commit(r.data)
      setDraft({ ...DEFAULT_SETTINGS, ...r.data })
      setTouched(false)
      setErrors({})
      setHistory(null)
      setNotice({ type: 'ok', text: 'Defaults restored.' })
    } catch (err) {
      setNotice({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  function loadHistory(e) {
    if (e.currentTarget.open && !history) {
      api('/api/admin/settings/history', { auth: true })
        .then((r) => setHistory(r.data))
        .catch(() => setHistory([]))
    }
  }

  const common = { draft, set, errors }

  return (
    <form className="admin" onSubmit={save} noValidate>
      <div className="admin__head">
        <p className="eyebrow">Admin</p>
        <h1 className="page-title">Appearance and tenant homepage</h1>
        <p className="page-sub">These settings apply only to your account and your tenants. Other landlords and their tenants will not see your changes.</p>
      </div>

      <div className="admin__cols">
        <div className="admin__forms">
          <Glass as="fieldset" className="panel">
            <legend>Colors</legend>
            <div className="presets" role="group" aria-label="Color presets">
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  className="preset"
                  onClick={() => COLOR_KEYS.forEach((k) => set(k, p[k]))}
                  title={`Apply ${p.name}`}
                >
                  <span className="preset__swatch" style={{ background: `linear-gradient(135deg, ${p.hero_color_from}, ${p.hero_color_to})` }}>
                    <i style={{ background: p.accent_color }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="two">
              <ColorField label="Accent color" hint="Buttons, links and highlights." value={draft.accent_color} onChange={(v) => set('accent_color', v)} error={errors.accent_color} />
              <ColorField label="Header color" hint="The header bar (it turns transparent over the homepage photo)." value={draft.header_color} onChange={(v) => set('header_color', v)} error={errors.header_color} />
              <ColorField label="Hero gradient — start" value={draft.hero_color_from} onChange={(v) => set('hero_color_from', v)} error={errors.hero_color_from} />
              <ColorField label="Hero gradient — end" value={draft.hero_color_to} onChange={(v) => set('hero_color_to', v)} error={errors.hero_color_to} />
            </div>
          </Glass>

          <Glass as="fieldset" className="panel">
            <legend>Tenant homepage</legend>
            <p className="field__hint" style={{ marginTop: 0 }}>Customize the welcome message your tenants see. Your public RentEase homepage stays focused on landlord information.</p>
            <Text label="Tenant welcome headline" name="hero_title" max={90} {...common} />
            <Text label="Tenant welcome message" name="hero_subtitle" max={220} multiline {...common} />
            <Text label="Button text" name="hero_cta_text" max={30} {...common} />
          </Glass>

          <Glass as="fieldset" className="panel">
            <legend>Sidebar logo and tenant image</legend>
            <p className="field__hint" style={{ marginBottom: 6 }}>Images are for your dashboard and your tenants only. Uploaded images go live as soon as they finish uploading. Other changes need <b>Save changes</b>.</p>
            {SLOTS.map((cfg) => (
              <ImageField
                key={cfg.slot}
                cfg={cfg}
                value={draft[cfg.key]}
                error={errors[cfg.key]}
                onLink={(v) => set(cfg.key, v)}
                onSaved={(data) => { commit(data); setDraft((d) => ({ ...d, [cfg.key]: data[cfg.key] })); setHistory(null) }}
              />
            ))}
          </Glass>

          <Glass as="fieldset" className="panel">
            <legend>Appearance</legend>
            <div className="field">
              <span className="field__label">Theme for you and your tenants</span>
              <div className="segmented" role="radiogroup" aria-label="Default mode">
                {['light', 'dark', 'system'].map((m) => (
                  <button
                    type="button"
                    key={m}
                    role="radio"
                    aria-checked={draft.default_theme === m}
                    className={draft.default_theme === m ? 'is-on' : ''}
                    onClick={() => set('default_theme', m)}
                  >
                    {m === 'system' ? 'Match device' : m[0].toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <span className="field__hint">Your tenants inherit this theme. They can still use the header toggle on their own device.</span>
            </div>
            <label className="field">
              <span className="field__label">Glass blur <em className="field__count">{draft.glass_blur}px</em></span>
              <input type="range" min="0" max="40" step="1" value={draft.glass_blur} onChange={(e) => set('glass_blur', e.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Glass opacity <em className="field__count">{draft.glass_opacity}%</em></span>
              <input type="range" min="20" max="90" step="1" value={draft.glass_opacity} onChange={(e) => set('glass_opacity', e.target.value)} />
            </label>
          </Glass>

          <details className="history glass" onToggle={loadHistory}>
            <summary>Recent changes</summary>
            {history === null && <p className="muted">Loading…</p>}
            {history?.length === 0 && <p className="muted">No changes recorded yet.</p>}
            {history?.length > 0 && (
              <ul>
                {history.map((h, i) => (
                  <li key={i}>
                    <strong>{h.setting_key}</strong> changed by {h.changed_by || 'unknown'} · {h.changed_at}
                    <br />
                    <span className="muted">{h.old_value || '—'} → {h.new_value || '—'}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>

        <aside className="admin__preview" aria-label="Preview">
          <p className="eyebrow">Live preview</p>
          <div className="preview-frame">
            <Hero s={{ ...saved, ...draft, ...Object.fromEntries(COLOR_KEYS.filter((k) => !HEX.test(draft[k])).map((k) => [k, saved[k]])) }} compact inert tenant />
          </div>
          <p className="muted preview-note">
            This is the homepage your tenants will see. Your RentEase header and public homepage branding stay the same.
          </p>
        </aside>
      </div>

      <Glass className="savebar" role="region" aria-label="Save changes">
        <span className={`savebar__state${notice ? ` savebar__state--${notice.type}` : ''}`} role="status" aria-live="polite">
          {notice ? notice.text : dirty ? 'You have unsaved changes' : 'All changes saved'}
        </span>
        <div className="savebar__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset} disabled={saving}>Reset to defaults</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDraft(saved); setErrors({}); setNotice(null) }} disabled={!dirty || saving}>Discard</button>
          <button className="btn btn--accent btn--sm" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </Glass>
    </form>
  )
}

export default function AdminSettings() {
  const { ready } = useSettings()
  // Wait for the first server response so the form never starts from stale cached values.
  return ready ? <SettingsForm /> : <p className="muted" role="status">Loading settings…</p>
}
