import React, { useState, useEffect } from 'react';
import { Users, Clock, Plus, CheckCircle, Lock, Unlock, KeyRound, Edit2, LogOut } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { laChuCuaHang } from '../utils/quyen';

// Các module phân quyền — khớp với các mục trong menu
const MODULES = [
  { key: 'pos', label: 'Bán hàng (POS)' },
  { key: 'orders', label: 'Đơn hàng' },
  { key: 'products', label: 'Sản phẩm / Dịch vụ' },
  { key: 'categories', label: 'Danh mục' },
  { key: 'purchase', label: 'Nhập hàng' },
  { key: 'suppliers', label: 'Nhà cung cấp' },
  { key: 'inventory', label: 'Kho hàng' },
  { key: 'customers', label: 'Khách hàng' },
  { key: 'loyalty', label: 'Khách thân thiết' },
  { key: 'finance', label: 'Tài chính / Sổ quỹ' },
  { key: 'debt', label: 'Công nợ' },
  { key: 'reports', label: 'Báo cáo' },
  { key: 'tax', label: 'Khai thuế' },
  { key: 'staff', label: 'Nhân sự' },
  { key: 'rooms', label: 'Phòng / Khu vực' },
  { key: 'appointments', label: 'Lịch hẹn' },
  { key: 'promotions', label: 'Khuyến mãi' },
];

const VAI_TRO = ['Thu ngân', 'Bán hàng', 'Kỹ thuật viên', 'Quản lý', 'Kho'];

