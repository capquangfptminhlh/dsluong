import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { coQuyen } from '../utils/quyen';
import { 
  ShoppingCart, Users, Package, Warehouse, 
  Wallet, BarChart3, ChevronDown, ChevronRight, 
  ChevronsLeft, BarChart2, FileSpreadsheet,
  Truck, ShieldCheck, Pill, CalendarClock,
  Settings as SettingsIcon
} from 'lucide-react';
import logo from '../assets/logo.png';
import PWAInstallPrompt from './PWAInstallPrompt';

// ==============================================================
//  MENU CHUẨN 100% CHO NHÀ THUỐC (Nhà Thuốc Nhân Đức)
// ==============================================================
const getPharmacyMenu = () => {
  return [
    // 1. BÁO CÁO & PHÂN TÍCH
    {
      id: 'reports_group', label: 'Báo cáo & Doanh thu', icon: BarChart2, mod: ['reports', 'finance'],
      children: [
        { label: 'Tổng quan (Dashboard)', path: '/app/overview', mod: ['reports', 'finance'] },
        { label: 'Báo cáo bán hàng', path: '/app/reports', mod: ['reports'] },
      ]
    },
    // 2. BÁN THUỐC (POS)
    {
      id: 'pos', label: 'Bán thuốc & Kê đơn (POS)', icon: ShoppingCart, mod: ['pos', 'orders'],
      children: [
        { label: 'Kê đơn & Bán thuốc', path: '/app/pos', mod: ['pos'] },
        { label: 'Lịch sử hóa đơn', path: '/app/pos/orders', mod: ['orders', 'pos'] },
        { label: 'Khách trả thuốc', path: '/app/pos/returns', mod: ['orders', 'pos'] },
        { label: 'Chốt ca trực dược sĩ', path: '/app/pos/shift', mod: ['pos', 'finance'] },
      ]
    },
    // 3. KHO DƯỢC & THUỐC
    {
      id: 'products', label: 'Kho Dược & Thuốc', icon: Pill, mod: ['products', 'categories'],
      children: [
        { label: 'Danh mục thuốc & Dược phẩm', path: '/app/products', mod: ['products'] },
        { label: 'Nhóm thuốc / Dược lý', path: '/app/products/categories', mod: ['categories', 'products'] },
        { label: 'Đơn vị tính quy đổi', path: '/app/products/units', mod: ['products'] },
        { label: 'Bảng giá (Sỉ/Lẻ/Liều)', path: '/app/products/pricing', mod: ['products'] },
        { label: 'Đơn thuốc mẫu & Combo', path: '/app/products/combos', mod: ['products'] },
      ]
    },
    // 4. QUẢN LÝ LÔ & HẠN DÙNG (CỰC KỲ QUAN TRỌNG CHO NHÀ THUỐC)
    {
      id: 'inventory', label: 'Kho hàng & Lô Date', icon: Warehouse, mod: ['inventory'],
      children: [
        { label: 'Lô & Hạn sử dụng (Date)', path: '/app/inventory/batches', mod: ['inventory'] },
        { label: 'Tồn kho thuốc', path: '/app/inventory', mod: ['inventory'] },
        { label: 'Kiểm kê kho thuốc', path: '/app/inventory/check', mod: ['inventory'] },
        { label: 'Chuyển kho / Quầy thuốc', path: '/app/inventory/transfer', mod: ['inventory'] },
        { label: 'Chi nhánh & Quầy thuốc', path: '/app/branches', mod: ['inventory'] },
      ]
    },
    // 5. NHẬP THUỐC & NHÀ PHÂN PHỐI DƯỢC
    {
      id: 'purchase', label: 'Nhập thuốc & NCC Dược', icon: Truck, mod: ['purchase', 'suppliers'],
      children: [
        { label: 'Phiếu nhập thuốc', path: '/app/purchase', mod: ['purchase'] },
        { label: 'Nhà cung cấp dược phẩm', path: '/app/suppliers', mod: ['suppliers', 'purchase'] },
        { label: 'Đặt hàng & Trả NCC', path: '/app/supplier-orders', mod: ['purchase'] },
      ]
    },
    // 6. KHÁCH HÀNG & BỆNH NHÂN (CRM)
    { 
      id: 'customers', label: 'Khách hàng & Bệnh nhân', icon: Users, mod: ['customers'],
      children: [
        { label: 'Hồ sơ bệnh nhân', path: '/app/customers', mod: ['customers'] },
        { label: 'Thẻ VIP & Tích điểm', path: '/app/customers/loyalty', mod: ['customers'] },
        { label: 'Chăm sóc khách hàng (CRM)', path: '/app/customers/crm', mod: ['customers'] },
      ]
    },
    // 7. DƯỢC SĨ, CHẤM CÔNG & TÍNH LƯƠNG
    {
      id: 'staff', label: 'Dược sĩ & Tính lương', icon: Users, mod: ['staff', 'pos'],
      children: [
        { label: 'Chấm công & Tính lương', path: '/app/staff', mod: ['staff'] },
        { label: 'Thưởng & Hoa hồng đơn', path: '/app/staff/commissions', mod: ['staff'] },
        { label: 'Chốt ca & Bàn giao két', path: '/app/pos/shift', mod: ['pos', 'finance'] },
      ]
    },
    // 8. TÀI CHÍNH & CÔNG NỢ
    {
      id: 'finance', label: 'Sổ quỹ & Công nợ', icon: Wallet, mod: ['finance', 'debt'],
      children: [
        { label: 'Sổ quỹ thu chi', path: '/app/finance/cashbook', mod: ['finance'] },
        { label: 'Công nợ khách & NCC', path: '/app/finance/debt', mod: ['debt'] },
        { label: 'Tổng quan tài chính', path: '/app/finance', mod: ['finance'] },
      ]
    },
    // 9. THUẾ & HÓA ĐƠN ĐIỆN TỬ MÁY TÍNH TIỀN
    { id: 'tax', label: 'Khai Thuế & HĐĐT Máy tính tiền', icon: FileSpreadsheet, path: '/app/report', mod: ['tax'] },
    // 10. CÀI ĐẶT
    {
      id: 'settings', label: 'Cài đặt nhà thuốc', icon: SettingsIcon, mod: ['__owner__'],
      children: [
        { label: 'Thông tin nhà thuốc', path: '/app/settings', mod: ['__owner__'] },
        { label: 'Nhật ký hoạt động', path: '/app/settings/audit', mod: ['__owner__'] },
        { label: 'Sao lưu & Khôi phục', path: '/app/settings/backup', mod: ['__owner__'] },
      ]
    }
  ];
};

