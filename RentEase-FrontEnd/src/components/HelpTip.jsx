import { useId, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'

export default function HelpTip({ text, label }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const id = useId()
  const { language } = useLanguage()
  const accessibleLabel = label || (language === 'tl' ? 'Kailangan ng tulong?' : 'More information')
  const visible = open || hovered || focused

  if (!text) return null

  return (
    <span className="help-tip" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        type="button"
        className="help-tip__trigger"
        aria-label={accessibleLabel}
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            setFocused(false)
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) {
            setOpen(false)
            setFocused(false)
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {visible && <span className="help-tip__content" id={id} role="tooltip">{text}</span>}
    </span>
  )
}
