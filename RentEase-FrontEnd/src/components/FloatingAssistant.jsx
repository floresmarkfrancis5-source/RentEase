import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssistantAvatar from './AssistantAvatar'
import { useLanguage } from '../context/LanguageContext'
import { LoadingHouse } from './ui'

const AssistantPage = lazy(() => import('../pages/admin/Assistant'))

export default function FloatingAssistant({ handoffDraft: providedHandoffDraft, onHandoffChange: onProvidedHandoffChange } = {}) {
  const [open, setOpen] = useState(false)
  const [localHandoffDraft, setLocalHandoffDraft] = useState(null)
  const assistantFabRef = useRef(null)
  const navigate = useNavigate()
  const { t } = useLanguage()
  const handoffDraft = onProvidedHandoffChange ? providedHandoffDraft : localHandoffDraft
  const setHandoffDraft = onProvidedHandoffChange || setLocalHandoffDraft

  useEffect(() => {
    if (open) return undefined

    const trackAssistantGaze = (event) => {
      if (event.pointerType !== 'mouse') return
      const fab = assistantFabRef.current
      if (!fab) return
      const bounds = fab.getBoundingClientRect()
      const offsetX = (event.clientX - (bounds.left + bounds.width / 2)) / (window.innerWidth / 2)
      const offsetY = (event.clientY - (bounds.top + bounds.height / 2)) / (window.innerHeight / 2)
      fab.style.setProperty('--gaze-x', `${(Math.max(-1, Math.min(1, offsetX)) * 3.2).toFixed(2)}px`)
      fab.style.setProperty('--gaze-y', `${(Math.max(-1, Math.min(1, offsetY)) * 2.4).toFixed(2)}px`)
    }
    const resetAssistantGaze = () => {
      assistantFabRef.current?.style.removeProperty('--gaze-x')
      assistantFabRef.current?.style.removeProperty('--gaze-y')
    }

    window.addEventListener('pointermove', trackAssistantGaze)
    window.addEventListener('blur', resetAssistantGaze)
    return () => {
      window.removeEventListener('pointermove', trackAssistantGaze)
      window.removeEventListener('blur', resetAssistantGaze)
      resetAssistantGaze()
    }
  }, [open])

  return (
    <>
      <button
        ref={assistantFabRef}
        className={`ai-fab ${open ? 'ai-fab--open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={t(open ? 'Close assistant' : 'Open assistant')}
        title={t('Assistant')}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        ) : (
          <AssistantAvatar className="assistant-avatar--fab" trackPointer />
        )}
      </button>

      <div className={`ai-panel ${open ? 'ai-panel--open' : ''}`} aria-hidden={!open}>
        <div className="ai-panel__inner">
          <div className="ai-panel__body">
            <Suspense fallback={<LoadingHouse label="Opening RentEaseAssist…" className="loading-house--embedded" />}>
              <AssistantPage
                embedded
                handoffDraft={handoffDraft}
                onHandoffChange={setHandoffDraft}
                onClose={() => setOpen(false)}
                onMaximize={() => {
                  setOpen(false)
                  navigate('/admin/assistant')
                }}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}
