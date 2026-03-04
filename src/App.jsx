import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { InventoryProvider } from './context/InventoryContext'
import { RepairsProvider } from './context/RepairsContext'
import { CartProvider } from './context/CartContext'
import LoginPage from './pages/LoginPage'
import SalesmanDashboard from './pages/SalesmanDashboard'
import LatestDashboard from './pages/LatestDashboard'
import InventoryManager from './pages/InventoryManager'
import ComingSoonPage from './pages/ComingSoonPage'
import AdminPanel from './pages/AdminPanel'
import AdminDashboard from './components/admin/AdminDashboard'
import InventoryTab from './components/admin/InventoryTab'
import InsightsTab from './components/admin/InsightsTab'
import ExpensesTab from './components/admin/ExpensesTab'
import AdminSettings from './components/admin/AdminSettings'
import RepairsTab from './components/admin/RepairsTab'
import PWAInstallButton from './components/PWAInstallButton'
import { supabaseConfigError } from './supabaseClient'

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
  return role === 'super_admin' ? '/admin/dashboard' : '/admin/owner-dashboard'
}

function AdminGuard({ children }) {
  const { user, role, logout } = useAuth()
  const hasUser = Boolean(user)
  const allowed = hasUser && isAdminRole(role)

  useEffect(() => {
    if (hasUser && !allowed) {
      logout()
    }
  }, [allowed, hasUser, logout])

  if (!allowed) {
    return <Navigate to="/admin" replace />
  }

  return children
}

function SalesmanGuard({ children }) {
  const { user, role } = useAuth()
  const normalizedRole = normalizeRouteRole(role)
  const allowed = Boolean(user) && normalizedRole === 'salesman'

  if (!allowed) {
    return <Navigate to="/" replace />
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
    <AuthProvider>
      <InventoryProvider>
        <RepairsProvider>
          <CartProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<LoginPage mode="salesman" />} />
                <Route path="/admin" element={<LoginPage mode="admin" />} />

                <Route path="/admin/*" element={<AdminGuard><AdminPanel /></AdminGuard>}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="owner-dashboard" element={<AdminDashboard />} />
                  <Route path="inventory" element={<InventoryTab />} />
                  <Route path="insights" element={<InsightsTab />} />
                  <Route path="expenses" element={<ExpensesTab />} />
                  <Route path="repairs" element={<RepairsTab />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>

                <Route path="/dashboard" element={<AdminGuard><LegacyDashboardRedirect /></AdminGuard>} />
                <Route path="/inventory-manager" element={<AdminGuard><InventoryManager /></AdminGuard>} />

                <Route path="/salesman" element={<Navigate to="/salesman/dashboard" replace />} />
                <Route path="/salesman/dashboard" element={<SalesmanGuard><SalesmanDashboard /></SalesmanGuard>} />
                <Route path="/salesman/latest-dashboard" element={<SalesmanGuard><LatestDashboard /></SalesmanGuard>} />

                <Route path="*" element={<ComingSoonPage title="Page Not Found" icon="404" />} />
              </Routes>
              <PWAInstallButton />
            </BrowserRouter>
          </CartProvider>
        </RepairsProvider>
      </InventoryProvider>
    </AuthProvider>
  )
}

export default App
