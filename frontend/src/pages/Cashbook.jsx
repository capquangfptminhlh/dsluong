import React, { useState, useEffect, useMemo } from 'react';
import { Search, ArrowUpRight, ArrowDownRight, Wallet, Download, Printer } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel, tien } from '../utils/excel';
import { inPhieuThuChi } from '../utils/print';

const LOAI_THU = ['Tiền hàng', 'Thu nợ khách', 'Góp vốn', 'Thu khác'];
const LOAI_CHI = ['Nhập hàng', 'Trả nợ NCC', 'Lương nhân viên', 'Tiền thuê mặt bằng', 'Điện nước', 'Vận chuyển', 'Chi khác'];

export default function Cashbook() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | in | out
  const [search, setSearch] = useState('');
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ transaction_type: 'in', category: 'Tiền hàng', amount: '', payment_method: 'cash', notes: '' });
  const [shop, setShop] = useState({});

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/finance/cash-flows`);
      setRows(res.data);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const g = async (k) => { try { return (await axios.get(`${API_BASE}/api/settings/${k}`)).data.value || ''; } catch { return ''; } };
      const [n, a] = await Promise.all([g('shop_name'), g('shop_address')]);
      setShop({ name: n || user.name, address: a });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';

  const hienThi = useMemo(() => rows.filter((r) => {
    const hopTab = tab === 'all' || r.transaction_type === tab;
    const txt = `${r.reference_id || ''} ${r.category || ''} ${r.notes || ''}`.toLowerCase();
    const hopTim = !search || txt.includes(search.toLowerCase());
    const ngay = (r.created_at || '').split(' ')[0];
    const hopTu = !tuNgay || ngay >= tuNgay;
    const hopDen = !denNgay || ngay <= denNgay;
    return hopTab && hopTim && hopTu && hopDen;
  }), [rows, tab, search, tuNgay, denNgay]);

  const tong = useMemo(() => {
    const thu = hienThi.filter((r) => r.transaction_type === 'in').reduce((s, r) => s + r.amount, 0);
    const chi = hienThi.filter((r) => r.transaction_type === 'out').reduce((s, r) => s + r.amount, 0);
    return { thu, chi, ton: thu - chi };
  }, [hienThi]);

  const moForm = (loai) => {
    setForm({ transaction_type: loai, category: loai === 'in' ? LOAI_THU[0] : LOAI_CHI[0], amount: '', payment_method: 'cash', notes: '' });
    setShowForm(true);
  };

  const luu = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) return alert('Nhập số tiền lớn hơn 0!');
    try {
      const res = await axios.post(`${API_BASE}/api/finance/cash-flows`, { ...form, amount: Number(form.amount) });
      setShowForm(false);
      fetchAll();
      if (window.confirm(`Đã lưu phiếu ${res.data.reference_id}. In phiếu ngay?`)) {
        inPhieuThuChi({ ...form, amount: Number(form.amount), reference_id: res.data.reference_id, created_at: new Date().toISOString() }, shop);
      }
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi lưu phiếu'); }
  };

  const xuat = () => xuatExcel(
    hienThi,
    [
      { key: 'reference_id', label: 'Số phiếu' },
      { key: 'created_at', label: 'Ngày', format: (v) => (v || '').split(' ')[0] },
      { key: 'transaction_type', label: 'Loại', format: (v) => (v === 'in' ? 'Thu' : 'Chi') },
      { key: 'category', label: 'Nhóm' },
      { key: 'amount', label: 'Số tiền', format: tien },
      { key: 'payment_method', label: 'Hình thức', format: (v) => (v === 'bank' ? 'Chuyển khoản' : 'Tiền mặt') },
      { key: 'notes', label: 'Diễn giải' },
    ],
    'So-quy-thu-chi', 'Sổ quỹ'
  );

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Wallet className="w-7 h-7 text-emerald-600" /> Sổ Quỹ Thu Chi
          </h2>
          <p className="text-xs text-slate-500 mt-1">Ghi nhận mọi khoản tiền ra vào, in phiếu thu/chi cho khách</p>
        </div>
        <div className="flex gap-2">
          <button onClick={xuat} className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </button>
          <button onClick={() => moForm('in')} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-md shadow-emerald-200">
            <ArrowDownRight className="w-4 h-4" /> Lập phiếu thu
          </button>
          <button onClick={() => moForm('out')} className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 shadow-md shadow-rose-200">
            <ArrowUpRight className="w-4 h-4" /> Lập phiếu chi
          </button>
        </div>
      </div>

      {/* Tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1"><ArrowDownRight className="w-4 h-4" /><span className="text-xs font-bold uppercase">Tổng thu</span></div>
          <div className="text-2xl font-black text-slate-800">{money(tong.thu)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-rose-600 mb-1"><ArrowUpRight className="w-4 h-4" /><span className="text-xs font-bold uppercase">Tổng chi</span></div>
          <div className="text-2xl font-black text-slate-800">{money(tong.chi)}</div>
        </div>
        <div className={`rounded-2xl shadow-sm p-5 text-white ${tong.ton >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-rose-500 to-red-600'}`}>
          <div className="flex items-center gap-2 opacity-90 mb-1"><Wallet className="w-4 h-4" /><span className="text-xs font-bold uppercase">Tồn quỹ</span></div>
          <div className="text-2xl font-black">{money(tong.ton)}</div>
        </div>
      </div>

      {/* Bộ lọc */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {[{ k: 'all', l: 'Tất cả' }, { k: 'in', l: 'Thu' }, { k: 'out', l: 'Chi' }].map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold ${tab === t.k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t.l}</button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm số phiếu, diễn giải..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" />
          </div>
          <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} title="Từ ngày"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" />
          <span className="text-slate-400 text-sm">→</span>
          <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} title="Đến ngày"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500" />
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : hienThi.length === 0 ? (
              <div className="py-16 text-center">
                <Wallet className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">{rows.length === 0 ? 'Chưa có phiếu thu chi nào.' : 'Không có phiếu khớp bộ lọc.'}</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Số phiếu</th>
                    <th className="py-3 px-4 font-semibold">Ngày</th>
                    <th className="py-3 px-4 font-semibold">Nhóm</th>
                    <th className="py-3 px-4 font-semibold">Diễn giải</th>
                    <th className="py-3 px-4 font-semibold text-right">Thu</th>
                    <th className="py-3 px-4 font-semibold text-right">Chi</th>
                    <th className="py-3 px-4 text-right font-semibold">In</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hienThi.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">{r.reference_id || '—'}</td>
                      <td className="py-3 px-4 text-slate-500">{(r.created_at || '').split(' ')[0]}</td>
                      <td className="py-3 px-4 text-slate-600">{r.category}</td>
                      <td className="py-3 px-4 text-slate-600">{r.notes || '—'}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">{r.transaction_type === 'in' ? money(r.amount) : ''}</td>
                      <td className="py-3 px-4 text-right font-bold text-rose-600">{r.transaction_type === 'out' ? money(r.amount) : ''}</td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => inPhieuThuChi({ ...r, loai: r.transaction_type }, shop)} title="In phiếu"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"><Printer className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* Form lập phiếu */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className={`text-lg font-bold mb-4 ${form.transaction_type === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
              {form.transaction_type === 'in' ? 'Lập phiếu thu' : 'Lập phiếu chi'}
            </h3>
            <form onSubmit={luu} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nhóm</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-white">
                  {(form.transaction_type === 'in' ? LOAI_THU : LOAI_CHI).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Số tiền</label>
                <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="VD: 500000" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Hình thức</label>
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-white">
                  <option value="cash">Tiền mặt</option>
                  <option value="bank">Chuyển khoản</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Diễn giải</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="VD: Trả tiền điện tháng 7" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="submit" className={`flex-1 py-3 text-white rounded-xl font-bold ${form.transaction_type === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>Lưu phiếu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
