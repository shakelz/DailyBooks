import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { InventoryProvider } from './context/InventoryContext'
import { RepairsProvider } from './context/RepairsContext'
import { CartProvider } from './context/CartContext'
import { LanguageProvider } from './context/LanguageContext'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import SalesmanDashboard from './pages/SalesmanDashboard'
import LatestDashboard from './pages/LatestDashboard'
import AdminPanel from './pages/AdminPanel'
import InventoryTab from './components/admin/InventoryTab'
import InsightsTab from './components/admin/InsightsTab'
import ExpensesTab from './components/admin/ExpensesTab'
import AdminSettings from './components/admin/AdminSettings'
import RepairsTab from './components/admin/RepairsTab'
import PWAInstallButton from './components/PWAInstallButton'
import SalesmanDashboardErrorBoundary from './components/SalesmanDashboardErrorBoundary'
import { supabaseConfigError } from './supabaseClient'

const SALESMAN_LOGIN_PATH = '/terminal-access-v1'
const ADMIN_LOGIN_PATH = '/management-portal-v1'
const SALESMAN_DASHBOARD_PATH = `${SALESMAN_LOGIN_PATH}/dashboard`
const SALESMAN_LATEST_DASHBOARD_PATH = `${SALESMAN_LOGIN_PATH}/latest-dashboard`

function normalizeRouteRole(value = '') {
  const role = String(value || '').trim().toLowerCase()
  if (role === 'superadmin' || role === 'superuser') return 'super_admin'
  if (role === 'admin') return 'owner'
  return role
}

function isAdminRole(value = '') {
  const role = normalizeRouteRole(value)
  return role === 'super_admin' || role === 'owner'
}

function getAdminHomeByRole(value = '') {
  const role = normalizeRouteRole(value)
  return role === 'super_admin' ? `${ADMIN_LOGIN_PATH}/dashboard` : `${ADMIN_LOGIN_PATH}/owner-dashboard`
}

function AuthLoadingScreen() {
  return <div className="min-h-screen bg-slate-950" />
}

function AdminGuard({ children }) {
  const { user, role, logout, authLoading } = useAuth()
  if (authLoading) {
    return <AuthLoadingScreen />
  }
  const hasUser = Boolean(user)
  const allowed = hasUser && isAdminRole(role)

  useEffect(() => {
    if (hasUser && !allowed) {
      logout()
    }
  }, [allowed, hasUser, logout])

  if (!allowed) {
    return <Navigate to={SALESMAN_LOGIN_PATH} replace />
  }

  return children
}

function AdminRouteShell() {
  const { user, role, logout, authLoading } = useAuth()
  const location = useLocation()
  const isAdminLoginPath = location.pathname === ADMIN_LOGIN_PATH || location.pathname === `${ADMIN_LOGIN_PATH}/`
  if (authLoading) {
    return <AuthLoadingScreen />
  }
  const hasUser = Boolean(user)
  const allowed = hasUser && isAdminRole(role)

  useEffect(() => {
    if (hasUser && !allowed) {
      logout()
    }
  }, [allowed, hasUser, logout])

  if (isAdminLoginPath) {
    return allowed ? <LegacyDashboardRedirect /> : <LoginPage mode="admin" />
  }

  if (!allowed) {
    return <Navigate to={SALESMAN_LOGIN_PATH} replace />
  }

  return <AdminPanel />
}

function SalesmanGuard({ children }) {
  const { user, role, authLoading } = useAuth()
  if (authLoading) {
    return <AuthLoadingScreen />
  }
  const normalizedRole = normalizeRouteRole(role)
  const allowed = Boolean(user) && normalizedRole === 'salesman'

  if (!allowed) {
    return <Navigate to={SALESMAN_LOGIN_PATH} replace />
  }

  return children
}

function LegacyDashboardRedirect() {
  const { role } = useAuth()
  return <Navigate to={getAdminHomeByRole(role)} replace />
}

function App() {
  if (supabaseConfigError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full rounded-2xl border border-red-500/30 bg-slate-900/80 p-6 shadow-xl">
          <h1 className="text-xl font-bold text-red-400">Configuration Error</h1>
          <p className="mt-3 text-sm text-slate-300">The app cannot start because required environment variables are missing in this deployment.</p>
          <div className="mt-4 rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300 font-mono break-words">
            {supabaseConfigError}
          </div>
          <p className="mt-4 text-xs text-slate-400">Set these variables in Vercel project settings and redeploy.</p>
        </div>
      </div>
    )
  }

  return (
    <LanguageProvider>
      <AuthProvider>
        <InventoryProvider>
          <RepairsProvider>
            <CartProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path={SALESMAN_LOGIN_PATH} element={<LoginPage mode="salesman" />} />
                  <Route path={ADMIN_LOGIN_PATH} element={<LoginPage mode="admin" />} />

                  <Route path={`${ADMIN_LOGIN_PATH}/*`} element={<AdminRouteShell />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<SalesmanDashboardErrorBoundary><SalesmanDashboard adminView /></SalesmanDashboardErrorBoundary>} />
                    <Route path="owner-dashboard" element={<SalesmanDashboardErrorBoundary><SalesmanDashboard adminView /></SalesmanDashboardErrorBoundary>} />
                    <Route path="inventory" element={<InventoryTab />} />
                    <Route path="insights" element={<InsightsTab />} />
                    <Route path="expenses" element={<ExpensesTab />} />
                    <Route path="repairs" element={<RepairsTab />} />
                    <Route path="settings" element={<AdminSettings />} />
                  </Route>

                  <Route path={SALESMAN_DASHBOARD_PATH} element={<SalesmanGuard><SalesmanDashboardErrorBoundary><SalesmanDashboard /></SalesmanDashboardErrorBoundary></SalesmanGuard>} />
                  <Route path={SALESMAN_LATEST_DASHBOARD_PATH} element={<SalesmanGuard><LatestDashboard /></SalesmanGuard>} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                <PWAInstallButton />
              </BrowserRouter>
            </CartProvider>
          </RepairsProvider>
        </InventoryProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
