import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ClipboardList, Grid2X2, Home, LogOut, Menu, Search, ShoppingCart, UserRound, Warehouse } from 'lucide-react';
import axios from 'axios';
import API_BASE from './config/api';
import Sidebar from './components/Sidebar';
import AIAssistantWidget from './components/AIAssistantWidget';
import QuickSearch from './components/QuickSearch';
import AppErrorBoundary from './components/AppErrorBoundary';
import AutoTaxLoader from './components/AutoTaxLoader';
import NotificationCenter, { NotificationBell } from './components/NotificationCenter';

// Keep the most-specific paths before their parent routes because resolveTitle also
// supports nested detail URLs via startsWith(). Every authenticated top-level route
// has an explicit mobile shell title so an unrelated parent title never leaks in.
const TITLES = [
  ['/app/products/categories', 'Danh mục sản phẩm'],
  ['/app/products/barcode', 'In tem mã vạch'],
  ['/app/products/pricing', 'Bảng giá'],
  ['/app/products/bom', 'Định mức sản xuất'],
  ['/app/products/combos', 'Combo / bán theo bộ'],
  ['/app/products/serials', 'Serial / IMEI & bảo hành'],
  ['/app/products/units', 'Đơn vị tính'],
  ['/app/products', 'Sản phẩm & hàng hóa'],

  ['/app/pos/orders', 'Đơn hàng'],
  ['/app/pos/returns', 'Trả hàng & hoàn tiền'],
  ['/app/pos/shift', 'Ca thu ngân'],
  ['/app/pos/payments', 'Thanh toán POS'],
  ['/app/pos', 'Bán hàng'],

  ['/app/supplier-orders', 'Đặt hàng & trả hàng NCC'],
  ['/app/suppliers', 'Nhà cung cấp'],
  ['/app/purchase', 'Nhập hàng'],
  ['/app/branches', 'Chi nhánh & kho'],
  ['/app/inventory/transfer', 'Chuyển kho nội bộ'],
  ['/app/inventory/check', 'Kiểm kho'],
  ['/app/inventory/batches', 'Lô & hạn sử dụng'],
  ['/app/inventory/in', 'Nhập kho'],
  ['/app/inventory/out', 'Xuất kho'],
  ['/app/inventory', 'Kho hàng'],

  ['/app/customers/crm', 'CRM nâng cao'],
  ['/app/customers/loyalty', 'Khách hàng thân thiết'],
  ['/app/customers/care', 'Chăm sóc khách hàng'],
  ['/app/customers', 'Khách hàng'],

  ['/app/finance/cashbook', 'Sổ quỹ thu chi'],
  ['/app/finance/debt', 'Quản lý công nợ'],
  ['/app/finance', 'Thu chi & công nợ'],

  ['/app/reports', 'Báo cáo'],
  ['/app/report', 'Kiểm soát thuế'],
  ['/app/audit', 'Kiểm toán hóa đơn & chi phí'],
  ['/app/guide', 'Cẩm nang thuế'],

  ['/app/staff/commissions', 'Hoa hồng nhân viên'],
  ['/app/staff', 'Nhân sự'],
  ['/app/rooms', 'Phòng / khu vực'],
  ['/app/appointments', 'Lịch hẹn'],
  ['/app/promotions', 'Khuyến mãi'],

  ['/app/settings/backup', 'Sao lưu & khôi phục'],
  ['/app/settings/audit', 'Nhật ký thao tác'],
  ['/app/settings/automation', 'Tự động hóa'],
  ['/app/settings/omnichannel', 'Bán hàng đa kênh'],
  ['/app/settings/miniapp', 'MiniApp & Social Commerce'],
  ['/app/settings/cloudflare', 'Cloudflare Tunnel'],
  ['/app/settings', 'Cài đặt cửa hàng'],
  ['/app/admin/users', 'Quản trị hệ thống'],

  ['/app/overview', 'Tổng quan hôm nay'],
  ['/app', 'Tổng quan hôm nay'],
];

function resolveTitle(pathname) {
  return TITLES.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] || 'AutoTax';
}

function RouteLoading({ title }) {
  return <AutoTaxLoader label={`Đang mở ${title}…`} />;
}

function MobileBottomNav({ pathname, onMore }) {
  const navClass = (active) => `autotax-mobile-nav-item ${active ? 'is-active' : ''}`;
  return (
    <nav className="autotax-mobile-bottom-nav lg:hidden" aria-label="Điều hướng nhanh">
      <NavLink to="/app/overview" className={navClass(pathname === '/app' || pathname.startsWith('/app/overview'))}><Home className="h-5 w-5" /><span>Trang chủ</span></NavLink>
      <NavLink to="/app/pos" className={navClass(pathname === '/app/pos')}><ShoppingCart className="h-5 w-5" /><span>Bán hàng</span></NavLink>
      <NavLink to="/app/pos/orders" className={navClass(pathname.startsWith('/app/pos/orders') || pathname.startsWith('/app/pos/returns'))}><ClipboardList className="h-5 w-5" /><span>Đơn hàng</span></NavLink>
      <NavLink to="/app/inventory" className={navClass(pathname.startsWith('/app/inventory') || pathname.startsWith('/app/branches'))}><Warehouse className="h-5 w-5" /><span>Kho</span></NavLink>
      <button type="button" onClick={onMore} className="autotax-mobile-nav-item"><Grid2X2 className="h-5 w-5" /><span>Thêm</span></button>
    </nav>
  );
}

