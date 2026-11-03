import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3, Building2, CalendarDays, ChevronDown, ChevronRight,
  CircleDollarSign, FileSpreadsheet, Gift, MenuSquare, Package, PanelLeftClose,
  PanelLeftOpen, Settings, ShoppingCart, Smartphone, Truck, Users, Warehouse,
  X,
} from 'lucide-react';
import { coQuyen, laChuCuaHang, layNguoiDung } from '../utils/quyen';

const INDUSTRIES = [
  ['retail', 'Bán lẻ'], ['spa', 'Spa & Dịch vụ'], ['fnb', 'Nhà hàng F&B'],
  ['hotel', 'Khách sạn'], ['petshop', 'Thú cưng'], ['clinic', 'Phòng khám'],
];

function baseMenu(industry) {
  const productLabel = industry === 'fnb' ? 'Thực đơn & hàng hóa' : 'Sản phẩm & hàng hóa';
  return [
    { id: 'overview', label: 'Tổng quan', icon: BarChart3, path: '/app/overview', mod: ['reports', 'finance'] },
    { id: 'pos', label: 'Bán hàng', icon: ShoppingCart, mod: ['pos', 'orders'], children: [
      { label: 'Tạo đơn', path: '/app/pos', mod: ['pos'] },
      { label: 'Đơn hàng', path: '/app/pos/orders', mod: ['orders', 'pos'] },
      { label: 'Trả hàng', path: '/app/pos/returns', mod: ['orders', 'pos'] },
      { label: 'Chốt ca', path: '/app/pos/shift', mod: ['pos', 'finance'] },
    ] },
    { id: 'products', label: productLabel, icon: Package, mod: ['products', 'categories'], children: [
      { label: 'Danh sách', path: '/app/products', mod: ['products'] },
      { label: 'Danh mục', path: '/app/products/categories', mod: ['categories', 'products'] },
      { label: 'Bảng giá', path: '/app/products/pricing', mod: ['products'] },
      { label: 'Combo / bán theo bộ', path: '/app/products/combos', mod: ['products'] },
      { label: 'Serial & bảo hành', path: '/app/products/serials', mod: ['products'] },
      { label: 'Đơn vị tính', path: '/app/products/units', mod: ['products'] },
      { label: 'Định mức BOM', path: '/app/products/bom', mod: ['products'] },
    ] },
    { id: 'purchase', label: 'Mua & nhập hàng', icon: Truck, mod: ['purchase', 'suppliers'], children: [
      { label: 'Tạo phiếu nhập', path: '/app/purchase', mod: ['purchase'] },
      { label: 'Đặt / trả hàng NCC', path: '/app/supplier-orders', mod: ['purchase'] },
      { label: 'Nhà cung cấp', path: '/app/suppliers', mod: ['suppliers', 'purchase'] },
    ] },
    { id: 'inventory', label: 'Kho hàng', icon: Warehouse, mod: ['inventory'], children: [
      { label: 'Tồn kho', path: '/app/inventory', mod: ['inventory'] },
      { label: 'Chi nhánh & kho', path: '/app/branches', mod: ['inventory'] },
      { label: 'Lô & hạn sử dụng', path: '/app/inventory/batches', mod: ['inventory'] },
      { label: 'Kiểm kê', path: '/app/inventory/check', mod: ['inventory'] },
      { label: 'Chuyển kho', path: '/app/inventory/transfer', mod: ['inventory'] },
    ] },
    { id: 'customers', label: 'Khách hàng', icon: Users, path: '/app/customers', mod: ['customers'] },
    { id: 'staff', label: 'Nhân sự', icon: Users, path: '/app/staff', mod: ['staff'] },
    { id: 'finance', label: 'Tài chính', icon: CircleDollarSign, mod: ['finance', 'debt'], children: [
      { label: 'Tổng quan tài chính', path: '/app/finance', mod: ['finance'] },
      { label: 'Sổ quỹ thu chi', path: '/app/finance/cashbook', mod: ['finance'] },
      { label: 'Công nợ', path: '/app/finance/debt', mod: ['debt'] },
    ] },
    { id: 'reports', label: 'Báo cáo', icon: FileSpreadsheet, path: '/app/reports', mod: ['reports'] },
    { id: 'tax', label: 'Thuế & kiểm toán', icon: FileSpreadsheet, mod: ['tax', 'purchase'], children: [
      { label: 'Kê khai & kiểm soát thuế', path: '/app/report', mod: ['tax'] },
      { label: 'Kiểm toán hóa đơn & chi phí', path: '/app/audit', mod: ['purchase'] },
    ] },
    { id: 'promotions', label: 'Khuyến mãi', icon: Gift, path: '/app/promotions', mod: ['promotions'] },
    { id: 'channels', label: 'Kênh bán hàng', icon: Smartphone, path: '/app/settings/miniapp', mod: [] },
    { id: 'settings-owner', label: 'Cài đặt hệ thống', icon: Settings, mod: ['__owner__'], children: [
      { label: 'Thông tin cửa hàng', path: '/app/settings', mod: ['__owner__'] },
      { label: 'Sao lưu & khôi phục hệ thống', path: '/app/settings/backup', mod: ['__superadmin__'] },
      { label: 'Nhật ký thao tác', path: '/app/settings/audit', mod: ['__owner__'] },
      { label: 'Tự động hóa', path: '/app/settings/automation', mod: ['__owner__'] },
      { label: 'Kết nối sàn TMĐT', path: '/app/settings/omnichannel', mod: ['__owner__'] },
    ] },
  ];
}

