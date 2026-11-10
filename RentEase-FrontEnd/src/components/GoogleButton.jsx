import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

/**
 * GoogleButton
 * ─────────────────────────────────────────────────────────────────
 * Renders the official Google-branded Sign-in button when
 * VITE_GOOGLE_CLIENT_ID is configured in the front-end .env.
 *
 * Props
 *   label        – visible text when Google is NOT configured (placeholder)
 *   onCredential – callback(credentialToken: string) called after Google
 *                  issues a JWT id_token. The parent decides whether to
 *                  call loginGoogle() or registerGoogle().
 *   theme        – 'outline' | 'filled_blue' | 'filled_black' (default: 'outline')
 */
export default function GoogleButton({ label = 'Continue with Google', onCredential, theme = 'outline' }) {
  const { t } = useLanguage()
  const containerRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const configured = CLIENT_ID !== ''

  // Initialise GSI once the library has loaded
  useEffect(() => {
    if (!configured) return
    let attempts = 0
    const MAX = 40 // ~4 seconds

    function tryInit() {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        setReady(true)
        return
      }
      attempts++
      if (attempts < MAX) setTimeout(tryInit, 100)
    }
    tryInit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  // Render the native Google button once the container + GSI are both ready
  useEffect(() => {
    if (!ready || !containerRef.current || !window.google?.accounts?.id) return
    containerRef.current.innerHTML = ''
    window.google.accounts.id.renderButton(containerRef.current, {
      type: 'standard',
      theme,
      size: 'large',
      width: containerRef.current.offsetWidth || 340,
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
    })
  }, [ready, theme])

  async function handleCredential(response) {
    const token = response.credential
    if (!token || !onCredential) return
    setBusy(true)
    setError('')
    try {
      await onCredential(token)
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Fallback: open popup when the rendered button isn't clickable (edge cases)
  function triggerPopup() {
    if (!window.google?.accounts?.id) return
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // One Tap was suppressed; nothing extra to do
      }
    })
  }

  if (!configured) {
    return (
      <div className="google-btn">
        <button className="btn btn-block google-placeholder" type="button" disabled aria-disabled="true">
          <GoogleIcon />
          <span>          {t(label)}</span>
          <span className="google-placeholder__status">Google not configured</span>
        </button>
        <p className="google-btn__hint">
          Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env</code> and{' '}
          <code>GOOGLE_CLIENT_ID</code> to the backend <code>.env</code> to enable Google sign-in.
        </p>
      </div>
    )
  }

  return (
    <div className="google-btn">
      {/* Native GSI button rendered here */}
      <div
        ref={containerRef}
        className="google-btn__native"
        style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={!ready ? undefined : triggerPopup}
        role="button"
        aria-label={label}
      >
        {!ready && (
          <button className="btn btn-block google-real" type="button" disabled>
            <GoogleIcon />
            <span>Loading Google…</span>
          </button>
        )}
      </div>
      {busy && <p className="google-btn__hint" style={{ color: 'var(--clr-accent)' }}>Signing in with Google…</p>}
      {error && <p className="alert alert--error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
