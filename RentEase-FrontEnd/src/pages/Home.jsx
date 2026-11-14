import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Hero from '../components/Hero'
import AssistantAvatar from '../components/AssistantAvatar'
import { Reveal } from '../components/motion'
import Preloader from '../components/Preloader'
import { useSettings } from '../context/SettingsContext'
import AnnouncementBoard from '../components/AnnouncementBoard'
import FloatingAssistant from '../components/FloatingAssistant'
import PublicAssistant from '../components/PublicAssistant'

const MARQUEE = ['Monthly billing', 'Pay with GCash & card', 'Downloadable receipts', 'Email reminders', 'Repair requests', 'Property map']
const TENANT_MARQUEE = ['View bills', 'Check payment status', 'Download receipts', 'Message your landlord', 'Repair requests', 'Move requests']

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
  Assistant: () => (
    <div className="mock mock--assistant">
      <div className="mock__assistant-head"><AssistantAvatar className="mock__assistant-avatar" /><span><b>RentEase Assistant</b><small>Here to help with your rentals</small></span></div>
      <div className="mock__assistant-message">How many vacant units do I have?</div>
      <div className="mock__assistant-message mock__assistant-message--reply">You have 3 vacant units across your properties.</div>
      <div className="mock__assistant-suggestions"><span>Show me the units</span><span>Which property?</span></div>
    </div>
  ),
}

const TenantMock = {
  Bills: () => (
    <div className="mock">
      <div className="mock__row"><span>My current bill</span><span className="tag tag--warn">Due soon</span></div>
      <div className="mock__big">Rent bill</div>
      <div className="mock__line" /><div className="mock__line mock__line--s" />
      <div className="mock__btn">View bill details</div>
    </div>
  ),
  Receipts: () => (
    <div className="mock">
      <div className="mock__row"><b>Payment history</b><span>Confirmed</span></div>
      <div className="mock__row mock__row--table"><span>Rent payment</span><span className="tag tag--ok">Paid</span></div>
      <div className="mock__row"><span>Receipt</span><b>PDF available</b></div>
      <div className="mock__btn">Download receipt</div>
    </div>
  ),
  Repairs: () => (
    <div className="mock">
      <div className="mock__row"><span>Repair request</span><span className="tag tag--warn">In progress</span></div>
      <ol className="mock__steps"><li className="done">Request submitted</li><li className="done">Landlord notified</li><li>Follow status updates</li></ol>
    </div>
  ),
  Chat: () => (
    <div className="mock mock--assistant">
      <div className="mock__assistant-head"><span className="mock__assistant-avatar" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19 19 5M8 5h11v11" /></svg></span><span><b>Landlord chat</b><small>Your rental conversation</small></span></div>
      <div className="mock__assistant-message">I have a question about my rental.</div>
      <div className="mock__assistant-message mock__assistant-message--reply">Send a message to your landlord.</div>
    </div>
  ),
  Requests: () => (
    <div className="mock">
      <div className="mock__row"><span>Move request</span><span className="tag tag--warn">Under review</span></div>
      <ol className="mock__steps"><li className="done">Request submitted</li><li>Landlord review</li><li>View request status</li></ol>
    </div>
  ),
}

const CARDS = [
  { tag: 'Properties', title: 'Everything in one record', text: 'Properties, units, tenants and leases — with the map location of each building — instead of scattered notebooks and chat threads.', Art: Mock.Bills },
  { tag: 'Billing', title: 'Bills that write themselves', text: 'One bill per tenant every month, with due dates and automatic overdue tracking. Run it twice and it never double-bills.', Art: Mock.Bill },
  { tag: 'Payments', title: 'Pay rent from the phone', text: 'Tenants pay with GCash, Maya or card. The bill turns Paid on its own and an official receipt is emailed.', Art: Mock.Pay },
  { tag: 'Maintenance', title: 'Repairs nobody forgets', text: 'Tenants report what is broken; you update the status and they are notified. A clear trail for both sides.', Art: Mock.Fix },
  { tag: 'RentEase Assistant', title: 'A simpler way to manage rentals', text: 'Ask about your properties, units, tenants, or rent in everyday language. Get help understanding your records and prepare drafts to review before anything changes.', Art: Mock.Assistant },
]

const TENANT_CARDS = [
  { tag: 'Bills', title: 'Keep up with rent and bills', text: 'Check your bills, due dates, and payment status in one place, then continue to an available online payment method.', Art: TenantMock.Bills, href: '/tenant/bills', action: 'View my bills' },
  { tag: 'Payments & receipts', title: 'Find confirmed payments', text: 'Review confirmed payments and download the receipts available for them.', Art: TenantMock.Receipts, href: '/tenant/bills', action: 'View payments' },
  { tag: 'Maintenance', title: 'Tell your landlord what needs fixing', text: 'Submit a maintenance request, include photos, and follow its status from your tenant account.', Art: TenantMock.Repairs, href: '/tenant/maintenance', action: 'Open repair requests' },
  { tag: 'Messages', title: 'Stay in touch with your landlord', text: 'Use tenant chat to ask questions and keep rental conversations together.', Art: TenantMock.Chat, href: '/tenant/chats', action: 'Open my chats' },
  { tag: 'Move requests', title: 'Request an early move or unit transfer', text: 'Submit an eligible move or unit-transfer request and follow its review status.', Art: TenantMock.Requests, href: '/tenant/transfers', action: 'View move requests' },
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
  const s = tenantHome ? {
    ...settings,
    hero_title: 'Your rental home, all in one place.',
    hero_subtitle: 'Check bills and payment status, find receipts, message your landlord, and follow repair or move requests.',
  } : {
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
    return (
      <>
        <Hero s={s} tenant play />
        <div className="marquee tenant-home__marquee" aria-hidden="true">
          <div className="marquee-track">
            {[0, 1, 2, 3].map((k) => (
              <div className="mq" key={k}>
                {TENANT_MARQUEE.map((item) => <span key={item}>{item}</span>)}
              </div>
            ))}
          </div>
        </div>
        <div className="tenant-home__announcements wrap">
          <AnnouncementBoard />
        </div>
        <section className="block tenant-home__features" id="tenant-features">
          <div className="wrap">
            <div className="section-head">
              <Reveal as="h2">Your RentEase tenant portal</Reveal>
              <Reveal as="p" delay=".1s">Take care of rent day and stay connected with your landlord, all from your tenant account.</Reveal>
            </div>
            <div className="g-stack">
              {TENANT_CARDS.map(({ tag, title, text, Art, href, action }, i) => (
                <article className="g-card" style={{ '--i': i }} key={tag}>
                  <div className="g-text">
                    <span className="g-count">{String(i + 1).padStart(2, '0')} / {String(TENANT_CARDS.length).padStart(2, '0')}</span>
                    <span className="g-type">{tag}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                    <Link className="btn btn-ghost" to={href}>{action}</Link>
                  </div>
                  <div className="g-photo ph" aria-hidden="true"><Art /></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <Preloader onDone={() => setPlay(true)} />
      <Hero s={s} play={play} defaultImage marketing />
      {!user && <PublicAssistant />}

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

      {user?.role === 'admin' && <FloatingAssistant />}
    </>
  )
}