const SECTOR_EXTRA = {
  retail: [],
  spa: [
    { id: 'sector-appointments', label: 'Lịch hẹn', icon: CalendarDays, path: '/app/appointments', mod: ['appointments'] },
    { id: 'sector-rooms', label: 'Phòng / giường', icon: Building2, path: '/app/rooms', mod: ['rooms'] },
    { id: 'sector-commissions', label: 'Hoa hồng KTV', icon: Users, path: '/app/staff/commissions', mod: ['staff'] },
  ],
  fnb: [
    { id: 'sector-tables', label: 'Sơ đồ bàn', icon: MenuSquare, path: '/app/pos', mod: ['pos'] },
    { id: 'sector-rooms', label: 'Bàn / phòng', icon: Building2, path: '/app/rooms', mod: ['rooms'] },
  ],
  hotel: [
    { id: 'sector-rooms', label: 'Quản lý phòng', icon: Building2, path: '/app/rooms', mod: ['rooms'] },
    { id: 'sector-booking', label: 'Đặt phòng', icon: CalendarDays, path: '/app/appointments', mod: ['appointments'] },
  ],
  petshop: [
    { id: 'sector-grooming', label: 'Lịch Grooming', icon: CalendarDays, path: '/app/appointments', mod: ['appointments'] },
    { id: 'sector-rooms', label: 'Phòng lưu trú', icon: Building2, path: '/app/rooms', mod: ['rooms'] },
  ],
  clinic: [
    { id: 'sector-booking', label: 'Lịch khám', icon: CalendarDays, path: '/app/appointments', mod: ['appointments'] },
    { id: 'sector-rooms', label: 'Phòng khám', icon: Building2, path: '/app/rooms', mod: ['rooms'] },
  ],
};

function filterByPermission(items) {
  return items
    .filter((item) => coQuyen(...(item.mod || [])))
    .map((item) => item.children
      ? { ...item, children: item.children.filter((child) => coQuyen(...(child.mod || []))) }
      : item)
    .filter((item) => !item.children || item.children.length > 0);
}

