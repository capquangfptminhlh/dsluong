import React, { useState, useEffect } from 'react';
import { Award, Plus, TrendingUp, Users, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Commissions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ staff_id: '', amount: '', order_id: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/staff/commissions`);
      setRows(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.staff_id || !form.amount) return alert('Vui lòng chọn Dược sĩ / Nhân viên và nhập số tiền!');
    const parsedOrderId = form.order_id && /^\d+$/.test(String(form.order_id).trim()) ? Number(form.order_id) : null;
    try {
      await axios.post(`${API_BASE}/api/staff/commissions`, {
        staff_id: Number(form.staff_id),
        amount: Number(form.amount),
        order_id: parsedOrderId,
        note: form.order_id || null,
      });
      setForm({ staff_id: '', amount: '', order_id: '' });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi ghi nhận thưởng / hoa hồng');
    }
  };

  const formatMoney = (n) =>
    new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';

  const tongCong = rows.reduce((s, r) => s + (r.tong_hoa_hong || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2.5">
            <Award className="w-7 h-7 text-emerald-600" />
            Thưởng & Hoa Hồng Tư Vấn Đơn Thuốc
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Ghi nhận thưởng doanh số, hoa hồng tư vấn TPCN & tự động cộng vào Bảng tính lương tháng
          </p>
        </div>
        <Link
          to="/app/staff"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold rounded-xl text-xs transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Về Bảng Chấm Công & Tính Lương
        </Link>
      </div>

      <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-md">
        <div className="flex items-center gap-2 opacity-90 mb-1 text-xs font-bold uppercase tracking-wider">
          <TrendingUp className="w-4 h-4" />
          <span>Tổng Quỹ Thưởng & Hoa Hồng Đã Ghi Nhận</span>
        </div>
        <div className="text-3xl md:text-4xl font-black">{formatMoney(tongCong)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ghi nhận hoa hồng */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs h-fit">
          <h2 className="text-base font-black text-slate-900 mb-4">Cộng Thưởng / Hoa Hồng Mới</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Dược sĩ / Nhân viên</label>
              <select
                value={form.staff_id}
                onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500 bg-white"
              >
                <option value="">-- Chọn Dược sĩ / Nhân viên --</option>
                {rows.map((r) => (
                  <option key={r.staff_id} value={r.staff_id}>{r.staff_name} ({r.role})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Số tiền thưởng (VNĐ)</label>
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="VD: 100000"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mã đơn / Ghi chú (tùy chọn)</label>
              <input
                type="text"
                value={form.order_id}
                onChange={(e) => setForm({ ...form, order_id: e.target.value })}
                placeholder="VD: Đơn TPCN #102"
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Ghi Nhận Vào Bảng Lương
            </button>
          </form>
        </div>

        {/* Bảng tổng hợp */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <h2 className="text-base font-black text-slate-900 mb-4">Tổng Hợp Hoa Hồng Theo Dược Sĩ</h2>

          {loading ? (
            <div className="py-12 text-center text-slate-400">Đang tải...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Chưa có nhân viên nào.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="pb-3 font-bold">Dược sĩ / Nhân viên</th>
                    <th className="pb-3 font-bold">Chức danh</th>
                    <th className="pb-3 font-bold text-right">Số lượt thưởng</th>
                    <th className="pb-3 font-bold text-right">Tổng hoa hồng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.staff_id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 font-bold text-slate-900">{r.staff_name}</td>
                      <td className="py-3.5 text-slate-500">{r.role}</td>
                      <td className="py-3.5 text-right text-slate-600 font-semibold">{r.so_lan} lượt</td>
                      <td className="py-3.5 text-right font-black text-emerald-700">{formatMoney(r.tong_hoa_hong)}</td>
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
