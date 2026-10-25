import { useEffect, useState } from 'react'
import { useSettings } from '../context/SettingsContext'
import { splitBrand } from '../lib/brand'
import { reducedMotion } from './motion'

const KEY = 'rentease-intro'
const seen = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return true } }

/** Short intro curtain, once per visit, only when the visitor lands on the home page. */
export default function Preloader({ onDone }) {
  const { settings } = useSettings()
  const [phase, setPhase] = useState(() => (reducedMotion() || seen() ? 'gone' : 'show'))
  const [a, b] = splitBrand(settings.site_name)

  useEffect(() => {
    if (phase === 'gone') { onDone(); return undefined }
    try { sessionStorage.setItem(KEY, '1') } catch { /* ignore */ }
    const t1 = setTimeout(() => { setPhase('done'); onDone() }, 1900)
    const t2 = setTimeout(() => setPhase('gone'), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [phase === 'gone']) // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'gone') return null
  return (
    <div className={`preloader${phase === 'done' ? ' done' : ''}`} aria-hidden="true">
      <div>
        <b>{a && `${a} `}{b}</b>
        <span>{settings.site_tagline}</span>
        <div className="pre-bar"><i /></div>
      </div>
    </div>
  )
}
