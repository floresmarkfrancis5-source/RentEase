import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Hero from '../components/Hero'
import { Reveal } from '../components/motion'
import Preloader from '../components/Preloader'
import { useSettings } from '../context/SettingsContext'

const MARQUEE = ['Monthly billing', 'Pay with GCash & card', 'Downloadable receipts', 'Email reminders', 'Repair requests', 'Property map']

/** Small "screenshots" drawn with markup, so no image files are needed. */
const Mock = {
  Bill: () => (
    <div className="mock">
      <div className="mock__row"><span>Unit 2B · November</span><span className="tag tag--ok">Paid</span></div>
      <div className="mock__big">₱4,500.00</div>
      <div className="mock__line" /><div className="mock__line mock__line--s" />
      <div className="mock__row"><span>Receipt</span><b>RCPT-20261118-00012</b></div>
    </div>
  ),
  Bills: () => (
    <div className="mock">
      {[['Unit 1A', '₱6,500', 'ok', 'Paid'], ['Unit 2B', '₱4,500', 'ok', 'Paid'], ['Unit 3C', '₱5,200', 'warn', 'Unpaid'], ['Unit 4A', '₱5,800', 'bad', 'Overdue']].map(([u, a, t, l]) => (
        <div className="mock__row mock__row--table" key={u}><span>{u}</span><span>{a}</span><span className={`tag tag--${t}`}>{l}</span></div>
      ))}
      <div className="mock__bars">{[40, 62, 55, 78, 70, 92].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
    </div>
  ),
  Pay: () => (
    <div className="mock">
      <div className="mock__row"><span>Pay December rent</span><b>₱4,500.00</b></div>
      <div className="mock__pill mock__pill--on">GCash</div>
      <div className="mock__pill">Maya</div>
      <div className="mock__pill">Credit / debit card</div>
      <div className="mock__btn">Pay now →</div>
    </div>
  ),
  Fix: () => (
    <div className="mock">
      <div className="mock__row"><span>Leaking faucet</span><span className="tag tag--warn">In progress</span></div>
      <ol className="mock__steps"><li className="done">Request sent</li><li className="done">Landlord reviewed</li><li>Repair scheduled</li><li>Resolved</li></ol>
    </div>
  ),
}

const CARDS = [
  { tag: 'Properties', title: 'Everything in one record', text: 'Properties, units, tenants and leases — with the map location of each building — instead of scattered notebooks and chat threads.', Art: Mock.Bills },
  { tag: 'Billing', title: 'Bills that write themselves', text: 'One bill per tenant every month, with due dates and automatic overdue tracking. Run it twice and it never double-bills.', Art: Mock.Bill },
  { tag: 'Payments', title: 'Pay rent from the phone', text: 'Tenants pay with GCash, Maya or card. The bill turns Paid on its own and an official receipt is emailed.', Art: Mock.Pay },
  { tag: 'Maintenance', title: 'Repairs nobody forgets', text: 'Tenants report what is broken; you update the status and they are notified. A clear trail for both sides.', Art: Mock.Fix },
]

const FACTS = [
  ['GCash · Maya', 'Card payments'],
  ['Downloadable receipts', 'Available anytime'],
  ['Auto', 'Monthly billing'],
  ['Light / Dark', 'Your choice'],
]

export default function Home() {
  const { settings } = useSettings()
  const { user } = useAuth()
  const [play, setPlay] = useState(false)
  const tenantHome = user?.role === 'tenant'
  const s = tenantHome ? settings : {
    ...settings,
    site_name: 'RentEase',
    site_tagline: 'Rental billing, made effortless',
    hero_title: 'Rent collection, without the notebook.',
    hero_subtitle: 'Units, tenants, monthly billing, online payments and repair requests — in one calm, centralized place.',
    hero_cta_text: 'Get started',
    hero_image_url: '',
    logo_url: '',
  }

  if (tenantHome) {
    return <Hero s={s} tenant play />
  }

  return (
    <>
      <Preloader onDone={() => setPlay(true)} />
      <Hero s={s} play={play} defaultImage />

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1, 2, 3].map((k) => (
            <div className="mq" key={k}>
              {MARQUEE.map((m) => <span key={m}>{m}</span>)}
            </div>
          ))}
        </div>
      </div>

      <section className="block" id="features">
        <div className="wrap">
          <div className="section-head">
            <Reveal as="h2">A look inside {s.site_name}</Reveal>
            <Reveal as="p" delay=".1s">Scroll through what landlords and tenants get. Everything rent day needs, calmly in one place.</Reveal>
          </div>
          <div className="g-stack">
            {CARDS.map(({ tag, title, text, Art }, i) => (
              <article className="g-card" style={{ '--i': i }} key={tag}>
                <div className="g-text">
                  <span className="g-count">{String(i + 1).padStart(2, '0')} / {String(CARDS.length).padStart(2, '0')}</span>
                  <span className="g-type">{tag}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <Link className="btn btn-ghost" to="/login">Log in to try it</Link>
                </div>
                <div className="g-photo ph"><Art /></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <Reveal className="facts">
            {FACTS.map(([a, b]) => <div key={b}><strong>{a}</strong><span>{b}</span></div>)}
          </Reveal>
          <Reveal className="cta-band">
            <div>
              <h2>Ready to collect rent the easy way?</h2>
              <p>Landlords set everything up in minutes. Tenants just log in, see what is due and pay.</p>
            </div>
            <div className="cta-actions">
              <Link className="btn" to="/login">{s.hero_cta_text}</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}