const formatShiftTime = (value) => {
  if (!value) return '—';
  const raw = String(value).trim();
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw);
  const date = new Date(sqliteUtc ? `${raw.replace(' ', 'T')}Z` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export default function StaffHRM() {
  const isOwner = laChuCuaHang();
  const [shifts, setShifts] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [dangSua, setDangSua] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', username: '', password: '', role: 'Thu ngân', permissions: [] });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [shiftsRes, staffRes] = await Promise.all([
        axios.get(`${API_BASE}/api/hrm`),
        axios.get(`${API_BASE}/api/staff`)
      ]);
      setShifts(shiftsRes.data);
      setStaffList(staffRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const moThem = () => {
    setDangSua(null);
    setForm({ name: '', phone: '', username: '', password: '', role: 'Thu ngân', permissions: [] });
    setShowForm(true);
  };

  const moSua = (s) => {
    setDangSua(s);
    setForm({
      name: s.name || '',
      phone: s.phone || '',
      username: s.username || '',
      password: '',
      role: s.role || 'Thu ngân',
      permissions: Array.isArray(s.permissions) ? s.permissions : [],
    });
    setShowForm(true);
  };

  const toggleQuyen = (key) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  };

  const handleSubmitStaff = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Vui lòng nhập tên nhân viên!');
    if (!dangSua && (!form.username.trim() || !form.password)) {
      return alert('Nhân viên mới cần có tên đăng nhập và mật khẩu!');
    }
    if (form.password && form.password.length < 6) {
      return alert('Mật khẩu tối thiểu 6 ký tự!');
    }

    try {
      if (dangSua) {
        const payload = { name: form.name.trim(), role: form.role, permissions: form.permissions };
        if (form.password) payload.password = form.password;
        await axios.put(`${API_BASE}/api/staff/${dangSua.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/api/staff`, {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          username: form.username.trim(),
          password: form.password,
          role: form.role,
          permissions: form.permissions,
        });
      }
      setShowForm(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu nhân viên');
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
    if (!selectedStaff) return alert("Vui lòng chọn nhân viên");
    try {
      await axios.post(`${API_BASE}/api/hrm/checkin`, { staff_id: selectedStaff });
      alert('Đã Check-in thành công!');
      fetchData();
      setSelectedStaff('');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Lỗi Check-in');
    }
  };

  const handleCheckOut = async (shift) => {
    if (!window.confirm(`Kết thúc ca của ${shift.staff_name || 'nhân viên này'}?`)) return;
    try {
      await axios.post(`${API_BASE}/api/hrm/checkout`, { shift_id: shift.id });
      alert('Đã kết thúc ca làm việc!');
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Lỗi khi kết thúc ca');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-8 h-8 text-blue-500" /> Quản Lý Nhân Sự (HRM)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Tài khoản đăng nhập, phân quyền, chấm công và ca làm việc</p>
        </div>
        {isOwner && (
          <button
            onClick={moThem}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-200 transition-colors"
          >
            <Plus className="w-5 h-5" /> Thêm nhân viên
          </button>
        )}
      </div>

      {/* Danh sách nhân viên + tài khoản đăng nhập */}
      <div className="bg-white rounded-2xl p-6 border shadow-sm mb-8">
        <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" /> Nhân viên ({staffList.length})
        </h2>
        {staffList.length === 0 ? (
          <div className="py-10 text-center">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">Chưa có nhân viên nào.</p>
            <p className="text-slate-400 text-sm mt-1">Bấm "Thêm nhân viên" để tạo tài khoản đăng nhập cho họ.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="pb-3 font-bold">Tên</th>
                  {isOwner && <th className="pb-3 font-bold">Tài khoản</th>}
                  <th className="pb-3 font-bold">Vai trò</th>
                  {isOwner && <th className="pb-3 font-bold">Quyền</th>}
                  {isOwner && <th className="pb-3 font-bold">Trạng thái</th>}
                  {isOwner && <th className="pb-3 font-bold text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((s) => {
                  const quyen = Array.isArray(s.permissions) ? s.permissions : [];
                  return (
                    <tr key={s.id}>
                      <td className="py-3 font-bold text-slate-800">{s.name}</td>
                      {isOwner && (
                        <td className="py-3 text-slate-600">
                          {s.username ? (
                            <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded">{s.username}</span>
                          ) : (
                            <span className="text-amber-600 text-xs font-semibold">chưa có tài khoản</span>
                          )}
                        </td>
                      )}
                      <td className="py-3 text-slate-600">{s.role}</td>
                      {isOwner && (
                        <td className="py-3 text-slate-600">
                          {quyen.length === 0 ? (
                            <span className="text-slate-400 text-xs">chưa cấp quyền</span>
                          ) : (
                            <span className="text-xs font-semibold">{quyen.length}/{MODULES.length} module</span>
                          )}
                        </td>
                      )}
                      {isOwner && (
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            s.status === 'locked' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {s.status === 'locked' ? 'Đã khóa' : 'Đang hoạt động'}
                          </span>
                        </td>
                      )}
                      {isOwner && (
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => moSua(s)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Sửa / đổi mật khẩu">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleKhoa(s)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg" title={s.status === 'locked' ? 'Mở khóa' : 'Khóa'}>
                              {s.status === 'locked' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-1 bg-white rounded-2xl p-6 border shadow-sm flex flex-col justify-center">
          <h2 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Clock className="w-5 h-5"/> Check-in Ca Làm Việc</h2>
          <select 
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl mb-4 outline-none focus:border-blue-500"
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
          >
            <option value="">-- Chọn Nhân viên --</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
          <button onClick={handleCheckIn} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors">
            <CheckCircle className="w-5 h-5"/> Vào Ca Ngay
          </button>
        </div>

        <div className="md:col-span-2 bg-white rounded-2xl p-6 border shadow-sm">
          <h2 className="font-bold text-slate-700 mb-4">Lịch Sử Chấm Công Gần Đây</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-sm">
                  <th className="pb-3 font-bold">Nhân viên</th>
                  <th className="pb-3 font-bold">Vào ca</th>
                  <th className="pb-3 font-bold">Ra ca</th>
                  <th className="pb-3 font-bold">Trạng thái</th>
                  <th className="pb-3 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan="5" className="py-4 text-center text-slate-400">Chưa có dữ liệu chấm công.</td></tr>
                ) : (
                  shifts.map((shift) => {
                    const active = shift.status === 'ACTIVE';
                    return (
                      <tr key={shift.id} className="border-b border-slate-100">
                        <td className="py-3 font-semibold text-slate-800">{shift.staff_name || 'Nhân viên'}</td>
                        <td className="py-3 text-slate-600">{formatShiftTime(shift.check_in)}</td>
                        <td className="py-3 text-slate-600">{formatShiftTime(shift.check_out)}</td>
                        <td className="py-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {active ? 'Đang trong ca' : 'Đã kết thúc'}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {active ? (
                            <button
                              onClick={() => handleCheckOut(shift)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <LogOut className="w-4 h-4" /> Ra ca
                            </button>
                          ) : <span className="text-slate-400">—</span>}
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

      {/* Form thêm / sửa nhân viên */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {dangSua ? `Sửa nhân viên: ${dangSua.name}` : 'Thêm nhân viên mới'}
            </h3>

            <form onSubmit={handleSubmitStaff} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Họ tên</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Số điện thoại</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={!!dangSua}
                    placeholder="0912345678"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3 text-blue-800">
                  <KeyRound className="w-4 h-4" />
                  <span className="font-bold text-sm">Tài khoản đăng nhập</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Tên đăng nhập</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      disabled={!!dangSua}
                      placeholder="vd: thungan01"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">
                      {dangSua ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu'}
                    </label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="tối thiểu 6 ký tự"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-blue-700/70 mt-2">
                  Nhân viên đăng nhập bằng tài khoản này. Tên đăng nhập không đổi được sau khi tạo.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Vai trò</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white"
                >
                  {VAI_TRO.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Phân quyền ({form.permissions.length}/{MODULES.length} module)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, permissions: MODULES.map((m) => m.key) })}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700"
                    >
                      Chọn hết
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, permissions: [] })}
                      className="text-xs font-bold text-slate-500 hover:text-slate-700"
                    >
                      Bỏ hết
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-slate-200 rounded-xl p-3">
                  {MODULES.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(m.key)}
                        onChange={() => toggleQuyen(m.key)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Nhân viên chỉ vào được những module được tick. Chủ cửa hàng luôn có toàn quyền.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">
                  Hủy
                </button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">
                  {dangSua ? 'Lưu thay đổi' : 'Tạo nhân viên'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
