import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import AssistantAvatar from './AssistantAvatar'
import { useLanguage } from '../context/LanguageContext'
import { api } from '../lib/api'

const ACTION_PATHS = new Set(['/login', '/register', '/forgot-password'])

export default function PublicAssistant() {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [chips, setChips] = useState([])
  const [configError, setConfigError] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const messagesRef = useRef(null)

  useEffect(() => {
    api('/api/public/assistant')
      .then((response) => {
        const nextChips = response.data?.chips
        if (!Array.isArray(nextChips)) throw new Error('The public assistant did not return its suggested questions.')
        setChips(nextChips)
      })
      .catch((error) => setConfigError(error.message || 'Could not load assistant questions.'))
  }, [])

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  async function ask(question, topic = '') {
    const text = question.trim()
    if (!text || busy) return
    setMessages((current) => [...current, { role: 'user', text }])
    setDraft('')
    setBusy(true)
    try {
      const response = await api('/api/public/assistant/chat', {
        method: 'POST',
        body: { message: text, topic },
      })
      setMessages((current) => [...current, {
        role: 'assistant',
        text: response.reply,
        action: response.action,
        fallback: response.fallback,
      }])
    } catch (error) {
      setMessages((current) => [...current, {
        role: 'error',
        text: error.message || 'The assistant could not answer right now. Please try again.',
      }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`ai-fab ${open ? 'ai-fab--open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={t(open ? 'Close assistant' : 'Open assistant')}
        aria-expanded={open}
        title={t('Ask about RentEase')}
      >
        {open
          ? <svg viewBox="0 0 24 24" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          : <AssistantAvatar className="assistant-avatar--fab" />}
      </button>

      <section className={`ai-panel public-assistant${open ? ' ai-panel--open' : ''}`} aria-label={t('RentEase information assistant')} aria-hidden={!open} inert={!open ? '' : undefined}>
        <div className="ai-panel__inner">
          <header className="public-assistant__head">
            <AssistantAvatar className="public-assistant__avatar" />
            <div className="public-assistant__title">
              <strong>{t('RentEase Assistant')}</strong>
              <span>{t('Questions about RentEase')}</span>
            </div>
            <button type="button" className="public-assistant__close" onClick={() => setOpen(false)} aria-label={t('Close assistant')}>×</button>
          </header>

          <div className="public-assistant__messages" ref={messagesRef} aria-live="polite">
            <div className="public-assistant__welcome">
              <strong>{t('Welcome to RentEase')}</strong>
              <p>{t('Ask about landlord accounts, tenant access, sign-in, or what RentEase can do.')}</p>
            </div>
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`public-assistant__message public-assistant__message--${message.role}`} role={message.role === 'error' ? 'alert' : undefined}>
                {message.fallback && <small>{t('Using a verified FAQ because the assistant service is unavailable.')}</small>}
                <p>{message.text}</p>
                {message.action && ACTION_PATHS.has(message.action.href) && (
                  <Link className="btn btn--accent btn--sm" to={message.action.href} onClick={() => setOpen(false)}>
                    {t(message.action.label)}
                  </Link>
                )}
              </article>
            ))}
            {busy && (
              <div className="public-assistant__thinking" role="status" aria-live="polite">
                <AssistantAvatar thinking className="public-assistant__thinking-avatar" />
                <span>{t('Checking RentEase information…')}</span>
              </div>
            )}
            {configError && <p className="alert alert--error" role="alert">{configError}</p>}
            {!messages.length && chips.length > 0 && (
              <div className="public-assistant__chips" aria-label={t('Suggested questions')}>
                {chips.map((chip) => (
                  <button type="button" key={chip.id} disabled={busy} onClick={() => ask(chip.question, chip.id)}>
                    {t(chip.label)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="public-assistant__form" onSubmit={(event) => { event.preventDefault(); ask(draft) }}>
            <label className="public-assistant__sr-only" htmlFor="public-assistant-question">{t('Ask a question about RentEase')}</label>
            <input id="public-assistant-question" value={draft} maxLength={500}
              onChange={(event) => setDraft(event.target.value)} placeholder={t('Ask about RentEase…')} disabled={busy} />
            <button type="submit" className="btn btn--accent" disabled={busy || !draft.trim()}>{busy ? t('Thinking…') : t('Ask')}</button>
          </form>
          <p className="public-assistant__note">{t('This assistant answers general questions only and cannot access private account details.')}</p>
        </div>
      </section>
    </>
  )
}
