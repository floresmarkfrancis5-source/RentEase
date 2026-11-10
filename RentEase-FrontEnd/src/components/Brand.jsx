import { Link } from 'react-router-dom'
import BrandMark from './BrandMark'
import { useLanguage } from '../context/LanguageContext'

/** RentEase platform branding stays fixed in the site header. */
export default function Brand({ to = '/', sub = true }) {
  const { t } = useLanguage()
  return (
    <Link className="brand" to={to} aria-label={`RentEase ${t('Home')}`}>
      <span className="brand__mark"><BrandMark /></span>
      <b>Rent<span className="brand-hana">Ease</span></b>
      {sub && <span className="brand-sub">{t('Rental billing, made effortless')}</span>}
    </Link>
  )
}
