import React, { useState, useEffect } from 'react';
import {
  Clock, Wallet, LogIn, LogOut, TrendingUp, TrendingDown,
  CreditCard, ShoppingBag, CheckCircle2, UserCheck, Sparkles, AlertCircle
} from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

const CA_MAU = [
  'Ca Sáng (07:00 - 14:30)',
  'Ca Chiều (14:30 - 22:00)',
  'Ca Hành Chính (07:30 - 17:30)',
  'Ca Nguyên Ngày (07:00 - 22:00)'
];

const TIEN_DAU_CA_NHANH = [0, 500000, 1000000, 2000000, 5000000];

export default function Shift() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [opening, setOpening] = useState('1000000');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [shiftType, setShiftType] = useState(CA_MAU[0]);
  const [openNote, setOpenNote] = useState('');

  const [closing, setClosing] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, h, st] = await Promise.all([
        axios.get(`${API_BASE}/api/shifts/current`),
        axios.get(`${API_BASE}/api/shifts`),
        axios.get(`${API_BASE}/api/staff`).catch(() => ({ data: [] }))
      ]);
      setCurrent(c.data);
      setHistory(h.data || []);
      setStaffList(st.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';

  const moCa = async () => {
    if (opening === '' || Number(opening) < 0) return alert('Vui lòng nhập số tiền mặt đầu ca hợp lệ!');
    setSubmitting(true);
    try {
      const staffObj = staffList.find((s) => String(s.id) === String(selectedStaffId));
      const userObj = JSON.parse(localStorage.getItem('user') || '{}');
      const pharmacistName = staffObj ? `${staffObj.name} (${staffObj.role})` : (userObj.name || 'Dược sĩ trực chính');
      const combinedNote = [shiftType, openNote].filter(Boolean).join(' — ');

      await axios.post(`${API_BASE}/api/shifts/open`, {
        opening_cash: Number(opening),
        pharmacist_name: pharmacistName,
        note: combinedNote
      });

      // Nếu có chọn nhân viên cụ thể thì tự động Check-in chấm công luôn
      if (selectedStaffId) {
        await axios.post(`${API_BASE}/api/hrm/checkin`, {
          staff_id: selectedStaffId,
          shift_type: shiftType,
          note: 'Tự động check-in khi mở ca quầy thuốc'
        }).catch(() => {});
      }

      setOpening('');
      setOpenNote('');
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi mở ca trực');
    } finally {
      setSubmitting(false);
    }
  };

  const chotCa = async () => {
    if (closing === '') return alert('Vui lòng nhập số tiền mặt thực tế đếm được trong két!');
    setSubmitting(true);
    try {
      const res = await axios.post(`${API_BASE}/api/shifts/close`, {
        closing_cash: Number(closing),
        note: note || (current?.note ? `${current.note} (Đã bàn giao)` : 'Đã chốt ca bàn giao quầy')
      });
      const d = res.data.difference;
      alert(
        `✅ ĐÃ CHỐT CA TRỰC THÀNH CÔNG!\n\n` +
        `• Tiền mặt dự kiến: ${money(res.data.expected_cash)}\n` +
        `• Tiền mặt thực đếm: ${money(res.data.closing_cash)}\n` +
        `• Chênh lệch két: ${d === 0 ? 'Khớp chuẩn 100%' : (d > 0 ? 'Thừa ' : 'Thiếu ') + money(Math.abs(d))}`
      );
      setClosing('');
      setNote('');
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi chốt ca');
    } finally {
      setSubmitting(false);
    }
  };

  const duKien = current ? current.expected_now : 0;
  const lechDuKien = closing !== '' ? Number(closing) - duKien : null;
  const closedHistory = history.filter((s) => s.status === 'closed');

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-2 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" /> Quy trình Bàn giao Quầy thuốc GPP
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2.5">
            <Clock className="w-7 h-7 text-emerald-600" />
            Chốt Ca Trực Dược Sĩ & Bàn Giao Két
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Kiểm đếm tiền mặt đầu/cuối ca, tự động đối soát doanh thu bán thuốc & chuyển khoản VietQR
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border ${
            current
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${current ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {current ? 'Đang Mở Ca Bán Thuốc' : 'Chưa Mở Ca Trực'}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center text-slate-400 font-medium">
          Đang tải thông tin ca trực...
        </div>
      ) : !current ? (
        /* MÀN HÌNH MỞ CA TRỰC MỚI */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                <LogIn className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900">Bắt Đầu Ca Trực Quầy Thuốc</h2>
                <p className="text-xs text-slate-500">Khai báo tiền lẻ đầu ca và Dược sĩ phụ trách chuyên môn</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Dược sĩ / Nhân viên trực ca
                  </label>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="">-- Chủ nhà thuốc / Dược sĩ chính --</option>
                    {staffList.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Khung ca làm việc
                  </label>
                  <select
                    value={shiftType}
                    onChange={(e) => setShiftType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
                  >
                    {CA_MAU.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tiền mặt đầu ca trong két (VNĐ)
                </label>
                <input
                  type="number"
                  min="0"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="Nhập số tiền mặt đầu ca..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-black text-emerald-700 outline-none focus:border-emerald-500"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {TIEN_DAU_CA_NHANH.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setOpening(String(val))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        Number(opening) === val
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200'
                      }`}
                    >
                      {money(val)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ghi chú nhận ca (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={openNote}
                  onChange={(e) => setOpenNote(e.target.value)}
                  placeholder="VD: Đủ tiền lẻ thối khách, nhiệt độ kho lạnh 22°C ổn định..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={moCa}
                disabled={submitting}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
              >
                <LogIn className="w-5 h-5" />
                {submitting ? 'Đang mở ca...' : 'Mở Ca Trực & Tự Động Chấm Công'}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 bg-emerald-950 text-white rounded-2xl p-6 md:p-7 space-y-4">
            <h3 className="font-black text-base flex items-center gap-2 text-emerald-300">
              <UserCheck className="w-5 h-5" /> Quy chuẩn Trực Ca Nhà Thuốc GPP
            </h3>
            <ul className="space-y-3 text-xs text-emerald-100/90 leading-relaxed">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Kiểm đếm quỹ tiền lẻ đầu ca:</strong> Đảm bảo khớp số tiền mặt bàn giao từ ca trước.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Tự động liên thông POS & Sổ quỹ:</strong> Mọi đơn thuốc thanh toán tiền mặt hoặc chuyển khoản VietQR đều được cộng tự động theo thời gian thực.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong>Tự động ghi nhận giờ công:</strong> Khi chọn Dược sĩ trực ca, hệ thống đồng thời Check-in vào bảng chấm công tính lương tháng.</span>
              </li>
            </ul>
          </div>
        </div>
      ) : (
        /* MÀN HÌNH ĐANG TRONG CA & CHỐT CA */
        <div className="space-y-6">
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-md">
              <div className="flex items-center justify-between opacity-90 text-xs font-bold mb-1">
                <span>TIỀN MẶT DỰ KIẾN TRONG KÉT</span>
                <Wallet className="w-4 h-4" />
              </div>
              <div className="text-2xl md:text-3xl font-black">{money(current.expected_now)}</div>
              <div className="text-[11px] text-emerald-100 mt-1.5 truncate">
                Đầu ca: {money(current.opening_cash)}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                <span>BÁN THUỐC TIỀN MẶT</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-black text-emerald-600">+ {money(current.cash_sales)}</div>
              <div className="text-[11px] text-slate-400 mt-1.5">
                Chi tiền mặt trong ca: − {money(current.cash_out)}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                <span>CHUYỂN KHOẢN / VIETQR</span>
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-black text-blue-600">+ {money(current.bank_sales || 0)}</div>
              <div className="text-[11px] text-slate-400 mt-1.5">
                Vào thẳng tài khoản ngân hàng
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                <span>TỔNG DOANH THU CA</span>
                <ShoppingBag className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-black text-slate-900">
                {money((current.cash_sales || 0) + (current.bank_sales || 0))}
              </div>
              <div className="text-[11px] text-slate-500 font-semibold mt-1.5">
                Đã xuất: <strong className="text-emerald-700">{current.order_count || 0}</strong> đơn thuốc
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chi tiết dòng tiền ca hiện tại */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4 h-fit">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-slate-900 text-base">Thông Tin Ca Đang Mở</h3>
                  <p className="text-xs text-slate-500">
                    Mở lúc: {(current.opened_at || '').replace('T', ' ').split('.')[0]}
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold">
                  {current.actor_name || 'Dược sĩ trực'}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-1.5 border-b border-dashed border-slate-100">
                  <span className="text-slate-500">1. Tiền mặt đầu ca</span>
                  <span className="font-bold text-slate-800">{money(current.opening_cash)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-dashed border-slate-100">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-500" /> 2. Thu tiền mặt bán thuốc
                  </span>
                  <span className="font-bold text-emerald-600">+ {money(current.cash_sales)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-dashed border-slate-100">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-rose-500" /> 3. Chi/hoàn tiền mặt tại quầy
                  </span>
                  <span className="font-bold text-rose-600">− {money(current.cash_out)}</span>
                </div>
                <div className="flex justify-between py-2 px-3 bg-emerald-50/70 rounded-xl border border-emerald-100">
                  <span className="font-bold text-emerald-900">Tiền mặt phải có trong két (1+2−3)</span>
                  <span className="font-black text-emerald-700 text-base">{money(current.expected_now)}</span>
                </div>
              </div>

              {current.note && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100">
                  <strong>Ghi chú đầu ca:</strong> {current.note}
                </div>
              )}
            </div>

            {/* Form kiểm tiền & chốt ca */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <LogOut className="w-5 h-5 text-rose-600" /> Kiểm Đếm & Chốt Ca Bàn Giao
                  </h2>
                  <p className="text-xs text-slate-500">
                    Đếm tổng tiền mặt thực tế đang có trong ngăn kéo quầy thuốc
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClosing(String(current.expected_now || 0))}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Điền khớp dự kiến ({money(current.expected_now)})
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tiền mặt thực tế đếm được (VNĐ)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={closing}
                    onChange={(e) => setClosing(e.target.value)}
                    placeholder="Nhập tổng tiền mặt thực đếm..."
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-black text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>

                {lechDuKien !== null && (
                  <div className={`rounded-xl p-4 flex items-center justify-between border ${
                    lechDuKien === 0
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {lechDuKien === 0 ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                      )}
                      <span className="font-bold text-sm text-slate-700">Đối chiếu chênh lệch két:</span>
                    </div>
                    <span className={`text-lg font-black ${
                      lechDuKien === 0
                        ? 'text-emerald-700'
                        : lechDuKien > 0
                        ? 'text-blue-600'
                        : 'text-rose-600'
                    }`}>
                      {lechDuKien === 0
                        ? 'Khớp chuẩn 100% ✓'
                        : (lechDuKien > 0 ? 'Thừa + ' : 'Thiếu − ') + money(Math.abs(lechDuKien))}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Ghi chú bàn giao ca
                  </label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="VD: Đã bàn giao đủ tiền mặt cho ca chiều, tủ thuốc nguyên vẹn..."
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={chotCa}
                  disabled={submitting}
                  className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black rounded-xl shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition-all text-sm cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  {submitting ? 'Đang chốt ca...' : 'Chốt Ca & Đóng Két Bàn Giao'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bảng lịch sử ca đã chốt */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">
            Lịch Sử Bàn Giao Ca Trực ({closedHistory.length} ca)
          </h3>
        </div>
        {closedHistory.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">
            Chưa có lịch sử ca đã chốt.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="py-3 px-4 font-bold">Mở ca / Đóng ca</th>
                  <th className="py-3 px-4 font-bold">Dược sĩ trực</th>
                  <th className="py-3 px-4 font-bold text-right">Đầu ca</th>
                  <th className="py-3 px-4 font-bold text-right">Bán TM</th>
                  <th className="py-3 px-4 font-bold text-right">Dự kiến</th>
                  <th className="py-3 px-4 font-bold text-right">Thực đếm</th>
                  <th className="py-3 px-4 font-bold text-right">Chênh lệch</th>
                  <th className="py-3 px-4 font-bold">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedHistory.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">
                        {(s.opened_at || '').replace('T', ' ').split('.')[0]}
                      </div>
                      <div className="text-slate-400">
                        → {(s.closed_at || '').replace('T', ' ').split('.')[0]}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {s.actor_name || 'Dược sĩ trực'}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">{money(s.opening_cash)}</td>
                    <td className="py-3 px-4 text-right text-emerald-600 font-semibold">+ {money(s.cash_sales)}</td>
                    <td className="py-3 px-4 text-right font-semibold">{money(s.expected_cash)}</td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">{money(s.closing_cash)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        s.difference === 0
                          ? 'bg-emerald-50 text-emerald-700'
                          : s.difference > 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {s.difference === 0
                          ? 'Khớp ✓'
                          : (s.difference > 0 ? '+' : '−') + money(Math.abs(s.difference))}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">
                      {s.note || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
