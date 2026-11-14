import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import DashLayout from './components/DashLayout'
import Footer from './components/Footer'
import Header from './components/Header'
import { PageMotion } from './components/motion'
import ProtectedRoute from './components/ProtectedRoute'
import { LoadingHouse } from './components/ui'

const AdminBills = lazy(() => import('./pages/admin/Bills'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const Chats = lazy(() => import('./pages/Chats'))
const AdminAssistant = lazy(() => import('./pages/admin/Assistant'))
const AdminLeases = lazy(() => import('./pages/admin/Leases'))
const AdminMaintenance = lazy(() => import('./pages/admin/Maintenance'))
const AdminNotifications = lazy(() => import('./pages/admin/Notifications'))
const AdminPayments = lazy(() => import('./pages/admin/Payments'))
const AdminProperties = lazy(() => import('./pages/admin/Properties'))
const AdminTenants = lazy(() => import('./pages/admin/Tenants'))
const AdminTransfers = lazy(() => import('./pages/admin/TransferRequests'))
const AdminUnits = lazy(() => import('./pages/admin/Units'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const PasswordRecovery = lazy(() => import('./pages/PasswordRecovery'))
const ActivateTenant = lazy(() => import('./pages/ActivateTenant'))
const AdminSettings = lazy(() => import('./pages/AdminSettings'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Profile = lazy(() => import('./pages/Profile'))
const Register = lazy(() => import('./pages/Register'))
const SuperadminDashboard = lazy(() => import('./pages/SuperadminDashboard'))
const TenantBills = lazy(() => import('./pages/tenant/Bills'))
const TenantMaintenance = lazy(() => import('./pages/tenant/Maintenance'))
const TenantOverview = lazy(() => import('./pages/tenant/Overview'))
const TenantTransfers = lazy(() => import('./pages/tenant/Transfers'))

export default function App() {
  const { pathname } = useLocation()
  const bleed = pathname === '/' || pathname === '/login' || pathname === '/register' || pathname === '/onboarding' // full-width pages (hero / split auth / setup)
  const isDash = pathname.startsWith('/admin') || pathname.startsWith('/tenant')
  const isChatPage = pathname === '/admin/chats' || pathname === '/tenant/chats'
  const isChatWorkspace = isChatPage || pathname === '/admin/assistant'

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <span className="ambient__blob ambient__blob--1" />
        <span className="ambient__blob ambient__blob--2" />
        <span className="ambient__blob ambient__blob--3" />
      </div>
      <PageMotion />
      <Header />
      <main className={bleed ? 'main-bleed' : isDash ? `main-dash${isChatWorkspace ? ' main-dash--chat' : ''}` : 'page'}>
        <Suspense fallback={<LoadingHouse label="Opening your page…" className="loading-house--route" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/activate" element={<ActivateTenant />} />
            <Route path="/forgot-password" element={<PasswordRecovery />} />
            <Route path="/reset-password" element={<PasswordRecovery />} />
            <Route path="/onboarding" element={<ProtectedRoute role="admin"><Onboarding /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
            <Route path="/superadmin" element={<ProtectedRoute role="superadmin"><SuperadminDashboard /></ProtectedRoute>} />

            <Route path="/admin" element={<ProtectedRoute role="admin"><DashLayout role="admin" /></ProtectedRoute>}>
              <Route index element={<AdminDashboard />} />
              <Route path="properties" element={<AdminProperties />} />
              <Route path="units" element={<AdminUnits />} />
              <Route path="tenants" element={<AdminTenants />} />
              <Route path="chats" element={<Chats />} />
              <Route path="leases" element={<AdminLeases />} />
              <Route path="bills" element={<AdminBills />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="maintenance" element={<AdminMaintenance />} />
              <Route path="transfers" element={<AdminTransfers />} />
              <Route path="assistant" element={<AdminAssistant />} />
              <Route path="notifications" element={<AdminNotifications />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>

            <Route path="/tenant" element={<ProtectedRoute role="tenant"><DashLayout role="tenant" /></ProtectedRoute>}>
              <Route index element={<TenantOverview />} />
              <Route path="bills" element={<TenantBills />} />
              <Route path="chats" element={<Chats />} />
              <Route path="maintenance" element={<TenantMaintenance />} />
              <Route path="transfers" element={<TenantTransfers />} />
            </Route>

            <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
            <Route path="*" element={<div className="auth-wrap"><h1 className="page-title">Page not found</h1></div>} />
          </Routes>
        </Suspense>
      </main>
      {pathname !== '/login' && !isDash && !isChatPage && <Footer />}
    </>
  )
}
