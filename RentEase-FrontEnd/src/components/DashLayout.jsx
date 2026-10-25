import { NavLink, Outlet } from 'react-router-dom'
import Glass from './Glass'

const ADMIN = [
  ['/admin', 'Dashboard', true], ['/admin/properties', 'Properties'], ['/admin/units', 'Units'], ['/admin/tenants', 'Tenants'],
  ['/admin/leases', 'Leases'], ['/admin/bills', 'Bills'], ['/admin/payments', 'Payments'],
  ['/admin/maintenance', 'Maintenance'], ['/admin/transfers', 'Transfer requests'], ['/admin/assistant', 'AI assistant'], ['/admin/settings', 'Settings'],
]
const TENANT = [['/tenant', 'Overview', true], ['/tenant/bills', 'My bills'], ['/tenant/maintenance', 'Repairs'], ['/tenant/transfers', 'Unit transfer']]

export default function DashLayout({ role }) {
  const links = role === 'admin' ? ADMIN : TENANT
  return (
    <div className="dash">
      <Glass as="nav" className="sidenav" aria-label={role === 'admin' ? 'Landlord menu' : 'Tenant menu'}>
        {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
      </Glass>
      <div className="dash__main"><Outlet /></div>
    </div>
  )
}
