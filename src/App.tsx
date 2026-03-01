import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Catalog from './pages/Catalog';
import Staff from './pages/Staff';
import Receipts from './pages/Receipts';
import DeliveryDashboard from './pages/DeliveryDashboard';
import CleanerDashboard from './pages/CleanerDashboard';
import Layout from './components/Layout';

function ProtectedRoutes() {
  const { session, profile, roles, isAdmin, isDelivery, isCleaner, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  // No roles at all
  if (roles.length === 0 && profile && !profile.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center p-8">
          <p className="text-2xl font-bold text-red-500 mb-2">Access Denied</p>
          <p className="text-gray-500 mb-4">You don't have staff access. Contact your admin.</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={
          isAdmin ? <Navigate to="/dashboard" replace /> :
          isDelivery ? <Navigate to="/delivery" replace /> :
          isCleaner ? <Navigate to="/cleaner" replace /> :
          <Navigate to="/dashboard" replace />
        } />

        {/* Admin-only routes */}
        {isAdmin && (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/receipts" element={<Receipts />} />
          </>
        )}

        {/* Delivery man route */}
        {isDelivery && <Route path="/delivery" element={<DeliveryDashboard />} />}

        {/* Cleaner route */}
        {isCleaner && <Route path="/cleaner" element={<CleanerDashboard />} />}

        {/* Fallback */}
        <Route path="*" element={
          isAdmin ? <Navigate to="/dashboard" replace /> :
          isDelivery ? <Navigate to="/delivery" replace /> :
          <Navigate to="/cleaner" replace />
        } />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
