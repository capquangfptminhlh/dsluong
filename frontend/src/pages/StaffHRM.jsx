import React, { useState, useEffect } from 'react';
import {
  Users, Clock, Plus, CheckCircle2, Lock, Unlock, KeyRound,
  Edit2, LogOut, Wallet, Award, Calendar, Printer, DollarSign,
  UserCheck, Sparkles, Trash2
} from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

const MODULES = [
  { key: 'pos', label: 'Bán thuốc & Kê đơn (POS)' },
  { key: 'orders', label: 'Lịch sử hóa đơn' },
  { key: 'products', label: 'Danh mục thuốc & Giá' },
  { key: 'categories', label: 'Nhóm dược lý' },
  { key: 'purchase', label: 'Nhập thuốc NCC' },
  { key: 'suppliers', label: 'Nhà cung cấp dược' },
  { key: 'inventory', label: 'Kho thuốc & Lô Date' },
  { key: 'customers', label: 'Hồ sơ bệnh nhân' },
  { key: 'loyalty', label: 'Thẻ VIP & Tích điểm' },
  { key: 'finance', label: 'Sổ quỹ thu chi' },
  { key: 'debt', label: 'Công nợ' },
  { key: 'reports', label: 'Báo cáo doanh thu' },
  { key: 'tax', label: 'Khai thuế & HĐĐT' },
  { key: 'staff', label: 'Nhân sự & Tính lương' }
];

const VAI_TRO = [
  'Dược sĩ Đại học (Chuyên môn)',
  'Dược sĩ Cao đẳng / Trung cấp',
  'Dược sĩ bán thuốc (POS)',
  'Thu ngân quầy thuốc',
  'Quản lý kho dược'
];

const CA_LAM_VIEC = [
  { label: 'Ca Sáng (07:00 - 14:30)', defaultHours: 7.5 },
  { label: 'Ca Chiều (14:30 - 22:00)', defaultHours: 7.5 },
  { label: 'Ca Hành Chính (07:30 - 17:30)', defaultHours: 8 },
  { label: 'Ca Tối Tăng Cường (17:30 - 22:00)', defaultHours: 4.5 },
  { label: 'Ca Nguyên Ngày (07:00 - 22:00)', defaultHours: 14 }
];

