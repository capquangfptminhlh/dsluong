import { lazy, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import App from './App.jsx';
import API_BASE from './config/api';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import AppErrorBoundary from './components/AppErrorBoundary';
import { laSuperadmin } from './utils/quyen';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Products = lazy(() => import('./pages/Products'));
const POS = lazy(() => import('./pages/POS'));
const Orders = lazy(() => import('./pages/Orders'));
const Appointments = lazy(() => import('./pages/Appointments'));
const Customers = lazy(() => import('./pages/Customers'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const TaxGuide = lazy(() => import('./pages/TaxGuide'));
const TaxReportFlow = lazy(() => import('./pages/TaxReportFlow'));
const AuditWorkbench = lazy(() => import('./pages/AuditWorkbench'));
const Finance = lazy(() => import('./pages/Finance'));
const AdvancedCRM = lazy(() => import('./pages/AdvancedCRM'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const Units = lazy(() => import('./pages/Units'));
const Cashbook = lazy(() => import('./pages/Cashbook'));
const Debt = lazy(() => import('./pages/Debt'));
const CustomerCRM = lazy(() => import('./pages/CustomerCRM'));
const InventoryCheck = lazy(() => import('./pages/InventoryCheck'));
const InventoryTransfer = lazy(() => import('./pages/InventoryTransfer'));
const ProductCategories = lazy(() => import('./pages/ProductCategories'));
const ProductPricing = lazy(() => import('./pages/ProductPricing'));
const Returns = lazy(() => import('./pages/Returns'));
const POSPayments = lazy(() => import('./pages/POSPayments'));
const Barcode = lazy(() => import('./pages/Barcode'));
const SettingsAutomation = lazy(() => import('./pages/SettingsAutomation'));
const LoyaltySettings = lazy(() => import('./pages/LoyaltySettings'));
const OmnichannelIntegration = lazy(() => import('./pages/OmnichannelIntegration'));
const MiniAppZalo = lazy(() => import('./pages/MiniAppZalo'));
const CloudflareSettings = lazy(() => import('./pages/CloudflareSettings'));
const ProductBOM = lazy(() => import('./pages/ProductBOM'));
const StaffHRM = lazy(() => import('./pages/StaffHRM'));
const Promotions = lazy(() => import('./pages/Promotions'));
const Rooms = lazy(() => import('./pages/Rooms'));
const Commissions = lazy(() => import('./pages/Commissions'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Purchase = lazy(() => import('./pages/Purchase'));
const Shift = lazy(() => import('./pages/Shift'));
const Backup = lazy(() => import('./pages/Backup'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const Batches = lazy(() => import('./pages/Batches'));
const Combos = lazy(() => import('./pages/Combos'));
const Serials = lazy(() => import('./pages/Serials'));
const BranchesPage = lazy(() => import('./pages/Branches'));
const SupplierOrders = lazy(() => import('./pages/SupplierOrders'));

function AuthGuard() {
  const [status, setStatus] = useState('checking');
  const token = localStorage.getItem('token');

  useEffect(() => {
    let active = true;
    if (!token) {
      setStatus('denied');
      return () => { active = false; };
    }
    axios.get(`${API_BASE}/api/auth/profile`)
      .then((response) => {
        if (!active) return;
        const current = JSON.parse(localStorage.getItem('user') || '{}');
        localStorage.setItem('user', JSON.stringify({ ...current, ...response.data }));
        setStatus('allowed');
      })
      .catch(() => {
        if (!active) return;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setStatus('denied');
      });
    return () => { active = false; };
  }, [token]);

  if (status === 'checking') {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="surface flex items-center gap-3 px-5 py-4 text-sm font-semibold text-slate-600"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />Đang xác thực phiên AutoTax…</div></div>;
  }
  if (status === 'denied') return <Navigate to="/login" replace />;
  return <Outlet />;
}

function SuperadminGuard() {
  if (!laSuperadmin()) return <Navigate to="/app/overview" replace />;
  return <Outlet />;
}

export default function AppRouter() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<AuthGuard />}>
            <Route path="/app" element={<App />}>
              <Route index element={<Dashboard />} />
              <Route path="overview" element={<Dashboard />} />
              <Route path="products" element={<Products />} />
              <Route path="products/categories" element={<ProductCategories />} />
              <Route path="products/barcode" element={<Barcode />} />
              <Route path="products/pricing" element={<ProductPricing />} />
              <Route path="products/bom" element={<ProductBOM />} />
              <Route path="products/combos" element={<Combos />} />
              <Route path="products/serials" element={<Serials />} />
              <Route path="products/units" element={<Units />} />
              <Route path="pos" element={<POS />} />
              <Route path="pos/orders" element={<Orders />} />
              <Route path="pos/returns" element={<Returns />} />
              <Route path="pos/shift" element={<Shift />} />
              <Route path="pos/payments" element={<POSPayments />} />
              <Route path="purchase" element={<Purchase />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="supplier-orders" element={<SupplierOrders />} />
              <Route path="branches" element={<BranchesPage />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="inventory/in" element={<Inventory />} />
              <Route path="inventory/out" element={<Inventory />} />
              <Route path="inventory/transfer" element={<InventoryTransfer />} />
              <Route path="inventory/check" element={<InventoryCheck />} />
              <Route path="inventory/batches" element={<Batches />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/crm" element={<AdvancedCRM />} />
              <Route path="customers/loyalty" element={<LoyaltySettings />} />
              <Route path="customers/care" element={<CustomerCRM />} />
              <Route path="finance" element={<Finance />} />
              <Route path="finance/cashbook" element={<Cashbook />} />
              <Route path="finance/debt" element={<Debt />} />
              <Route path="reports" element={<Reports />} />
              <Route path="report" element={<TaxReportFlow />} />
              <Route path="audit" element={<AuditWorkbench />} />
              <Route path="guide" element={<TaxGuide />} />
              <Route path="staff" element={<StaffHRM />} />
              <Route path="staff/commissions" element={<Commissions />} />
              <Route path="rooms" element={<Rooms />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="settings" element={<Settings />} />
              <Route path="settings/audit" element={<AuditLog />} />
              <Route path="settings/automation" element={<SettingsAutomation />} />
              <Route path="settings/omnichannel" element={<OmnichannelIntegration />} />
              <Route path="settings/miniapp" element={<MiniAppZalo />} />
              <Route element={<SuperadminGuard />}>
                <Route path="settings/backup" element={<Backup />} />
                <Route path="settings/cloudflare" element={<CloudflareSettings />} />
                <Route path="admin/users" element={<AdminUsers />} />
              </Route>
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
