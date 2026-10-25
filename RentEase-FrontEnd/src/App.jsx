import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import DashLayout from './components/DashLayout'
import Footer from './components/Footer'
import Header from './components/Header'
import { PageMotion } from './components/motion'
import ProtectedRoute from './components/ProtectedRoute'
import AdminBills from './pages/admin/Bills'
import AdminDashboard from './pages/admin/Dashboard'
import AdminAssistant from './pages/admin/Assistant'
import AdminLeases from './pages/admin/Leases'
import AdminMaintenance from './pages/admin/Maintenance'
import AdminNotifications from './pages/admin/Notifications'
import AdminPayments from './pages/admin/Payments'
import AdminProperties from './pages/admin/Properties'
import AdminTenants from './pages/admin/Tenants'
import AdminTransfers from './pages/admin/TransferRequests'
import AdminUnits from './pages/admin/Units'
import Onboarding from './pages/Onboarding'
import PasswordRecovery from './pages/PasswordRecovery'
import AdminSettings from './pages/AdminSettings'
import ChangePassword from './pages/ChangePassword'
import Home from './pages/Home'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Register from './pages/Register'
import SuperadminDashboard from './pages/SuperadminDashboard'
import TenantBills from './pages/tenant/Bills'
import TenantMaintenance from './pages/tenant/Maintenance'
import TenantOverview from './pages/tenant/Overview'
import TenantTransfers from './pages/tenant/Transfers'

export default function App() {
  const { pathname } = useLocation()
  const bleed = pathname === '/' || pathname === '/login' || pathname === '/register' // full-width pages (hero / split auth)

  return (
    <>
      <div className="ambient" aria-hidden="true">
        <span className="ambient__blob ambient__blob--1" />
        <span className="ambient__blob ambient__blob--2" />
        <span className="ambient__blob ambient__blob--3" />
      </div>
      <PageMotion />
      <Header />
      <main className={bleed ? 'main-bleed' : 'page'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
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
            <Route path="maintenance" element={<TenantMaintenance />} />
            <Route path="transfers" element={<TenantTransfers />} />
          </Route>

          <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<div className="auth-wrap"><h1 className="page-title">Page not found</h1></div>} />
        </Routes>
      </main>
      {pathname !== '/login' && <Footer />}
    </>
  )
}
