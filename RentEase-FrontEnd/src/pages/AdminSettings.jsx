import { useEffect, useMemo, useRef, useState } from 'react'
import Glass from '../components/Glass'
import Hero from '../components/Hero'
import { DEFAULT_SETTINGS, useSettings } from '../context/SettingsContext'
import { api } from '../lib/api'
import { assetUrl } from '../lib/brand'
import { compressImage } from '../lib/image'

const HEX = /^#[0-9a-fA-F]{6}$/
const COLOR_KEYS = ['accent_color', 'header_color', 'hero_color_from', 'hero_color_to']

const PRESETS = [
  { name: 'Violet Night', accent_color: '#7c4fe0', header_color: '#0d0817', hero_color_from: '#5a2fb8', hero_color_to: '#1a0f2c' },
  { name: 'Emerald Night', accent_color: '#0f766e', header_color: '#0f172a', hero_color_from: '#0f766e', hero_color_to: '#1e1b4b' },
  { name: 'Royal Indigo', accent_color: '#4f46e5', header_color: '#1e1b4b', hero_color_from: '#4f46e5', hero_color_to: '#7c3aed' },
  { name: 'Rose Quartz', accent_color: '#e11d48', header_color: '#4c0519', hero_color_from: '#fb7185', hero_color_to: '#9f1239' },
  { name: 'Golden Hour', accent_color: '#b45309', header_color: '#292524', hero_color_from: '#f59e0b', hero_color_to: '#78350f' },
  { name: 'Ocean Glass', accent_color: '#0284c7', header_color: '#082f49', hero_color_from: '#38bdf8', hero_color_to: '#1e3a8a' },
  { name: 'Pearl', accent_color: '#334155', header_color: '#f1f5f9', hero_color_from: '#cbd5e1', hero_color_to: '#64748b' },
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
  { slot: 'logo', key: 'logo_url', label: 'Logo', hint: 'Shown in the header, the intro screen and as the browser tab icon. Square or wide PNG with a transparent background works best.', maxSide: 512, maxBytes: 380 * 1024, keepAlpha: true },
  { slot: 'hero', key: 'hero_image_url', label: 'Homepage hero image', hint: 'Full-width photo behind the headline. Wide landscape pictures look best (at least 1600 px wide).', maxSide: 1920, maxBytes: 2300 * 1024 },
  { slot: 'login', key: 'login_image_url', label: 'Login page image', hint: 'Shown beside the login form. Leave it empty to reuse the hero image.', maxSide: 1400, maxBytes: 2300 * 1024 },
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
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null) // {type, text}
  const [history, setHistory] = useState(null)

  const dirty = useMemo(() => Object.keys(DEFAULT_SETTINGS).some((k) => draft[k] !== saved[k]), [draft, saved])

  // Live preview: the whole site (header, buttons, hero, glass) re-themes as you type.
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
    setDraft((d) => ({ ...d, [k]: v }))
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))
    setNotice(null)
  }

  async function save(e) {
    e?.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const r = await api('/api/admin/settings', { method: 'PUT', body: draft, auth: true })
      commit(r.data)
      setDraft({ ...DEFAULT_SETTINGS, ...r.data })
      setErrors({})
      setHistory(null)
      setNotice({ type: 'ok', text: r.changed?.length ? 'Settings saved — your site is updated.' : 'Nothing to change.' })
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
        <h1 className="page-title">Site settings</h1>
        <p className="page-sub">Changes preview live across the whole site. Nothing goes public until you press Save.</p>
      </div>

      <div className="admin__cols">
        <div className="admin__forms">
          <Glass as="fieldset" className="panel">
            <legend>Branding</legend>
            <Text label="Website name" name="site_name" max={60} {...common} hint="Shown in the header, browser tab and footer." />
            <Text label="Tagline" name="site_tagline" max={120} {...common} />
            <Text label="Footer text" name="footer_text" max={200} multiline {...common} />
          </Glass>

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
            <legend>Homepage hero</legend>
            <Text label="Headline" name="hero_title" max={90} {...common} />
            <Text label="Subtitle" name="hero_subtitle" max={220} multiline {...common} />
            <Text label="Button text" name="hero_cta_text" max={30} {...common} />
          </Glass>

          <Glass as="fieldset" className="panel">
            <legend>Logo &amp; images</legend>
            <p className="field__hint" style={{ marginBottom: 6 }}>Pictures are shrunk automatically and go live as soon as they upload. Everything else still needs <b>Save changes</b>.</p>
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
              <span className="field__label">Default mode for new visitors</span>
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
              <span className="field__hint">Visitors can still switch with the sun/moon toggle in the header.</span>
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
            <Hero s={{ ...saved, ...draft, ...Object.fromEntries(COLOR_KEYS.filter((k) => !HEX.test(draft[k])).map((k) => [k, saved[k]])) }} compact inert />
          </div>
          <p className="muted preview-note">
            This is the hero visitors will see. The header above already shows your header, logo and website name.
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
