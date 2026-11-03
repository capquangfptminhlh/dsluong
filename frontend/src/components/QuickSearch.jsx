import React, { useState, useEffect, useRef } from 'react';
import { Search, Package, Users, FileText, CornerDownLeft, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import API_BASE from '../config/api';
import { coQuyen } from '../utils/quyen';

// Các trang có thể nhảy tới bằng tìm kiếm nhanh
const TRANG = [
  { t: 'Bán hàng (POS)', p: '/app/pos', mod: ['pos'] },
  { t: 'Đơn hàng', p: '/app/pos/orders', mod: ['orders', 'pos'] },
  { t: 'Trả hàng', p: '/app/pos/returns', mod: ['orders', 'pos'] },
  { t: 'Chốt ca thu ngân', p: '/app/pos/shift', mod: ['pos', 'finance'] },
  { t: 'Sản phẩm', p: '/app/products', mod: ['products'] },
  { t: 'Danh mục sản phẩm', p: '/app/products/categories', mod: ['categories', 'products'] },
  { t: 'In tem mã vạch', p: '/app/products/barcode', mod: ['products'] },
  { t: 'Nhập hàng', p: '/app/purchase', mod: ['purchase'] },
  { t: 'Nhà cung cấp', p: '/app/suppliers', mod: ['suppliers', 'purchase'] },
  { t: 'Tồn kho', p: '/app/inventory', mod: ['inventory'] },
  { t: 'Kiểm kê kho', p: '/app/inventory/check', mod: ['inventory'] },
  { t: 'Khách hàng', p: '/app/customers', mod: ['customers'] },
  { t: 'Sổ quỹ thu chi', p: '/app/finance/cashbook', mod: ['finance'] },
  { t: 'Công nợ', p: '/app/finance/debt', mod: ['debt'] },
  { t: 'Báo cáo', p: '/app/reports', mod: ['reports'] },
  { t: 'Khai thuế', p: '/app/report', mod: ['tax'] },
  { t: 'Nhân sự & Hoa hồng', p: '/app/staff', mod: ['staff'] },
  { t: 'Khuyến mãi', p: '/app/promotions', mod: ['promotions'] },
  { t: 'Nhật ký thao tác', p: '/app/settings/audit', mod: ['__owner__'] },
  { t: 'Sao lưu & Khôi phục hệ thống', p: '/app/settings/backup', mod: ['__superadmin__'] },
  { t: 'Cài đặt cửa hàng', p: '/app/settings', mod: ['__owner__'] },
];

/**
 * Bỏ dấu tiếng Việt để gõ "so quy" vẫn tìm ra "Sổ quỹ".
 * Người dùng Việt Nam thường gõ không dấu cho nhanh.
 */
function boDau(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

export default function QuickSearch({ open, onClose }) {
  const [q, setQ] = useState('');
  const [sp, setSp] = useState([]);
  const [kh, setKh] = useState([]);
  const [chon, setChon] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQ(''); setSp([]); setKh([]); setChon(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Tìm sản phẩm / khách hàng (chờ 250ms để không gọi API mỗi lần gõ)
  useEffect(() => {
    if (!open || q.trim().length < 2) { setSp([]); setKh([]); return; }
    const id = setTimeout(async () => {
      const tim = boDau(q.trim());
      try {
        if (coQuyen('products', 'pos')) {
          const r = await axios.get(`${API_BASE}/api/products`);
          setSp(r.data.filter((p) =>
            boDau(p.name).includes(tim) || boDau(p.sku).includes(tim)
          ).slice(0, 5));
        }
      } catch { setSp([]); }
      try {
        if (coQuyen('customers', 'pos')) {
          const r = await axios.get(`${API_BASE}/api/customers`);
          setKh(r.data.filter((c) =>
            boDau(c.name).includes(tim) || (c.phone || '').includes(q.trim())
          ).slice(0, 5));
        }
      } catch { setKh([]); }
    }, 250);
    return () => clearTimeout(id);
  }, [q, open]);

  const trangKhop = TRANG
    .filter((t) => coQuyen(...(t.mod || [])))
    .filter((t) => !q.trim() || boDau(t.t).includes(boDau(q.trim())))
    .slice(0, 6);

  const ketQua = [
    ...trangKhop.map((t) => ({ loai: 'trang', nhan: t.t, phu: 'Trang', path: t.p })),
    ...sp.map((p) => ({ loai: 'sp', nhan: p.name, phu: `Tồn ${p.stock} · ${new Intl.NumberFormat('vi-VN').format(p.price)}đ`, path: '/app/products' })),
    ...kh.map((c) => ({ loai: 'kh', nhan: c.name, phu: c.phone, path: '/app/customers' })),
  ];

  const di = (r) => { onClose(); navigate(r.path); };

  const phim = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setChon((i) => Math.min(i + 1, ketQua.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setChon((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (ketQua[chon]) di(ketQua[chon]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  const icon = { trang: FileText, sp: Package, kh: Users };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-start justify-center pt-[12vh] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setChon(0); }} onKeyDown={phim}
            placeholder="Tìm trang, sản phẩm, khách hàng..."
            className="flex-1 py-1 outline-none text-slate-700 font-medium" />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>

        <div className="max-h-[50vh] overflow-auto">
          {ketQua.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              {q.trim().length < 2 ? 'Gõ để tìm trang, sản phẩm hoặc khách hàng' : 'Không tìm thấy kết quả'}
            </div>
          ) : ketQua.map((r, i) => {
            const Icon = icon[r.loai];
            return (
              <button key={r.loai + i} onMouseEnter={() => setChon(i)} onClick={() => di(r)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === chon ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <Icon className={`w-4 h-4 shrink-0 ${i === chon ? 'text-blue-600' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 truncate text-sm">{r.nhan}</div>
                  <div className="text-xs text-slate-500 truncate">{r.phu}</div>
                </div>
                {i === chon && <CornerDownLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400 flex gap-3">
          <span><b>↑↓</b> di chuyển</span><span><b>Enter</b> mở</span><span><b>Esc</b> đóng</span>
        </div>
      </div>
    </div>
  );
}
