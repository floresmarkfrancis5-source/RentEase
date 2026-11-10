import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

function Flag({ language }) {
  if (language === 'en') {
    return (
      <svg className="language-picker__flag" viewBox="0 0 60 40" aria-hidden="true">
        <path fill="#21468b" d="M0 0h60v40H0z" />
        <path stroke="#fff" strokeWidth="8" d="m0 0 60 40M60 0 0 40" />
        <path stroke="#c8102e" strokeWidth="3" d="m0 0 60 40M60 0 0 40" />
        <path stroke="#fff" strokeWidth="13" d="M30 0v40M0 20h60" />
        <path stroke="#c8102e" strokeWidth="7" d="M30 0v40M0 20h60" />
      </svg>
    )
  }

  return (
    <svg className="language-picker__flag" viewBox="0 0 60 40" aria-hidden="true">
      <path fill="#0038a8" d="M0 0h60v20H0z" />
      <path fill="#ce1126" d="M0 20h60v20H0z" />
      <path fill="#fff" d="M0 0v40l30-20z" />
      <circle cx="10" cy="20" r="3.1" fill="#fcd116" />
      <path fill="#fcd116" d="m10 11 .8 2.4 2.5.1-2 1.5.7 2.4-2-1.4-2 1.4.7-2.4-2-1.5 2.5-.1zM10 22l.8 2.4 2.5.1-2 1.5.7 2.4-2-1.4-2 1.4.7-2.4-2-1.5 2.5-.1zM20 17l.8 2.4 2.5.1-2 1.5.7 2.4-2-1.4-2 1.4.7-2.4-2-1.5 2.5-.1z" />
    </svg>
  )
}

const languages = [
  { code: 'en', short: 'ENG', name: 'English' },
  { code: 'tl', short: 'TAG', name: 'Tagalog' },
]

export default function LanguagePicker() {
  const { language, setLanguage, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const trigger = useRef(null)
  const menu = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const away = (event) => !box.current?.contains(event.target) && setOpen(false)
    const escape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }

    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    menu.current?.querySelector('[aria-checked="true"]')?.focus()

    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const moveFocus = (event) => {
    const items = [...(menu.current?.querySelectorAll('[role="menuitemradio"]') || [])]
    const current = items.indexOf(document.activeElement)
    let next = current

    if (event.key === 'ArrowDown') next = (current + 1) % items.length
    else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return

    event.preventDefault()
    items[next]?.focus()
  }

  const selectLanguage = (code) => {
    setLanguage(code)
    setOpen(false)
    trigger.current?.focus()
  }

  const selected = languages.find((item) => item.code === language) || languages[0]

  return (
    <div className="language-picker" ref={box}>
      <button
        ref={trigger}
        type="button"
        className="language-picker__trigger"
        aria-label={t('Language / Wika')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Flag language={selected.code} />
        <span>{selected.short}</span>
        <svg className="language-picker__chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="language-picker__menu" role="menu" aria-label={t('Language / Wika')} ref={menu} onKeyDown={moveFocus}>
          {languages.map((item) => (
            <button
              key={item.code}
              type="button"
              role="menuitemradio"
              aria-checked={selected.code === item.code}
              tabIndex={-1}
              className="language-picker__option"
              onClick={() => selectLanguage(item.code)}
            >
              <Flag language={item.code} />
              <span>{t(item.name)}</span>
              <span className="language-picker__code">{item.short}</span>
              {selected.code === item.code && (
                <svg className="language-picker__check" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m4 10 4 4 8-8" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
