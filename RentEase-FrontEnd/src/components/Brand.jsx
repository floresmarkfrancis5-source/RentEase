import { Link } from 'react-router-dom'
import { useSettings } from '../context/SettingsContext'
import { assetUrl, splitBrand } from '../lib/brand'

/** Logo (if uploaded) + two-tone site name with the animated gradient on the last word. */
export default function Brand({ to = '/', sub = true }) {
  const { settings } = useSettings()
  const [a, b] = splitBrand(settings.site_name)
  const logo = assetUrl(settings.logo_url)
  return (
    <Link className="brand" to={to} aria-label={`${settings.site_name} home`}>
      {logo ? (
        <img className="brand__logo" src={logo} alt="" />
      ) : (
        <span className="brand__mark" aria-hidden="true">{settings.site_name.trim().charAt(0).toUpperCase()}</span>
      )}
      <b>{a}{a && /\s/.test(settings.site_name.trim()) ? " " : ""}<span className="brand-hana">{b}</span></b>
      {sub && settings.site_tagline && <span className="brand-sub">{settings.site_tagline}</span>}
    </Link>
  )
}
