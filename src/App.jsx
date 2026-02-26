import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { InventoryProvider } from './context/InventoryContext'
import { RepairsProvider } from './context/RepairsContext'
import { CartProvider } from './context/CartContext'
import LoginPage from './pages/LoginPage'
// import Dashboard from './pages/Dashboard' // Replaced by AdminPanel components
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

function App() {
  return (
    <AuthProvider>
      <InventoryProvider>
        <RepairsProvider>
          <CartProvider>
            <BrowserRouter>
              <Routes>
                {/* Auth */}
                <Route path="/" element={<LoginPage />} />

                {/* Admin Panel Layout & Nested Routes */}
                <Route path="/admin" element={<AdminPanel />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="inventory" element={<InventoryTab />} />
                  <Route path="insights" element={<InsightsTab />} />
                  <Route path="expenses" element={<ExpensesTab />} />
                  <Route path="repairs" element={<RepairsTab />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>

                {/* Legacy Dashboard Route for convenience (redirect to new admin dashboard) */}
                <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />

                {/* Salesman Dashboard */}
                <Route path="/salesman" element={<SalesmanDashboard />} />
                <Route path="/salesman/latest-dashboard" element={<LatestDashboard />} />

                {/* Catch-all 404 */}
                <Route path="*" element={<ComingSoonPage title="Page Not Found" icon="🔍" />} />
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