export default function StaffHRM() {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'payroll' | 'staff'
  const [shifts, setShifts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [payrollData, setPayrollData] = useState({ payroll: [], summary: { total_staff: 0, total_hours: 0, total_payroll: 0 } });
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Form Check-in
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedShiftType, setSelectedShiftType] = useState(CA_LAM_VIEC[0].label);
  const [checkInNote, setCheckInNote] = useState('');

  // Modal Chốt ca (Checkout)
  const [checkoutModal, setCheckoutModal] = useState(null);
  const [checkoutHours, setCheckoutHours] = useState('');
  const [checkoutNote, setCheckoutNote] = useState('');

  // Modal Thưởng / Hoa hồng nhanh
  const [bonusModal, setBonusModal] = useState(null);
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusOrder, setBonusOrder] = useState('');

  // Modal Xem Phiếu Lương
  const [payslipModal, setPayslipModal] = useState(null);

  // Modal Thêm / Sửa Nhân viên
  const [showForm, setShowForm] = useState(false);
  const [dangSua, setDangSua] = useState(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    username: '',
    password: '',
    role: VAI_TRO[2],
    base_salary: 6000000,
    hourly_rate: 30000,
    allowance: 500000,
    permissions: ['pos', 'orders', 'products', 'inventory', 'customers']
  });

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    try {
      const [shiftsRes, staffRes, payrollRes] = await Promise.all([
        axios.get(`${API_BASE}/api/hrm`),
        axios.get(`${API_BASE}/api/staff`),
        axios.get(`${API_BASE}/api/hrm/payroll?month=${selectedMonth}`).catch(() => ({
          data: { payroll: [], summary: { total_staff: 0, total_hours: 0, total_payroll: 0 } }
        }))
      ]);
      setShifts(shiftsRes.data || []);
      setStaffList(staffRes.data || []);
      if (payrollRes.data && payrollRes.data.payroll) {
        setPayrollData(payrollRes.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';

  const moThem = () => {
    setDangSua(null);
    setForm({
      name: '',
      phone: '',
      username: '',
      password: '',
      role: VAI_TRO[2],
      base_salary: 6000000,
      hourly_rate: 30000,
      allowance: 500000,
      permissions: ['pos', 'orders', 'products', 'inventory', 'customers']
    });
    setShowForm(true);
  };

  const moSua = (s) => {
    setDangSua(s);
    setForm({
      name: s.name || '',
      phone: s.phone || '',
      username: s.username || '',
      password: '',
      role: s.role || VAI_TRO[2],
      base_salary: s.base_salary ?? 0,
      hourly_rate: s.hourly_rate ?? 25000,
      allowance: s.allowance ?? 0,
      permissions: Array.isArray(s.permissions) ? s.permissions : []
    });
    setShowForm(true);
  };

  const toggleQuyen = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key]
    }));
  };

  const handleSubmitStaff = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Vui lòng nhập họ tên Dược sĩ / Nhân viên!');
    if (!dangSua && (!form.username.trim() || !form.password)) {
      return alert('Nhân viên mới cần có tên đăng nhập và mật khẩu!');
    }
    if (form.password && form.password.length < 6) {
      return alert('Mật khẩu tối thiểu 6 ký tự!');
    }

    try {
      if (dangSua) {
        const payload = {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          base_salary: Number(form.base_salary) || 0,
          hourly_rate: Number(form.hourly_rate) || 0,
          allowance: Number(form.allowance) || 0,
          permissions: form.permissions
        };
        if (form.password) payload.password = form.password;
        await axios.put(`${API_BASE}/api/staff/${dangSua.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/api/staff`, {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          base_salary: Number(form.base_salary) || 0,
          hourly_rate: Number(form.hourly_rate) || 0,
          allowance: Number(form.allowance) || 0,
          permissions: form.permissions
        });
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu hồ sơ nhân viên');
    }
  };

  const handleKhoa = async (s) => {
    const khoa = s.status !== 'locked';
    if (!window.confirm(`${khoa ? 'Khóa' : 'Mở khóa'} tài khoản của ${s.name}?`)) return;
    try {
      await axios.post(`${API_BASE}/api/staff/${s.id}/lock`, { locked: khoa });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi đổi trạng thái');
    }
  };

  const handleCheckIn = async () => {
    if (!selectedStaff) return alert('Vui lòng chọn Dược sĩ / Nhân viên vào ca!');
    try {
      await axios.post(`${API_BASE}/api/hrm/checkin`, {
        staff_id: selectedStaff,
        shift_type: selectedShiftType,
        note: checkInNote
      });
      setCheckInNote('');
      setSelectedStaff('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi Check-in vào ca');
    }
  };

  const openCheckoutModal = (shift) => {
    const checkInTime = new Date(shift.check_in).getTime();
    const diffH = Math.max(0.5, Math.round(((Date.now() - checkInTime) / 3600000) * 10) / 10);
    // Nếu vừa bấm test dưới 15 phút thì gợi ý số giờ chuẩn của ca để dễ chốt lương
    const matchedCa = CA_LAM_VIEC.find((c) => c.label === shift.shift_type);
    const suggestedHours = diffH < 0.6 && matchedCa ? matchedCa.defaultHours : diffH;

    setCheckoutModal(shift);
    setCheckoutHours(String(suggestedHours));
    setCheckoutNote(shift.note || '');
  };

  const handleConfirmCheckout = async (e) => {
    e.preventDefault();
    if (!checkoutModal) return;
    try {
      await axios.post(`${API_BASE}/api/hrm/checkout`, {
        shift_id: checkoutModal.id,
        manual_hours: Number(checkoutHours),
        note: checkoutNote
      });
      setCheckoutModal(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi chốt ca');
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!window.confirm('Xóa dòng chấm công này?')) return;
    try {
      await axios.delete(`${API_BASE}/api/hrm/${shiftId}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi xóa');
    }
  };

  const handleAddBonus = async (e) => {
    e.preventDefault();
    if (!bonusModal || !bonusAmount) return;
    try {
      await axios.post(`${API_BASE}/api/staff/commissions`, {
        staff_id: bonusModal.staff_id,
        amount: Number(bonusAmount),
        order_id: bonusOrder || null
      });
      setBonusModal(null);
      setBonusAmount('');
      setBonusOrder('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi cộng thưởng/hoa hồng');
    }
  };

  const activeShifts = shifts.filter((s) => s.status === 'ACTIVE' && !s.check_out);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-emerald-100 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-2 border border-emerald-200">
            <Sparkles className="w-3.5 h-3.5" /> Quản trị Nhân sự & Tiền lương Nhà Thuốc GPP
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-emerald-600" />
            Dược Sĩ, Chấm Công & Tính Lương
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Chấm công vào/ra ca, tự động tính giờ công, lương cứng, phụ cấp bằng Dược và hoa hồng đơn thuốc
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={moThem}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-colors text-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Thêm Dược sĩ / NV
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>ĐỘI NGŨ NHÂN SỰ</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{staffList.length} nhân sự</div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">
            Đang hoạt động: {staffList.filter((s) => s.status !== 'locked').length}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>CA ĐANG TRỰC TẠI QUẦY</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600">{activeShifts.length} ca đang mở</div>
          <div className="text-[11px] text-slate-400 mt-1">
            {activeShifts.length > 0 ? activeShifts.map((a) => a.staff_name).join(', ') : 'Chưa có ca đang trực'}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
            <span>TỔNG GIỜ CÔNG ({selectedMonth})</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{payrollData.summary?.total_hours || 0} giờ</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Tự động cộng từ các ca đã chốt
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-md">
          <div className="flex items-center justify-between text-xs font-bold opacity-90 mb-1">
            <span>QUỸ LƯƠNG THÁNG ({selectedMonth})</span>
            <Wallet className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black">{money(payrollData.summary?.total_payroll || 0)}</div>
          <div className="text-[11px] text-emerald-100 mt-1">
            Lương cứng + Giờ công + Phụ cấp + Thưởng
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 w-fit">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'attendance'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" /> 1. Chấm Công & Chốt Ca ({activeShifts.length} đang trực)
        </button>
        <button
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'payroll'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign className="w-4 h-4" /> 2. Bảng Tính Lương & Hoa Hồng
        </button>
        <button
          onClick={() => setActiveTab('staff')}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'staff'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <UserCheck className="w-4 h-4" /> 3. Hồ Sơ Dược Sĩ & Phân Quyền ({staffList.length})
        </button>
      </div>

      {/* ================= TAB 1: CHẤM CÔNG & CHỐT CA ================= */}
      {activeTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Cột trái: Vào ca */}
          <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs h-fit space-y-4">
            <h2 className="font-black text-slate-900 text-base flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Check-in Vào Ca Làm Việc
            </h2>

            {staffList.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-2">
                <p className="font-bold">Chưa có hồ sơ nhân viên nào!</p>
                <p>Hãy bấm nút <strong>"+ Thêm Dược sĩ / NV"</strong> ở góc trên để tạo nhân viên trước khi chấm công.</p>
                <button
                  onClick={moThem}
                  className="mt-2 px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs"
                >
                  + Tạo Dược sĩ ngay
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Chọn Dược sĩ / Nhân viên
                  </label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500"
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                  >
                    <option value="">-- Chọn nhân sự vào ca --</option>
                    {staffList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ca trực đăng ký
                  </label>
                  <select
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:border-emerald-500"
                    value={selectedShiftType}
                    onChange={(e) => setSelectedShiftType(e.target.value)}
                  >
                    {CA_LAM_VIEC.map((c) => (
                      <option key={c.label} value={c.label}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Ghi chú đầu ca (Tùy chọn)
                  </label>
                  <input
                    value={checkInNote}
                    onChange={(e) => setCheckInNote(e.target.value)}
                    placeholder="VD: Trực quầy chính 172 QL50..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleCheckIn}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all text-sm cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" /> Vào Ca Ngay (Check-in)
                </button>
              </>
            )}
          </div>

          {/* Cột phải: Danh sách ca đang trực & Lịch sử chấm công */}
          <div className="lg:col-span-8 space-y-6">
            {/* Ca đang trực cần chốt */}
            {activeShifts.length > 0 && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-emerald-950 text-sm flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Đang Trong Ca Trực ({activeShifts.length}) — Bấm "Chốt Ca" khi hết giờ làm
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {activeShifts.map((sh) => (
                    <div
                      key={sh.id}
                      className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-black text-slate-900 text-sm">{sh.staff_name}</div>
                        <div className="text-xs text-emerald-700 font-semibold">{sh.shift_type || 'Ca tiêu chuẩn'}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Vào ca: {new Date(sh.check_in).toLocaleString('vi-VN')}
                        </div>
                      </div>
                      <button
                        onClick={() => openCheckoutModal(sh)}
                        className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" /> Chốt Ca
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lịch sử chấm công */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-black text-slate-800 text-sm uppercase tracking-wider">
                  Bảng Nhật Ký Chấm Công & Giờ Làm Việc
                </h2>
                <span className="text-xs text-slate-400">{shifts.length} lượt chấm công</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="py-3 px-4 font-bold">Dược sĩ / NV</th>
                      <th className="py-3 px-4 font-bold">Ca làm việc</th>
                      <th className="py-3 px-4 font-bold">Vào ca / Ra ca</th>
                      <th className="py-3 px-4 font-bold text-right">Số giờ</th>
                      <th className="py-3 px-4 font-bold text-right">Lương ca</th>
                      <th className="py-3 px-4 font-bold text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shifts.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="py-10 text-center text-slate-400">
                          Chưa có dữ liệu chấm công. Hãy chọn nhân viên và bấm "Vào Ca Ngay".
                        </td>
                      </tr>
                    ) : (
                      shifts.map((shift) => {
                        const isCompleted = shift.status === 'COMPLETED' || !!shift.check_out;
                        const hours = Number(shift.hours_worked) || 0;
                        const rate = Number(shift.hourly_rate) || 25000;
                        const pay = Math.round(hours * rate);
                        return (
                          <tr key={shift.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{shift.staff_name}</div>
                              <div className="text-xs text-slate-400">{shift.staff_role}</div>
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="font-semibold text-slate-700">{shift.shift_type || 'Ca trực'}</div>
                              {shift.note && <div className="text-slate-400 truncate max-w-[160px]">{shift.note}</div>}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600">
                              <div>Vào: {new Date(shift.check_in).toLocaleString('vi-VN')}</div>
                              {shift.check_out && (
                                <div className="text-slate-400">
                                  Ra: {new Date(shift.check_out).toLocaleString('vi-VN')}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-800">
                              {isCompleted ? `${hours}h` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-emerald-700">
                              {isCompleted ? money(pay) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isCompleted ? (
                                  <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">
                                    Đã chốt ca ✓
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => openCheckoutModal(shift)}
                                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                                  >
                                    Chốt ca ngay
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteShift(shift.id)}
                                  className="p-1 text-slate-300 hover:text-rose-600 rounded"
                                  title="Xóa bản ghi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: BẢNG TÍNH LƯƠNG & HOA HỒNG ================= */}
      {activeTab === 'payroll' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Bảng Tổng Hợp Tính Lương Dược Sĩ & Nhân Viên
              </h2>
              <p className="text-xs text-slate-500">
                Công thức tự động: <strong>Thực lĩnh = Lương cứng + (Tổng giờ công × Lương giờ) + Phụ cấp + Hoa hồng/Thưởng</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">Kỳ lương tháng:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {payrollData.payroll.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              Chưa có nhân viên nào trong bảng lương. Hãy thêm nhân viên trước.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Họ tên & Chức danh</th>
                    <th className="py-3.5 px-4 font-bold text-center">Số ca / Giờ công</th>
                    <th className="py-3.5 px-4 font-bold text-right">Lương cứng</th>
                    <th className="py-3.5 px-4 font-bold text-right">Lương giờ công</th>
                    <th className="py-3.5 px-4 font-bold text-right">Phụ cấp</th>
                    <th className="py-3.5 px-4 font-bold text-right">Thưởng / Hoa hồng</th>
                    <th className="py-3.5 px-4 font-bold text-right">TỔNG THỰC LĨNH</th>
                    <th className="py-3.5 px-4 font-bold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrollData.payroll.map((row) => (
                    <tr key={row.staff_id} className="hover:bg-emerald-50/30">
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500">{row.role}</div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-lg text-xs font-bold">
                          {row.completed_shifts} ca ({row.total_hours}h)
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                        {money(row.base_salary)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-slate-800">{money(row.hourly_pay)}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.total_hours}h × {money(row.hourly_rate)}/h
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-slate-700">
                        {money(row.allowance)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-pink-600">+ {money(row.commission_pay)}</div>
                        <button
                          onClick={() => setBonusModal(row)}
                          className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
                        >
                          + Cộng thưởng
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="text-base font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                          {money(row.total_salary)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setPayslipModal(row)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" /> Phiếu lương
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: HỒ SƠ DƯỢC SĨ & PHÂN QUYỀN ================= */}
      {activeTab === 'staff' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-black text-slate-900 text-base">
              Danh Sách Dược Sĩ & Cấu Hình Mức Lương ({staffList.length})
            </h2>
          </div>

          {staffList.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              Chưa có nhân viên nào. Bấm "+ Thêm Dược sĩ / NV" để khởi tạo.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="py-3 px-4 font-bold">Họ tên</th>
                    <th className="py-3 px-4 font-bold">Tài khoản</th>
                    <th className="py-3 px-4 font-bold">Chức danh</th>
                    <th className="py-3 px-4 font-bold text-right">Lương cứng</th>
                    <th className="py-3 px-4 font-bold text-right">Lương giờ</th>
                    <th className="py-3 px-4 font-bold text-right">Phụ cấp</th>
                    <th className="py-3 px-4 font-bold">Quyền hạn</th>
                    <th className="py-3 px-4 font-bold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.map((s) => {
                    const quyen = Array.isArray(s.permissions) ? s.permissions : [];
                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{s.name}</div>
                          <div className="text-xs text-slate-400">{s.phone || 'Chưa cập nhật SĐT'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs bg-slate-100 px-2.5 py-1 rounded-lg font-semibold text-slate-700">
                            {s.username || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{s.role}</td>
                        <td className="py-3 px-4 text-right font-semibold">{money(s.base_salary || 0)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-emerald-700">{money(s.hourly_rate || 25000)}/h</td>
                        <td className="py-3 px-4 text-right font-semibold">{money(s.allowance || 0)}</td>
                        <td className="py-3 px-4">
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                            {quyen.length}/{MODULES.length} module
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => moSua(s)}
                              className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                              title="Chỉnh sửa lương & phân quyền"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleKhoa(s)}
                              className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer"
                              title={s.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                            >
                              {s.status === 'locked' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL CHỐT CA & TÍNH GIỜ CÔNG ================= */}
      {checkoutModal && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setCheckoutModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-1">
              Chốt Ca Trực: {checkoutModal.staff_name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {checkoutModal.shift_type} • Vào lúc {new Date(checkoutModal.check_in).toLocaleTimeString('vi-VN')}
            </p>

            <form onSubmit={handleConfirmCheckout} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Số giờ công thực tế của ca này
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={checkoutHours}
                  onChange={(e) => setCheckoutHours(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-black text-emerald-700 outline-none focus:border-emerald-500"
                />
                <div className="flex gap-1.5 mt-2">
                  {[4, 7.5, 8, 12].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setCheckoutHours(String(h))}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-50 text-slate-700 rounded-lg text-xs font-bold"
                    >
                      {h} giờ
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">Lương giờ công ca này:</span>
                <span className="text-base font-black text-emerald-700">
                  {money((Number(checkoutHours) || 0) * (Number(checkoutModal.hourly_rate) || 25000))}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Ghi chú kết ca
                </label>
                <input
                  value={checkoutNote}
                  onChange={(e) => setCheckoutNote(e.target.value)}
                  placeholder="VD: Hoàn thành tốt ca trực, bàn giao đủ..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCheckoutModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm cursor-pointer"
                >
                  Xác Nhận Chốt Ca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL CỘNG THƯỞNG / HOA HỒNG ================= */}
      {bonusModal && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setBonusModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-1 flex items-center gap-2">
              <Award className="w-5 h-5 text-pink-600" />
              Cộng Thưởng / Hoa Hồng: {bonusModal.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Khoản thưởng sẽ cộng trực tiếp vào Thực lĩnh tháng {selectedMonth}
            </p>

            <form onSubmit={handleAddBonus} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Số tiền thưởng / Hoa hồng (VNĐ)
                </label>
                <input
                  type="number"
                  min="0"
                  value={bonusAmount}
                  onChange={(e) => setBonusAmount(e.target.value)}
                  placeholder="VD: 200000"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg font-black text-pink-600 outline-none focus:border-pink-500"
                />
                <div className="flex gap-2 mt-2">
                  {[50000, 100000, 200000, 500000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setBonusAmount(String(v))}
                      className="px-2.5 py-1 bg-pink-50 text-pink-700 rounded-lg text-xs font-bold"
                    >
                      + {money(v)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Lý do / Mã đơn thuốc (Tùy chọn)
                </label>
                <input
                  value={bonusOrder}
                  onChange={(e) => setBonusOrder(e.target.value)}
                  placeholder="VD: Thưởng doanh số tư vấn TPCN..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBonusModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-black text-sm cursor-pointer"
                >
                  Lưu Khoản Thưởng
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL PHIẾU LƯƠNG CHUẨN GPP ================= */}
      {payslipModal && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setPayslipModal(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl border border-emerald-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center border-b border-slate-200 pb-4 mb-4">
              <div className="text-xs font-black text-emerald-700 uppercase tracking-widest">
                HỆ THỐNG NHÀ THUỐC NHÂN ĐỨC — CHUẨN GPP
              </div>
              <div className="text-[11px] text-slate-500">
                172 Quốc Lộ 50, KP4, TT. Cần Giuộc, Tỉnh Long An • ĐT: 0933.324.368
              </div>
              <h3 className="text-xl font-black text-slate-900 mt-3">
                PHIẾU LƯƠNG NHÂN SỰ ({selectedMonth})
              </h3>
            </div>

            <div className="space-y-2.5 text-sm mb-6">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Họ và tên:</span>
                <span className="font-black text-slate-900">{payslipModal.name}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Chức danh chuyên môn:</span>
                <span className="font-bold text-emerald-700">{payslipModal.role}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 pb-2">
                <span className="text-slate-500">Tổng số ca & giờ công:</span>
                <span className="font-bold text-slate-800">
                  {payslipModal.completed_shifts} ca ({payslipModal.total_hours} giờ)
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-600">1. Lương cơ bản cố định:</span>
                <span className="font-bold text-slate-800">{money(payslipModal.base_salary)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">
                  2. Lương theo giờ ({payslipModal.total_hours}h × {money(payslipModal.hourly_rate)}):
                </span>
                <span className="font-bold text-slate-800">{money(payslipModal.hourly_pay)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">3. Phụ cấp chuyên môn / Ăn ca:</span>
                <span className="font-bold text-slate-800">{money(payslipModal.allowance)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">4. Hoa hồng & Thưởng tư vấn đơn:</span>
                <span className="font-bold text-pink-600">+ {money(payslipModal.commission_pay)}</span>
              </div>

              <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl border border-emerald-200 mt-3">
                <span className="font-black text-emerald-950">TỔNG THỰC LĨNH:</span>
                <span className="text-2xl font-black text-emerald-700">{money(payslipModal.total_salary)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPayslipModal(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 text-sm"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" /> In Phiếu Lương
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL THÊM / SỬA DƯỢC SĨ & CẤU HÌNH LƯƠNG ================= */}
      {showForm && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-slate-900 mb-4">
              {dangSua ? `Cập nhật hồ sơ & lương: ${dangSua.name}` : 'Thêm Dược sĩ / Nhân viên mới'}
            </h3>

            <form onSubmit={handleSubmitStaff} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Họ và tên Dược sĩ / NV *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: DS. Nguyễn Thị Minh"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Số điện thoại
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="0933324368"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Chức danh / Vai trò tại Nhà thuốc
                </label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-emerald-500 bg-white"
                >
                  {VAI_TRO.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Khung cấu hình Chế độ Lương */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  Chế độ Lương & Phụ cấp (Tự động tính lương tháng)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lương cứng / tháng (VNĐ)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.base_salary}
                      onChange={(e) => setForm({ ...form, base_salary: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Lương theo giờ (VNĐ/giờ)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.hourly_rate}
                      onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phụ cấp cố định (VNĐ)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.allowance}
                      onChange={(e) => setForm({ ...form, allowance: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Khung Tài khoản đăng nhập */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3 text-slate-800">
                  <KeyRound className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-xs uppercase">Tài khoản đăng nhập quầy thuốc</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tên đăng nhập *</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      disabled={!!dangSua}
                      placeholder="vd: duocsi01"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {dangSua ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu *'}
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Tối thiểu 6 ký tự"
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Phân quyền */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Phân quyền ({form.permissions.length}/{MODULES.length} chức năng)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, permissions: MODULES.map((m) => m.key) })}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, permissions: [] })}
                      className="text-xs font-bold text-slate-500 hover:underline"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-slate-200 rounded-xl p-3 max-h-44 overflow-y-auto">
                  {MODULES.map((m) => (
                    <label
                      key={m.key}
                      className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-emerald-50/50 rounded-lg px-2 py-1.5"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(m.key)}
                        onChange={() => toggleQuyen(m.key)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 text-sm cursor-pointer"
                >
                  {dangSua ? 'Lưu Thay Đổi' : 'Tạo Hồ Sơ Dược Sĩ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
