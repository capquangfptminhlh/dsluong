import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import TaxReportFlow from './pages/TaxReportFlow'
import History from './pages/History'
import MappedProducts from './pages/MappedProducts'
import Login from './pages/Login'
import Register from './pages/Register'
import AdminUsers from './pages/AdminUsers'
import Landing from './pages/Landing'

// Removed legacy SEO routes

import TaxGuide from './pages/TaxGuide'
import { HelmetProvider } from 'react-helmet-async'
import Finance from './pages/Finance'
import AdvancedCRM from './pages/AdvancedCRM'
import Overview from './pages/Overview'
import React, { useEffect, useState } from 'react'
import axios from 'axios'
import API_BASE from './config/api'

// Gắn token đăng nhập vào mọi request (thay cho X-User-Id cũ — backend không còn tin header đó)
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = 'Bearer ' + token;
  }
  return config;
});

// Token hết hạn / không hợp lệ -> đưa về trang đăng nhập
axios.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401 && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const isGh = window.location.pathname.startsWith('/dsluong');
      const target = isGh ? '/dsluong/login' : '/login';
      if (!window.location.pathname.includes('/login')) {
        window.location.href = target;
      }
    }
    return Promise.reject(err);
  }
);

// Placeholder for unbuilt ERP pages
const ComingSoon = ({ title }) => (
  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
      <span className="text-4xl">🚧</span>
    </div>
    <h2 className="text-2xl font-bold text-slate-800 mb-2">{title}</h2>
    <p className="text-slate-500 max-w-md">Tính năng này đang được phát triển trong Giai đoạn tiếp theo. Vui lòng quay lại sau!</p>
  </div>
);

// Phase 1 & 2 Pages
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import POS from './pages/POS'
import Orders from './pages/Orders'
import Appointments from './pages/Appointments'
import Customers from './pages/Customers'
import Inventory from './pages/Inventory'
import Reports from './pages/Reports'
import Staff from './pages/Staff'
import Settings from './pages/Settings'

import Units from './pages/Units'
import Cashbook from './pages/Cashbook'
import Debt from './pages/Debt'
import CustomerCRM from './pages/CustomerCRM'
import InventoryCheck from './pages/InventoryCheck'
import InventoryTransfer from './pages/InventoryTransfer'
import ProductCategories from './pages/ProductCategories'
import ProductPricing from './pages/ProductPricing'
import Returns from './pages/Returns'
import POSPayments from './pages/POSPayments'
import Barcode from './pages/Barcode'
import SettingsAutomation from './pages/SettingsAutomation'
import LoyaltySettings from './pages/LoyaltySettings'
import OmnichannelIntegration from './pages/OmnichannelIntegration'
import MiniAppZalo from './pages/MiniAppZalo'
import CRMInbox from './pages/CRMInbox'
import ProductBOM from './pages/ProductBOM'
import StaffHRM from './pages/StaffHRM'
import Promotions from './pages/Promotions'
import Rooms from './pages/Rooms'
import Commissions from './pages/Commissions'
import Suppliers from './pages/Suppliers'
import Purchase from './pages/Purchase'
import Shift from './pages/Shift'
import Backup from './pages/Backup'
import AuditLog from './pages/AuditLog'
import Batches from './pages/Batches'
import Combos from './pages/Combos'
import Serials from './pages/Serials'
import BranchesPage from './pages/Branches'
import SupplierOrders from './pages/SupplierOrders'

const AuthGuard = () => {
  const [isAuthorized, setIsAuthorized] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      setIsAuthorized(false);
      return;
    }

    // Xác thực token với server (thay cho /verify cũ chỉ check số điện thoại)
    axios.get(`${API_BASE}/api/auth/profile`)
      .then(() => setIsAuthorized(true))
      .catch((err) => {
        // Chỉ đăng xuất nếu token thực sự hết hạn/sai (401). Nếu mất mạng (Network Error) thì vẫn cho vào app để dùng Offline.
        if (err.response && err.response.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setIsAuthorized(false);
        } else {
          setIsAuthorized(true); // Cho phép vào chế độ offline
        }
      });
  }, [token]);

  if (isAuthorized === null) return <div className="flex h-screen items-center justify-center">Đang kiểm tra bảo mật...</div>;
  if (isAuthorized === false) return <Navigate to="/login" replace />;
  
  return <Outlet />;
};

const basename = typeof window !== 'undefined' && window.location.pathname.startsWith('/dsluong') ? '/dsluong' : '';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<Landing />} />



          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={<AuthGuard />}>
          <Route path="/app" element={<App />}>
            {/* Phase 1 Core */}
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="pos" element={<POS />} />
            <Route path="appointments" element={<Appointments />} />
            
            {/* Legacy Tax functionality kept for compliance */}
            <Route path="guide" element={<TaxGuide />} />
            <Route path="report" element={<TaxReportFlow />} />

            {/* Coming Soon Placeholders / Completed */}
            <Route path="pos/orders" element={<Orders />} />
            <Route path="pos/returns" element={<Returns />} />
            <Route path="pos/shift" element={<Shift />} />
            <Route path="pos/payments" element={<POSPayments />} />
            
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="overview" element={<Overview />} />
            <Route path="finance" element={<Finance />} />
            <Route path="customers" element={<Customers />} />
            <Route path="customers/crm" element={<AdvancedCRM />} />
            <Route path="customers/inbox" element={<CRMInbox />} />
            <Route path="customers/loyalty" element={<LoyaltySettings />} />
            <Route path="customers/care" element={<CustomerCRM />} />

            <Route path="products/categories" element={<ProductCategories />} />
            <Route path="products/barcode" element={<Barcode />} />
            <Route path="products/pricing" element={<ProductPricing />} />
            <Route path="products/bom" element={<ProductBOM />} />
            <Route path="products/combos" element={<Combos />} />
            <Route path="products/serials" element={<Serials />} />
            <Route path="products/units" element={<Units />} />

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
            
            <Route path="finance/cashbook" element={<Cashbook />} />
            <Route path="finance/debt" element={<Debt />} />
            <Route path="report" element={<TaxReportFlow />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/backup" element={<Backup />} />
            <Route path="settings/audit" element={<AuditLog />} />
            <Route path="settings/automation" element={<SettingsAutomation />} />
            <Route path="settings/omnichannel" element={<OmnichannelIntegration />} />
            <Route path="settings/miniapp" element={<MiniAppZalo />} />
            <Route path="settings/cloudflare" element={<ComingSoon title="Tích hợp Cloudflare" />} />
            
            <Route path="staff" element={<StaffHRM />} />
            <Route path="staff/commissions" element={<Commissions />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="promotions" element={<Promotions />} />
            
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </HelmetProvider>
  </StrictMode>,
)