export default function App() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeLoadingTitle, setRouteLoadingTitle] = useState('AutoTax');
  const watchdogTimerRef = useRef(null);
  const settleTimerRef = useRef(null);
  const previousPathRef = useRef(location.pathname);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userName = user.name || 'Người dùng';
  const identity = user.phone || user.role || 'Tài khoản AutoTax';
  const pageTitle = useMemo(() => resolveTitle(location.pathname), [location.pathname]);

  const stopRouteLoading = useCallback(() => {
    window.clearTimeout(watchdogTimerRef.current);
    window.clearTimeout(settleTimerRef.current);
    watchdogTimerRef.current = null;
    settleTimerRef.current = null;
    setRouteLoading(false);
  }, []);

  const beginRouteLoading = useCallback((targetPath) => {
    setRouteLoadingTitle(resolveTitle(targetPath));
    setRouteLoading(true);
    window.clearTimeout(watchdogTimerRef.current);
    window.clearTimeout(settleTimerRef.current);
    // Fail-safe: route overlay must never lock the application indefinitely.
    watchdogTimerRef.current = window.setTimeout(() => {
      watchdogTimerRef.current = null;
      setRouteLoading(false);
    }, 1800);
  }, []);

  const settleRouteLoading = useCallback(() => {
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
      settleTimerRef.current = null;
      setRouteLoading(false);
    }, 180);
  }, []);

  useEffect(() => {
    const onInternalLink = (event) => {
      if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      const target = new URL(anchor.href, window.location.origin);
      if (target.origin !== window.location.origin || !target.pathname.startsWith('/app') || target.pathname === location.pathname) return;
      beginRouteLoading(target.pathname);
    };
    document.addEventListener('click', onInternalLink, true);
    return () => document.removeEventListener('click', onInternalLink, true);
  }, [beginRouteLoading, location.pathname]);

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      // Covers both link clicks and programmatic navigation (search, redirects, etc.).
      beginRouteLoading(location.pathname);
      previousPathRef.current = location.pathname;
      settleRouteLoading();
    }
    setMobileNavOpen(false);
    setProfileOpen(false);
  }, [beginRouteLoading, location.pathname, settleRouteLoading]);

  useEffect(() => () => {
    window.clearTimeout(watchdogTimerRef.current);
    window.clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape' && routeLoading) stopRouteLoading();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [routeLoading, stopRouteLoading]);

  useEffect(() => {
    if (!user.phone) return undefined;
    const ping = () => axios.post(`${API_BASE}/api/system/ping`, { phone: user.phone, name: userName }, { autotaxNotify: false }).catch(() => {});
    ping();
    const id = window.setInterval(ping, 30000);
    return () => window.clearInterval(id);
  }, [user.phone, userName]);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('industry_type');
    window.location.assign('/login');
  };

  return (
    <div className="autotax-shell flex h-dvh overflow-hidden text-slate-800">
      <div className={`autotax-top-progress ${routeLoading ? 'is-running' : ''}`} />
      {mobileNavOpen && <button type="button" aria-label="Đóng menu" className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileNavOpen}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="autotax-header flex h-16 shrink-0 items-center gap-2.5 px-3 sm:gap-3 sm:px-5">
          <button type="button" onClick={() => setMobileNavOpen(true)} className="icon-btn lg:hidden" aria-label="Mở menu"><Menu className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-extrabold tracking-tight text-slate-950 sm:text-base">{pageTitle}</h1>
            <p className="hidden text-[11px] font-medium text-slate-400 sm:block">AutoTax Business Control</p>
          </div>

          <button type="button" onClick={() => setSearchOpen(true)} className="autotax-global-search hidden min-w-[260px] items-center gap-2 px-3 py-2 text-left text-sm text-slate-400 md:flex">
            <Search className="h-4 w-4" /><span className="flex-1">Tìm tính năng, hóa đơn, khách hàng…</span><kbd className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400">Ctrl K</kbd>
          </button>
          <button type="button" onClick={() => setSearchOpen(true)} className="icon-btn md:hidden" aria-label="Tìm kiếm"><Search className="h-5 w-5" /></button>
          <NotificationBell />

          <div className="relative">
            <button type="button" onClick={() => setProfileOpen((value) => !value)} className="autotax-profile-button flex items-center gap-2 rounded-xl px-1.5 py-1 sm:px-2 sm:py-1.5">
              <div className="autotax-avatar">{userName.trim().split(/\s+/).slice(-2).map((word) => word[0]).join('').toUpperCase().slice(0, 2) || <UserRound className="h-4 w-4" />}</div>
              <div className="hidden max-w-[160px] text-left sm:block"><div className="truncate text-xs font-bold text-slate-800">{userName}</div><div className="truncate text-[10px] text-slate-400">{identity}</div></div>
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-30 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
                <div className="px-3 py-2"><div className="text-xs font-bold text-slate-800">{userName}</div><div className="mt-0.5 text-[11px] text-slate-400">{identity}</div></div>
                <div className="my-1 h-px bg-slate-100" />
                <button type="button" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"><LogOut className="h-4 w-4" />Đăng xuất</button>
              </div>
            )}
          </div>
        </header>

        <div className="autotax-workspace flex-1 overflow-y-auto overscroll-contain">
          <div className="autotax-mobile-content mx-auto min-h-full w-full max-w-[1600px] p-3 pb-24 sm:p-5 sm:pb-24 lg:p-6 lg:pb-6">
            <AppErrorBoundary key={location.pathname}>
              <Suspense fallback={<RouteLoading title={pageTitle} />}>
                <div key={location.pathname} className="autotax-page-enter" data-route={location.pathname}><Outlet /></div>
              </Suspense>
            </AppErrorBoundary>
          </div>
        </div>
      </main>

      <MobileBottomNav pathname={location.pathname} onMore={() => setMobileNavOpen(true)} />
      {routeLoading && <AutoTaxLoader overlay label={`Đang mở ${routeLoadingTitle}…`} />}
      <NotificationCenter />
      <AIAssistantWidget />
      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