export default function Sidebar({ collapsed = false, mobileOpen = false, onToggleCollapsed, onCloseMobile }) {
  const location = useLocation();
  const user = layNguoiDung();
  const [expanded, setExpanded] = useState({ pos: true, products: true });
  const [industry, setIndustry] = useState(localStorage.getItem('industry_type') || user.sector || 'retail');
  const [industryOpen, setIndustryOpen] = useState(false);

  useEffect(() => {
    const syncIndustry = () => setIndustry(localStorage.getItem('industry_type') || layNguoiDung().sector || 'retail');
    window.addEventListener('industryChange', syncIndustry);
    return () => window.removeEventListener('industryChange', syncIndustry);
  }, []);

  useEffect(() => {
    setIndustryOpen(false);
  }, [location.pathname, collapsed, mobileOpen]);

  const menu = useMemo(() => filterByPermission(baseMenu(industry)), [industry]);
  const sectorItems = useMemo(() => filterByPermission(SECTOR_EXTRA[industry] || []), [industry]);
  const industryLabel = INDUSTRIES.find(([value]) => value === industry)?.[1] || 'Bán lẻ';

  const selectIndustry = (value) => {
    setIndustry(value);
    setIndustryOpen(false);
    localStorage.setItem('industry_type', value);
    window.dispatchEvent(new Event('industryChange'));
  };

  const activeChild = (children) => children?.some((child) => location.pathname === child.path || location.pathname.startsWith(`${child.path}/`));

  const renderItem = (item) => {
    const Icon = item.icon;
    const hasChildren = Boolean(item.children?.length);
    const active = item.path ? (location.pathname === item.path || (item.path !== '/app/overview' && location.pathname.startsWith(`${item.path}/`))) : activeChild(item.children);

    if (hasChildren) {
      return (
        <div key={item.id} className="space-y-1">
          <button
            type="button"
            title={collapsed ? item.label : undefined}
            onClick={() => {
              if (collapsed) onToggleCollapsed?.();
              else setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
            }}
            className={`sidebar-item w-full ${active ? 'sidebar-item-active' : ''} ${collapsed ? 'justify-center px-2' : ''}`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <><span className="flex-1 truncate text-left">{item.label}</span>{expanded[item.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</>}
          </button>
          {!collapsed && expanded[item.id] && (
            <div className="ml-5 space-y-0.5 border-l border-slate-200 pl-3">
              {item.children.map((child) => (
                <NavLink
                  key={`${item.id}:${child.path}`}
                  to={child.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) => `sidebar-child ${isActive ? 'sidebar-child-active' : ''}`}
                >{child.label}</NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.id}
        to={item.path}
        title={collapsed ? item.label : undefined}
        onClick={onCloseMobile}
        className={({ isActive }) => `sidebar-item ${isActive ? 'sidebar-item-active' : ''} ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    );
  };

  return (
    <aside className={`fixed inset-y-0 left-0 z-50 flex h-dvh flex-col border-r border-slate-200 bg-white shadow-xl transition-all duration-200 lg:static lg:z-auto lg:shadow-none ${collapsed ? 'lg:w-[76px]' : 'lg:w-[268px]'} w-[284px] ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className={`flex h-16 shrink-0 items-center border-b border-slate-100 ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <img src="/autotax-logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-xl shadow-sm" />
          {!collapsed && <div className="min-w-0"><div className="truncate text-base font-extrabold tracking-tight text-slate-950">AutoTax</div><div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Business Control</div></div>}
        </div>
        <button type="button" onClick={onCloseMobile} className="icon-btn lg:hidden" aria-label="Đóng menu"><X className="h-5 w-5" /></button>
      </div>

      <div className={`shrink-0 border-b border-slate-100 ${collapsed ? 'p-2' : 'p-3'}`}>
        {!collapsed ? (
          <div className="block">
            <span className="mb-1.5 block px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Mô hình kinh doanh</span>
            <div
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setIndustryOpen(false);
              }}
            >
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={industryOpen}
                onClick={() => setIndustryOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-bold text-slate-700 outline-none transition hover:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                <span className="truncate">{industryLabel}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${industryOpen ? 'rotate-180' : ''}`} />
              </button>
              {industryOpen && (
                <div
                  role="listbox"
                  aria-label="Mô hình kinh doanh"
                  className="absolute left-0 right-0 top-[calc(100%+6px)] z-[70] max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                >
                  {INDUSTRIES.map(([value, label]) => {
                    const selected = value === industry;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => selectIndustry(value)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${selected ? 'bg-blue-50 text-blue-700' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        <span>{label}</span>
                        {selected && <span aria-hidden="true" className="text-sm leading-none text-blue-600">✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <button type="button" onClick={onToggleCollapsed} title="Mở menu" className="icon-btn mx-auto"><PanelLeftOpen className="h-5 w-5" /></button>
        )}
      </div>

      <nav className={`flex-1 space-y-1 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {menu.map(renderItem)}
        {sectorItems.length > 0 && !collapsed && <div className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Nghiệp vụ chuyên ngành</div>}
        {sectorItems.map(renderItem)}
      </nav>

      <div className={`shrink-0 border-t border-slate-100 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button type="button" onClick={onToggleCollapsed} title="Mở rộng menu" className="icon-btn"><PanelLeftOpen className="h-5 w-5" /></button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><div className="truncate text-xs font-bold text-slate-700">{user.name || 'Tài khoản AutoTax'}</div><div className="truncate text-[10px] text-slate-400">{laChuCuaHang() ? 'Chủ cửa hàng' : 'Nhân viên'}</div></div>
            <button type="button" onClick={onToggleCollapsed} title="Thu gọn" className="icon-btn"><PanelLeftClose className="h-5 w-5" /></button>
          </div>
        )}
      </div>
    </aside>
  );
}