export default function Sidebar({ onClose }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState({ pos: true, products: true, inventory: true, staff: true });

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  const toggleMenu = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const isActive = (path) => location.pathname === path;
  const isChildActive = (children) => children?.some(c => location.pathname.startsWith(c.path));

  const locTheoQuyen = (items) =>
    items
      .filter((it) => coQuyen(...(it.mod || [])))
      .map((it) => (it.children ? { ...it, children: it.children.filter((c) => coQuyen(...(c.mod || []))) } : it))
      .filter((it) => !it.children || it.children.length > 0);

  const menuItems = locTheoQuyen(getPharmacyMenu());

  const renderItem = (item) => {
    const hasChildren = !!item.children;
    const childActive = isChildActive(item.children);
    const selfActive = isActive(item.path);

    return (
      <div key={item.id} className="mb-0.5">
        {hasChildren ? (
          <>
            <button
              onClick={() => toggleMenu(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all font-semibold text-sm ${
                childActive || expanded[item.id]
                  ? 'text-emerald-800 bg-emerald-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${childActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {expanded[item.id]
                ? <ChevronDown className="w-4 h-4 text-slate-400" />
                : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {expanded[item.id] && (
              <div className="mt-1 ml-5 border-l-2 border-emerald-100 pl-3 space-y-0.5 pb-1">
                {item.children.map((child, idx) => {
                  const active = isActive(child.path);
                  return (
                    <NavLink
                      key={idx}
                      to={child.path}
                      onClick={handleNavClick}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all font-medium relative ${
                        active ? 'text-emerald-700 bg-emerald-50/80 font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {active && <div className="absolute left-[-0.85rem] w-1.5 h-1.5 rounded-full bg-emerald-600 ring-2 ring-emerald-100"></div>}
                      {child.label}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <NavLink
            to={item.path}
            onClick={handleNavClick}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-semibold text-sm ${
              selfActive ? 'bg-emerald-50 text-emerald-800 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <item.icon className={`w-5 h-5 ${selfActive ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>{item.label}</span>
          </NavLink>
        )}
      </div>
    );
  };

  return (
    <div className="w-[260px] bg-white h-screen flex flex-col flex-shrink-0 text-slate-600 border-r border-slate-200 shadow-sm">

      {/* Header Logo Nhà Thuốc Nhân Đức */}
      <div className="h-24 flex items-center justify-between px-4 border-b border-slate-100 shrink-0 bg-emerald-50/20">
        <div className="flex items-center gap-2 overflow-hidden py-1">
          <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-16 w-auto max-w-[190px] object-contain drop-shadow-sm" />
        </div>
        <button className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-50">
          <ChevronsLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Badge Chuyên ngành Nhà thuốc GPP */}
      <div className="px-4 py-2 border-b border-emerald-100/60 bg-emerald-50/50 flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="text-[11px] font-bold text-emerald-800 tracking-wide uppercase">
          Quản Lý Nhà Thuốc Chuẩn GPP
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {menuItems.map(renderItem)}
      </nav>

      {/* PWA Install Button */}
      <div className="px-3 pb-2 pt-1 shrink-0">
        <PWAInstallPrompt variant="sidebar" />
      </div>

      {/* Footer System Info */}
      <div className="p-3 border-t border-slate-100 shrink-0 bg-slate-50/70">
        <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-xs flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <h4 className="font-bold text-slate-800 text-xs truncate">Nhà Thuốc Nhân Đức</h4>
            <p className="text-[10px] text-emerald-700 font-medium">Hệ thống chuẩn Dược</p>
          </div>
        </div>
      </div>

    </div>
  );
}
