import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Plus, AlertTriangle, Trash2, Search, Download, PackageX, ShieldAlert, Sparkles } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel, tien } from '../utils/excel';

export default function Batches() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [canhBao, setCanhBao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [loc, setLoc] = useState('all'); // all | het_han | sap_het
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_id: '', batch_code: '', expiry_date: '', quantity: '', cost_price: '', note: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [b, p, cb] = await Promise.all([
        axios.get(`${API_BASE}/api/batches`),
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/batches/canh-bao`).catch(() => ({ data: null })),
      ]);
      setRows(b.data || []);
      setProducts(p.data || []);
      setCanhBao(cb.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

  const them = async (e) => {
    e.preventDefault();
    if (!form.product_id) return alert('Vui lòng chọn thuốc/dược phẩm!');
    if (!(Number(form.quantity) > 0)) return alert('Số lượng phải lớn hơn 0!');
    try {
      await axios.post(`${API_BASE}/api/batches`, {
        ...form,
        product_id: Number(form.product_id),
        quantity: Number(form.quantity),
        cost_price: Number(form.cost_price) || 0
      });
      setShowForm(false);
      setForm({ product_id: '', batch_code: '', expiry_date: '', quantity: '', cost_price: '', note: '' });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi nhập lô thuốc mới');
    }
  };

  const huy = async (b) => {
    const ly = window.prompt(`Hủy lô "${b.batch_code || b.id}" (${b.quantity} ${b.product_name})?\nNhập lý do:`, 'Hết hạn sử dụng');
    if (ly === null) return;
    try {
      const res = await axios.post(`${API_BASE}/api/batches/${b.id}/huy`, { reason: ly });
      alert(`Đã xuất hủy ${res.data.da_huy} sản phẩm khỏi kho thuốc.`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi hủy lô thuốc');
    }
  };

  const hienThi = useMemo(() => rows.filter((b) => {
    if (loc === 'het_han' && !b.het_han) return false;
    if (loc === 'sap_het' && !(b.ngay_con_lai !== null && b.ngay_con_lai >= 0 && b.ngay_con_lai <= 30)) return false;
    if (!search) return true;
    const txt = `${b.product_name} ${b.batch_code || ''} ${b.sku || ''}`.toLowerCase();
    return txt.includes(search.toLowerCase());
  }), [rows, loc, search]);

  const nhan = (b) => {
    if (b.ngay_con_lai === null) return { t: 'Không hạn', c: 'bg-slate-100 text-slate-600 border border-slate-200' };
    if (b.ngay_con_lai < 0) return { t: `Quá hạn ${Math.abs(b.ngay_con_lai)} ngày`, c: 'bg-rose-50 text-rose-700 border border-rose-200 font-bold' };
    if (b.ngay_con_lai <= 30) return { t: `Còn ${b.ngay_con_lai} ngày`, c: 'bg-amber-50 text-amber-700 border border-amber-200 font-bold' };
    return { t: `Còn ${b.ngay_con_lai} ngày`, c: 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold' };
  };

  const xuat = () => xuatExcel(
    hienThi,
    [
      { key: 'product_name', label: 'Thuốc / Dược phẩm' },
      { key: 'batch_code', label: 'Số Lô' },
      { key: 'expiry_date', label: 'Hạn dùng (EXP)' },
      { key: 'ngay_con_lai', label: 'Số ngày còn' },
      { key: 'quantity', label: 'Tồn kho', format: tien },
      { key: 'cost_price', label: 'Giá vốn', format: tien },
      { key: 'note', label: 'Ghi chú' },
    ],
    'So-theo-doi-lo-han-dung-GPP', 'Lô Thuốc GPP'
  );

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
              <CalendarClock className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Quản Lý Lô Thuốc & Hạn Dùng
                <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">Chuẩn GPP / FEFO</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Tự động ưu tiên xuất lô cận hạn trước (First Expired, First Out) bảo đảm an toàn kho dược</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={xuat} className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors border border-slate-200">
            <Download className="w-3.5 h-3.5" /> Xuất Excel GPP
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 shadow-sm shadow-emerald-600/30 transition-all">
            <Plus className="w-4 h-4" /> Nhập Lô Thuốc Mới
          </button>
        </div>
      </div>

      {/* Cảnh báo GPP */}
      {canhBao && (canhBao.het_han?.c > 0 || canhBao.sap_het_han?.c > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {canhBao.het_han?.c > 0 && (
            <button onClick={() => setLoc('het_han')} className="bg-rose-50/90 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-rose-100/80 transition-colors">
              <ShieldAlert className="w-8 h-8 text-rose-600 shrink-0" />
              <div>
                <div className="font-black text-rose-800 text-sm">{canhBao.het_han.c} lô thuốc đã quá hạn</div>
                <div className="text-xs text-rose-700">{canhBao.het_han.sl} đơn vị thuốc cần xuất hủy khỏi quầy</div>
              </div>
            </button>
          )}
          {canhBao.sap_het_han?.c > 0 && (
            <button onClick={() => setLoc('sap_het')} className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-amber-100/80 transition-colors">
              <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0" />
              <div>
                <div className="font-black text-amber-800 text-sm">{canhBao.sap_het_han.c} lô thuốc cận date (dưới 30 ngày)</div>
                <div className="text-xs text-amber-700">{canhBao.sap_het_han.sl} đơn vị thuốc ưu tiên tư vấn xuất trước</div>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Danh sách table trắng sạch */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl">
            {[
              { k: 'all', l: 'Tất cả lô' },
              { k: 'sap_het', l: 'Cận hạn (≤ 30 ngày)' },
              { k: 'het_han', l: 'Đã hết hạn' }
            ].map((t) => (
              <button key={t.k} onClick={() => setLoc(t.k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${loc === t.k ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {t.l}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên thuốc, số lô (Batch Code)..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 bg-white" />
          </div>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">{hienThi.length} lô</span>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Đang tải danh sách lô thuốc...</div>
          ) : hienThi.length === 0 ? (
            <div className="py-16 text-center">
              <PackageX className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium text-sm">{rows.length === 0 ? 'Chưa có dữ liệu lô thuốc nào.' : 'Không có lô nào khớp bộ lọc.'}</p>
              {rows.length === 0 && <p className="text-slate-400 text-xs mt-1">Bấm "Nhập Lô Thuốc Mới" để bắt đầu quản lý hạn sử dụng GPP.</p>}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 sticky top-0 uppercase tracking-wider font-bold">
                <tr>
                  <th className="py-3 px-4">Tên Thuốc / Dược Phẩm</th>
                  <th className="py-3 px-4">Số Lô (Batch)</th>
                  <th className="py-3 px-4">Hạn Sử Dụng (EXP)</th>
                  <th className="py-3 px-4 text-right">Số Lượng Tồn</th>
                  <th className="py-3 px-4 text-right">Giá Vốn</th>
                  <th className="py-3 px-4 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hienThi.map((b) => {
                  const n = nhan(b);
                  return (
                    <tr key={b.id} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{b.product_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{b.sku || 'Mã: N/A'}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{b.batch_code || '—'}</td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{b.expiry_date || '—'}</div>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[11px] ${n.c}`}>{n.t}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">{b.quantity}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">{money(b.cost_price)} đ</td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => huy(b)} title="Xuất hủy lô thuốc (hỏng / quá date)"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Nhập Lô Thuốc */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <CalendarClock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">Nhập Lô Thuốc Mới</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Số lượng nhập sẽ được tự động cộng vào tồn kho của thuốc theo chuẩn FEFO.</p>
            
            <form onSubmit={them} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn Thuốc / Dược Phẩm</label>
                <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 bg-white">
                  <option value="">-- Chọn thuốc trong danh mục --</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} (hiện tồn {p.stock})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Lô Sản Xuất</label>
                  <input value={form.batch_code} onChange={(e) => setForm({ ...form, batch_code: e.target.value })} placeholder="VD: LO-2026-08"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Hạn Sử Dụng (EXP)</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số Lượng Nhập</label>
                  <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 text-right font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Giá Vốn (đ/đv)</label>
                  <input type="number" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 text-right" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi Chú</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="VD: Nhập từ Dược Hậu Giang..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">Hủy</button>
                <button type="submit" className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm shadow-emerald-600/30 transition-all">Lưu Lô Thuốc</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
