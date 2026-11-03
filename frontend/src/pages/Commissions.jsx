import React, { useState, useEffect } from 'react';
import { Scissors, Plus, TrendingUp } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Commissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ staff_id: '', amount: '', order_id: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/staff/commissions`);
      setRows(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.staff_id || !form.amount) return alert('Vui lòng chọn nhân viên và nhập số tiền!');
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/staff/commissions`, {
        staff_id: Number(form.staff_id),
        amount: Number(form.amount),
        order_id: form.order_id || null,
      });
      setForm({ staff_id: '', amount: '', order_id: '' });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi ghi hoa hồng');
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (n) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);

  const tongCong = rows.reduce((s, r) => s + (r.tong_hoa_hong || 0), 0);

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
          <Scissors className="w-8 h-8 text-pink-500" /> Tính Hoa Hồng
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Theo dõi hoa hồng của từng nhân viên / kỹ thuật viên</p>
      </div>

      <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-6 mb-8 text-white shadow-lg shadow-pink-500/20">
        <div className="flex items-center gap-2 opacity-90 mb-1">
          <TrendingUp className="w-5 h-5" />
          <span className="font-semibold">Tổng hoa hồng đã ghi nhận</span>
        </div>
        <div className="text-4xl font-black">{formatMoney(tongCong)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ghi nhận hoa hồng */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Ghi nhận hoa hồng</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Nhân viên</label>
              <select
                value={form.staff_id}
                onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                disabled={submitting}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 bg-white disabled:opacity-60"
              >
                <option value="">-- Chọn nhân viên --</option>
                {rows.map((r) => (
                  <option key={r.staff_id} value={r.staff_id}>{r.staff_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Số tiền (VNĐ)</label>
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                disabled={submitting}
                placeholder="VD: 50000"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Mã đơn (tùy chọn)</label>
              <input
                type="text"
                value={form.order_id}
                onChange={(e) => setForm({ ...form, order_id: e.target.value })}
                disabled={submitting}
                placeholder="VD: 12"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-pink-500/30 focus:border-pink-500 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-pink-600 hover:bg-pink-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-pink-500/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" /> {submitting ? 'Đang ghi...' : 'Ghi nhận'}
            </button>
          </form>
        </div>

        {/* Bảng tổng hợp */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Bảng hoa hồng theo nhân viên</h2>

          {loading ? (
            <div className="py-12 text-center text-slate-400">Đang tải...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center">
              <Scissors className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Chưa có nhân viên nào.</p>
              <p className="text-slate-400 text-sm mt-1">Thêm nhân viên ở mục Nhân sự trước.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="pb-3 font-semibold">Nhân viên</th>
                    <th className="pb-3 font-semibold">Vai trò</th>
                    <th className="pb-3 font-semibold text-right">Số lần</th>
                    <th className="pb-3 font-semibold text-right">Tổng hoa hồng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.staff_id}>
                      <td className="py-3 font-bold text-slate-800">{r.staff_name}</td>
                      <td className="py-3 text-slate-500">{r.role}</td>
                      <td className="py-3 text-right text-slate-600">{r.so_lan}</td>
                      <td className="py-3 text-right font-bold text-pink-600">{formatMoney(r.tong_hoa_hong)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
