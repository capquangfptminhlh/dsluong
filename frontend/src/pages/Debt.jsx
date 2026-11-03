import React, { useState, useEffect, useMemo } from 'react';
import { Search, AlertCircle, ArrowDownToLine, ArrowUpFromLine, Plus, CheckCircle2, Wallet } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Debt() {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all'); // all | receivable | payable
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'receivable', partner_name: '', amount: '', due_date: '', notes: '' });

  const [payFor, setPayFor] = useState(null);
  const [payAmount, setPayAmount] = useState('');

  useEffect(() => {
    fetchDebts();
  }, []);

  const fetchDebts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/finance/debts`);
      setDebts(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.partner_name.trim() || !form.amount) return alert('Vui lòng nhập tên đối tác và số tiền!');
    try {
      await axios.post(`${API_BASE}/api/finance/debts`, {
        ...form,
        partner_name: form.partner_name.trim(),
        amount: Number(form.amount),
      });
      setShowForm(false);
      setForm({ type: 'receivable', partner_name: '', amount: '', due_date: '', notes: '' });
      fetchDebts();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi tạo phiếu công nợ');
    }
  };

  const handlePay = async (e) => {
    e.preventDefault();
    if (!payFor || !payAmount) return;
    try {
      await axios.post(`${API_BASE}/api/finance/debts/${payFor.id}/pay`, { paid_amount: Number(payAmount) });
      setPayFor(null);
      setPayAmount('');
      fetchDebts();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi ghi nhận thanh toán');
    }
  };

  const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + ' ₫';

  const hienThi = useMemo(() => {
    return debts.filter((d) => {
      const hopTab = tab === 'all' || d.type === tab;
      const hopTim = !search || (d.partner_name || '').toLowerCase().includes(search.toLowerCase());
      return hopTab && hopTim;
    });
  }, [debts, tab, search]);

  const tong = useMemo(() => {
    const conLai = (d) => Math.max(0, (d.amount || 0) - (d.paid_amount || 0));
    return {
      phaiThu: debts.filter((d) => d.type === 'receivable').reduce((s, d) => s + conLai(d), 0),
      phaiTra: debts.filter((d) => d.type === 'payable').reduce((s, d) => s + conLai(d), 0),
      quaHan: debts.filter((d) => d.status !== 'paid' && d.due_date && new Date(d.due_date) < new Date()).length,
    };
  }, [debts]);

  const nhanTrangThai = (d) => {
    if (d.status === 'paid') return { text: 'Đã tất toán', cls: 'bg-emerald-100 text-emerald-700' };
    if (d.due_date && new Date(d.due_date) < new Date()) return { text: 'Quá hạn', cls: 'bg-red-100 text-red-700' };
    if (d.status === 'partial') return { text: 'Trả một phần', cls: 'bg-amber-100 text-amber-700' };
    return { text: 'Chưa thu/trả', cls: 'bg-slate-100 text-slate-600' };
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Quản Lý Công Nợ</h2>
          <p className="text-xs text-slate-500 mt-1">Theo dõi các khoản phải thu từ khách hàng và phải trả nhà cung cấp</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200"
        >
          <Plus className="w-4 h-4" /> Tạo phiếu công nợ
        </button>
      </div>

      {/* Tổng quan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <ArrowDownToLine className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Phải thu</span>
          </div>
          <div className="text-2xl font-black text-slate-800">{formatMoney(tong.phaiThu)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-rose-600 mb-1">
            <ArrowUpFromLine className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Phải trả</span>
          </div>
          <div className="text-2xl font-black text-slate-800">{formatMoney(tong.phaiTra)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Quá hạn</span>
          </div>
          <div className="text-2xl font-black text-slate-800">{tong.quaHan} phiếu</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { k: 'all', l: 'Tất cả' },
          { k: 'receivable', l: 'Phải thu (Khách nợ)' },
          { k: 'payable', l: 'Phải trả (Nợ NCC)' },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm transition-colors ${
              tab === t.k
                ? 'font-bold text-indigo-600 border-b-2 border-indigo-600'
                : 'font-medium text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Danh sách */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên đối tác..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">Đang tải...</div>
          ) : hienThi.length === 0 ? (
            <div className="py-16 text-center">
              <Wallet className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">
                {debts.length === 0 ? 'Chưa có phiếu công nợ nào.' : 'Không tìm thấy phiếu phù hợp.'}
              </p>
              {debts.length === 0 && (
                <p className="text-slate-400 text-sm mt-1">Bấm "Tạo phiếu công nợ" để bắt đầu theo dõi.</p>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                <tr>
                  <th className="py-3 px-4 font-semibold">Đối tác</th>
                  <th className="py-3 px-4 font-semibold">Loại</th>
                  <th className="py-3 px-4 font-semibold text-right">Tổng nợ</th>
                  <th className="py-3 px-4 font-semibold text-right">Đã trả</th>
                  <th className="py-3 px-4 font-semibold text-right">Còn lại</th>
                  <th className="py-3 px-4 font-semibold">Hạn</th>
                  <th className="py-3 px-4 font-semibold">Trạng thái</th>
                  <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hienThi.map((d) => {
                  const tt = nhanTrangThai(d);
                  const conLai = Math.max(0, (d.amount || 0) - (d.paid_amount || 0));
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-bold text-slate-800">{d.partner_name}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          d.type === 'receivable' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {d.type === 'receivable' ? 'Phải thu' : 'Phải trả'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatMoney(d.amount)}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatMoney(d.paid_amount)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">{formatMoney(conLai)}</td>
                      <td className="py-3 px-4 text-slate-500">{d.due_date || '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tt.cls}`}>{tt.text}</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {d.status !== 'paid' && (
                          <button
                            onClick={() => { setPayFor(d); setPayAmount(String(conLai)); }}
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100"
                          >
                            Ghi nhận trả
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Form tạo phiếu */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Tạo phiếu công nợ</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Loại</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="receivable">Phải thu (khách nợ mình)</option>
                  <option value="payable">Phải trả (mình nợ nhà cung cấp)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tên đối tác</label>
                <input
                  value={form.partner_name}
                  onChange={(e) => setForm({ ...form, partner_name: e.target.value })}
                  placeholder="VD: Anh Dũng / NCC Thức ăn thú cưng"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Số tiền (VNĐ)</label>
                <input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="VD: 3500000"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Hạn thanh toán</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ghi chú</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">
                  Hủy
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">
                  Lưu phiếu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ghi nhận thanh toán */}
      {payFor && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setPayFor(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-bold text-slate-800">Ghi nhận thanh toán</h3>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {payFor.partner_name} — còn lại {formatMoney(Math.max(0, (payFor.amount || 0) - (payFor.paid_amount || 0)))}
            </p>
            <form onSubmit={handlePay} className="space-y-4">
              <input
                type="number"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setPayFor(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">
                  Hủy
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700">
                  Xác nhận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
