import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { assetUrl, splitHeadline } from '../lib/brand'
import HeroArt from './HeroArt'
import { reducedMotion, useDust } from './motion'
import { useLanguage } from '../context/LanguageContext'

const FEATS = [
  ['Units &', 'leases', 'M6 40V10l18-6 18 6v30M6 40h36M16 18h4M28 18h4M16 26h4M28 26h4M20 40v-8h8v8'],
  ['Monthly', 'billing', 'M12 4h24v40l-4-3-4 3-4-3-4 3-4-3-4 3zM18 14h12M18 21h12M18 28h7'],
  ['Pay with', 'GCash & card', 'M4 12h40a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V14a2 2 0 0 1 2-2zM2 20h44M10 29h10'],
  ['Repair', 'requests', 'M30 8a10 10 0 0 0-12 13L6 33l5 5 12-12a10 10 0 0 0 13-12l-6 6-5-1-1-5z'],
  ['AI rental', 'assistant', 'M8 8h32a4 4 0 0 1 4 4v17a4 4 0 0 1-4 4H20l-10 7v-7H8a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4Zm8 12h.01M24 20h.01M32 20h.01M19 27h10'],
]

/**
 * Full-bleed homepage hero. Takes settings as props so the admin page can preview a draft
 * (compact = smaller, no scroll effects; inert = links are not focusable).
 */
export default function Hero({ s, compact = false, inert = false, play = true, tenant = false, defaultImage = false, marketing = false }) {
  const { t } = useLanguage()
  const root = useRef(null)
  const media = useRef(null)
  const copy = useRef(null)
  const dust = useRef(null)
  const [l1, l2] = splitHeadline(t(s.hero_title))
  const img = defaultImage ? '/images/rentease-homepage-default.jpg' : assetUrl(s.hero_image_url)
  const [imgOk, setImgOk] = useState(true)
  useEffect(() => setImgOk(true), [img])

  useDust(dust, root, !compact)

  // parallax: the photo moves slower than the text, the text fades as you scroll away
  useEffect(() => {
    if (compact || reducedMotion()) return undefined
    let tick = false
    const on = () => {
      if (tick) return
      tick = true
      requestAnimationFrame(() => {
        const y = window.scrollY
        const vh = window.innerHeight
        if (y < vh * 1.3) {
          if (media.current) media.current.style.transform = `translate3d(0, ${y * 0.22}px, 0)`
          if (copy.current) {
            copy.current.style.transform = `translate3d(0, ${y * -0.07}px, 0)`
            copy.current.style.opacity = String(Math.max(0, 1 - y / (vh * 0.8)))
          }
        }
        tick = false
      })
    }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [compact])

  return (
    <section ref={root} className={`hero${compact ? ' hero--compact' : ''}${marketing ? ' hero--marketing' : ''}${play ? ' play' : ''}`}>
      <div className="hero-media" ref={media}>
        {img && imgOk ? (
          <img src={img} alt="" fetchpriority="high" onError={() => setImgOk(false)} />
        ) : (
          <HeroArt from={s.hero_color_from} to={s.hero_color_to} />
        )}
      </div>
      <div className="hero-shade" />
      <div className="hero-glow" />
      {!compact && <canvas className="dust" ref={dust} aria-hidden="true" />}

      <div className="wrap">
        <div className="hero-copy" ref={copy}>
          <span className="eyebrow rv" style={{ '--d': 0.05 }}>{tenant ? t('Your rental home') : t(s.site_tagline || s.site_name)}</span>
          <h1>
            <span className="line" style={{ '--i': 0 }}><span>{l1}</span></span>
            {l2 && <span className="line" style={{ '--i': 1 }}><span className="hana">{l2}</span></span>}
          </h1>
          <p className="lead rv" style={{ '--d': 0.55 }}>{t(s.hero_subtitle)}</p>

          {!compact && !tenant && (
            <div className="hero-feats">
              {FEATS.map(([a, b, d], i) => (
                <div className="feat rv" style={{ '--d': 0.75 + i * 0.1 }} key={a}>
                  <svg viewBox="0 0 48 48" aria-hidden="true"><path d={d} /></svg>
                  <span>{a}<br />{b}</span>
                </div>
              ))}
            </div>
          )}

          <Link to={tenant ? '/tenant' : '/login'} className="btn btn-light rv" style={{ '--d': 1.2 }} tabIndex={inert ? -1 : undefined}>
            {t(s.hero_cta_text)}
            <svg className="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>

          {!compact && !tenant && <div className="hero-tag rv" style={{ '--d': 1.3 }}><i />{t('Less paperwork')}<br />{t('More peace of mind')}</div>}
        </div>
      </div>

      {!compact && !tenant && <div className="scroll-cue rv" style={{ '--d': 1.6 }} aria-hidden="true"><span>Scroll</span><i /></div>}
    </section>
  )
}
