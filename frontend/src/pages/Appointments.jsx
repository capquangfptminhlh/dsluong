import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Calendar as CalendarIcon, Clock, Bed, Plus, CheckCircle2 } from 'lucide-react';
import API_BASE from '../config/api';

export default function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', service_id: '', room_id: '', staff_id: '', start_time: '', end_time: '', notes: ''
  });

  const fetchData = async () => {
    try {
      const [appRes, roomRes, staffRes, srvRes] = await Promise.all([
        axios.get(`${API_BASE}/api/appointments`),
        axios.get(`${API_BASE}/api/rooms`),
        axios.get(`${API_BASE}/api/staff`),
        axios.get(`${API_BASE}/api/products`)
      ]);
      setAppointments(appRes.data);
      setRooms(roomRes.data);
      setStaff(staffRes.data);
      setServices(srvRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const selectedService = services.find(s => s.id === Number(form.service_id));
      await axios.post(`${API_BASE}/api/appointments`, {
        ...form,
        service_name: selectedService ? selectedService.name : 'Khác'
      });
      alert('Đã thêm lịch hẹn!');
      setShowForm(false);
      setForm({ customer_name: '', customer_phone: '', service_id: '', room_id: '', staff_id: '', start_time: '', end_time: '', notes: '' });
      fetchData();
    } catch {
      alert('Lỗi thêm lịch hẹn');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.put(`${API_BASE}/api/appointments/${id}/status`, { status });
      fetchData();
    } catch {
      alert('Lỗi cập nhật trạng thái');
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'pending': return <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-xs font-medium">Chờ duyệt</span>;
      case 'confirmed': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-xs font-medium">Đã xác nhận</span>;
      case 'completed': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg text-xs font-medium">Hoàn thành</span>;
      case 'cancelled': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg text-xs font-medium">Đã hủy</span>;
      default: return null;
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Đang tải lịch hẹn...</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lịch Hẹn & Phòng</h1>
          <p className="text-slate-500 text-sm mt-1">Quản lý đặt lịch Spa, Salon</p>
        </div>
        <button 
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary hover:bg-indigo-600 text-white px-4 py-2 rounded-xl transition-colors font-medium shadow-sm"
        >
          <Plus className="w-5 h-5" /> Đặt lịch mới
        </button>
      </div>

      {showForm && (
        <div className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Thông tin Đặt lịch</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tên khách hàng</label>
              <input type="text" required value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none" placeholder="Nhập tên..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
              <input type="text" value={form.customer_phone} onChange={e => setForm({...form, customer_phone: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none" placeholder="Nhập SĐT..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dịch vụ</label>
              <select required value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none">
                <option value="">-- Chọn dịch vụ --</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nhân viên / KTV</label>
              <select value={form.staff_id} onChange={e => setForm({...form, staff_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none">
                <option value="">-- Không chỉ định --</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phòng / Giường</label>
              <select value={form.room_id} onChange={e => setForm({...form, room_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none">
                <option value="">-- Không chỉ định --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Bắt đầu lúc</label>
              <input type="datetime-local" required value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dự kiến kết thúc</label>
              <input type="datetime-local" required value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-primary focus:border-primary outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="flex-1 bg-primary text-white py-2 rounded-lg font-medium hover:bg-indigo-600">Lưu lịch</button>
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-medium hover:bg-slate-200">Hủy</button>
            </div>
          </form>
        </div>
      )}

      {/* SƠ ĐỒ PHÒNG GIƯỜNG */}
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Bed className="w-5 h-5 text-indigo-500" /> Sơ đồ Phòng & Giường</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        {rooms.length === 0 ? (
          <div className="col-span-full p-6 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-200">
            Chưa có dữ liệu phòng. Hãy thêm phòng trong phần Cài đặt.
          </div>
        ) : rooms.map(room => {
          // Check if room has active appointment right now (simplified logic)
          const isActive = appointments.some(a => a.room_id === room.id && (a.status === 'confirmed' || a.status === 'pending'));
          return (
            <div key={room.id} className={`p-4 rounded-xl border ${isActive ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-slate-100 shadow-sm'}`}>
              <div className="font-bold text-slate-800">{room.name}</div>
              <div className="text-xs text-slate-500 mb-2">{room.type}</div>
              {isActive ? (
                <div className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-100/50 px-2 py-1 rounded-md">
                  <Clock className="w-3 h-3" /> Đang có khách
                </div>
              ) : (
                <div className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                  <CheckCircle2 className="w-3 h-3" /> Trống
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* DANH SÁCH LỊCH HẸN */}
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-indigo-500" /> Danh sách Ca Hẹn (Tất cả)</h2>
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-3 px-4 text-xs font-semibold text-slate-500">Giờ hẹn</th>
              <th className="py-3 px-4 text-xs font-semibold text-slate-500">Khách hàng</th>
              <th className="py-3 px-4 text-xs font-semibold text-slate-500">Dịch vụ</th>
              <th className="py-3 px-4 text-xs font-semibold text-slate-500">Phòng/KTV</th>
              <th className="py-3 px-4 text-xs font-semibold text-slate-500">Trạng thái</th>
              <th className="py-3 px-4 text-xs font-semibold text-slate-500 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {appointments.length === 0 ? (
              <tr><td colSpan="6" className="py-8 text-center text-slate-500">Chưa có lịch hẹn nào</td></tr>
            ) : appointments.map(app => (
              <tr key={app.id} className="hover:bg-slate-50">
                <td className="py-3 px-4">
                  <div className="font-semibold text-slate-800">{new Date(app.start_time).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</div>
                  <div className="text-xs text-slate-500">{new Date(app.start_time).toLocaleDateString('vi-VN')}</div>
                </td>
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-800">{app.customer_name}</div>
                  <div className="text-xs text-slate-500">{app.customer_phone}</div>
                </td>
                <td className="py-3 px-4 font-medium text-primary">{app.service_name}</td>
                <td className="py-3 px-4">
                  <div className="text-sm text-slate-700">{rooms.find(r => r.id === app.room_id)?.name || '-'}</div>
                  <div className="text-xs text-slate-500">{staff.find(s => s.id === app.staff_id)?.name || '-'}</div>
                </td>
                <td className="py-3 px-4">{getStatusBadge(app.status)}</td>
                <td className="py-3 px-4 text-right flex justify-end gap-2">
                  {app.status === 'pending' && <button onClick={() => updateStatus(app.id, 'confirmed')} className="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100">Xác nhận</button>}
                  {app.status === 'confirmed' && <button onClick={() => updateStatus(app.id, 'completed')} className="text-xs px-2 py-1 bg-green-50 text-green-600 rounded hover:bg-green-100">Hoàn thành</button>}
                  {(app.status === 'pending' || app.status === 'confirmed') && <button onClick={() => updateStatus(app.id, 'cancelled')} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Hủy</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
