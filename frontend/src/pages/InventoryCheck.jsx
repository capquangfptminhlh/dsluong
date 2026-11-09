import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, Search, Save, AlertTriangle, CheckCircle2, History, X, Download } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel, tien } from '../utils/excel';

export default function InventoryCheck() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [items, setItems] = useState([]);
  const [dem, setDem] = useState({});      // { productId: số thực đếm }
  const [loading, setLoading] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [search, setSearch] = useState('');
  const [chiHienLech, setChiHienLech] = useState(false);
  const [note, setNote] = useState('');

  const [lichSu, setLichSu] = useState([]);
  const [xemPhieu, setXemPhieu] = useState(null);

  useEffect(() => { fetchBranches(); }, []);
  useEffect(() => { if (branchId) fetchHang(branchId); }, [branchId]);

  const fetchBranches = async () => {
    try {
      const [b, ls] = await Promise.all([
        axios.get(`${API_BASE}/api/branches`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/stocktake`).catch(() => ({ data: [] })),
      ]);
      setBranches(b.data);
      setLichSu(ls.data);
      const md = b.data.find((x) => x.is_default) || b.data[0];
      if (md) setBranchId(String(md.id));
      else setLoading(false);
    } catch (err) { console.error(err); setLoading(false); }
  };

  const fetchHang = async (bid) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/stocktake/danh-sach/hang?branch_id=${bid}`);
      setItems(res.data?.items || (Array.isArray(res.data) ? res.data : []));
      setDem({});
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

  // Chỉ tính những dòng đã nhập số thực đếm
  const daDem = useMemo(() => items
    .filter((x) => dem[x.id] !== undefined && dem[x.id] !== '')
    .map((x) => {
      const thuc = Number(dem[x.id]);
      return { ...x, actual_qty: thuc, diff: thuc - x.system_qty };
    }), [items, dem]);

  const lech = daDem.filter((x) => x.diff !== 0);
  const tienLech = lech.reduce((s, x) => s + x.diff * (x.cost_price || 0), 0);

  const hienThi = items.filter((x) => {
    if (search && !`${x.name} ${x.sku || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (chiHienLech) {
      const v = dem[x.id];
      if (v === undefined || v === '') return false;
      return Number(v) !== x.system_qty;
    }
    return true;
  });

  const demTatCaKhop = () => {
    const n = {};
    items.forEach((x) => { n[x.id] = String(x.system_qty); });
    setDem(n);
  };

  const chot = async () => {
    if (daDem.length === 0) return alert('Chưa nhập số thực đếm cho mặt hàng nào!');
    const xn = window.confirm(
      `Chốt phiếu kiểm kê?\n\n` +
      `Đã đếm: ${daDem.length} mặt hàng\n` +
      `Lệch: ${lech.length} mặt hàng\n` +
      `Giá trị lệch: ${money(tienLech)}đ\n\n` +
      `TỒN KHO SẼ ĐƯỢC SỬA LẠI cho khớp số thực đếm. Không hoàn tác được.`
    );
    if (!xn) return;
    setDangLuu(true);
    try {
      const res = await axios.post(`${API_BASE}/api/stocktake`, {
        branch_id: Number(branchId), note,
        items: daDem.map((x) => ({ product_id: x.id, actual_qty: x.actual_qty })),
      });
      alert(
        `Đã chốt phiếu ${res.data.code}.\n` +
        `Đếm ${res.data.so_mat_hang_da_dem} mặt hàng, lệch ${res.data.so_mat_hang_lech}.\n` +
        `Tồn kho đã được cân bằng.`
      );
      setNote('');
      fetchHang(branchId);
      const ls = await axios.get(`${API_BASE}/api/stocktake`);
      setLichSu(ls.data);
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi chốt phiếu'); }
    finally { setDangLuu(false); }
  };

  const moPhieu = async (p) => {
    try { const res = await axios.get(`${API_BASE}/api/stocktake/${p.id}`); setXemPhieu(res.data); }
    catch (err) { alert('Lỗi khi tải chi tiết'); }
  };

  const xuat = () => xuatExcel(
    daDem,
    [
      { key: 'sku', label: 'Mã SKU' },
      { key: 'name', label: 'Tên hàng' },
      { key: 'system_qty', label: 'Sổ sách', format: tien },
      { key: 'actual_qty', label: 'Thực đếm', format: tien },
      { key: 'diff', label: 'Lệch', format: tien },
    ],
    'Kiem-ke-kho', 'Kiểm kê'
  );

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-indigo-600" /> Kiểm Kê Kho
          </h2>
          <p className="text-xs text-slate-500 mt-1">Đếm hàng thực tế, hệ thống tự sửa lại tồn kho cho khớp</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Kiểm kê tại</label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <button onClick={xuat} className="px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* Tổng kết */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase">Đã đếm</div>
          <div className="text-2xl font-black text-slate-800">{daDem.length}<span className="text-sm text-slate-400 font-medium"> / {items.length}</span></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase">Khớp sổ</div>
          <div className="text-2xl font-black text-emerald-600">{daDem.length - lech.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase">Lệch</div>
          <div className="text-2xl font-black text-amber-600">{lech.length}</div>
        </div>
        <div className={`rounded-xl shadow-sm p-4 text-white ${tienLech < 0 ? 'bg-gradient-to-br from-rose-500 to-red-600' : tienLech > 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-slate-400 to-slate-500'}`}>
          <div className="text-[11px] font-bold opacity-90 uppercase">Giá trị lệch</div>
          <div className="text-2xl font-black">{money(tienLech)}đ</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm hàng để đếm..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
            <input type="checkbox" checked={chiHienLech} onChange={(e) => setChiHienLech(e.target.checked)} className="w-4 h-4 accent-amber-600" />
            Chỉ xem hàng lệch
          </label>
          <button onClick={demTatCaKhop} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200">
            Điền tất cả = sổ sách
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : hienThi.length === 0 ? <div className="py-16 text-center text-slate-400">Không có hàng.</div>
            : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Mặt hàng</th>
                    <th className="py-3 px-4 font-semibold text-right w-28">Sổ sách</th>
                    <th className="py-3 px-4 font-semibold text-right w-32">Thực đếm</th>
                    <th className="py-3 px-4 font-semibold text-right w-28">Lệch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hienThi.slice(0, 400).map((x) => {
                    const v = dem[x.id];
                    const daNhap = v !== undefined && v !== '';
                    const l = daNhap ? Number(v) - x.system_qty : null;
                    return (
                      <tr key={x.id} className={l ? (l < 0 ? 'bg-rose-50/40' : 'bg-emerald-50/40') : ''}>
                        <td className="py-2 px-4">
                          <div className="font-bold text-slate-800">{x.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{x.sku}</div>
                        </td>
                        <td className="py-2 px-4 text-right font-semibold text-slate-600">{x.system_qty}</td>
                        <td className="py-2 px-4">
                          <input type="number" min="0" value={v ?? ''}
                            onChange={(e) => setDem({ ...dem, [x.id]: e.target.value })}
                            placeholder="—"
                            className={`w-full px-2 py-1.5 border rounded-lg text-right font-bold outline-none ${
                              daNhap ? 'border-indigo-400 bg-white' : 'border-slate-200'
                            } focus:border-indigo-500`} />
                        </td>
                        <td className={`py-2 px-4 text-right font-black ${l === null ? 'text-slate-300' : l === 0 ? 'text-emerald-600' : l < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                          {l === null ? '—' : l === 0 ? '✓' : (l > 0 ? '+' : '') + l}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú đợt kiểm kê..."
            className="flex-1 min-w-[180px] px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500" />
          {lech.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-bold text-amber-700">
              <AlertTriangle className="w-4 h-4" /> {lech.length} mặt hàng sẽ bị sửa tồn kho
            </span>
          )}
          <button onClick={chot} disabled={dangLuu || daDem.length === 0}
            className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2">
            <Save className="w-4 h-4" /> {dangLuu ? 'Đang chốt...' : 'Chốt phiếu & Cân bằng kho'}
          </button>
        </div>
      </div>

      {/* Lịch sử */}
      {lichSu.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-3 px-4 border-b border-slate-100 bg-slate-50/50 font-bold text-slate-700 text-sm flex items-center gap-2">
            <History className="w-4 h-4" /> Lịch sử kiểm kê
          </div>
          <div className="max-h-52 overflow-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-100">
                {lichSu.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => moPhieu(p)}>
                    <td className="py-2.5 px-4 font-bold text-indigo-700">{p.code}</td>
                    <td className="py-2.5 px-4 text-slate-500">{p.branch_name || '—'}</td>
                    <td className="py-2.5 px-4 text-slate-500">{(p.createdAt || '').split(' ')[0]}</td>
                    <td className="py-2.5 px-4 text-slate-600">{p.total_items || 0} mặt hàng lệch</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${p.total_difference < 0 ? 'text-rose-600' : p.total_difference > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {money(p.total_difference)}đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {xemPhieu && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setXemPhieu(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Phiếu kiểm kê {xemPhieu.code}</h3>
                <p className="text-sm text-slate-500">{(xemPhieu.createdAt || '').split(' ')[0]} · {xemPhieu.note || 'không ghi chú'}</p>
              </div>
              <button onClick={() => setXemPhieu(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            {(!xemPhieu.items || xemPhieu.items.length === 0) ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Đợt này khớp hoàn toàn, không có mặt hàng nào lệch.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr><th className="py-2 px-3 font-semibold">Mặt hàng</th><th className="py-2 px-3 text-right font-semibold">Sổ sách</th><th className="py-2 px-3 text-right font-semibold">Thực đếm</th><th className="py-2 px-3 text-right font-semibold">Lệch</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {xemPhieu.items.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 px-3 font-semibold text-slate-700">{i.product_name}</td>
                      <td className="py-2 px-3 text-right text-slate-600">{i.system_qty}</td>
                      <td className="py-2 px-3 text-right font-bold">{i.actual_qty}</td>
                      <td className={`py-2 px-3 text-right font-black ${i.diff < 0 ? 'text-rose-600' : 'text-blue-600'}`}>
                        {i.diff > 0 ? '+' : ''}{i.diff}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
