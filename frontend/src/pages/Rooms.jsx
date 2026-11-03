import React, { useState, useEffect } from 'react';
import { BedDouble, Plus, Trash2, Users } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

// Nhãn thay đổi theo ngành: Pet Shop gọi là "Chuồng/Phòng lưu trú", Khách sạn gọi là "Phòng"...
const LABELS = {
  petshop: { title: 'Phòng Lưu trú', desc: 'Quản lý chuồng, phòng lưu trú cho thú cưng', unit: 'Chuồng / Phòng' },
  hotel: { title: 'Quản lý Phòng', desc: 'Danh sách phòng, sức chứa và tình trạng sử dụng', unit: 'Phòng' },
  clinic: { title: 'Phòng khám / Giường', desc: 'Quản lý phòng khám và giường bệnh', unit: 'Phòng / Giường' },
  spa: { title: 'Phòng / Giường', desc: 'Quản lý phòng trị liệu và giường massage', unit: 'Phòng / Giường' },
};

const TYPE_OPTIONS = ['Phòng', 'Giường', 'Chuồng', 'Bàn', 'Khu vực'];

export default function Rooms() {
  const industry = localStorage.getItem('industry_type') || 'retail';
  const L = LABELS[industry] || { title: 'Phòng / Khu vực', desc: 'Quản lý phòng, giường, khu vực phục vụ', unit: 'Phòng' };

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', type: 'Phòng', capacity: 1 });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/rooms`);
      setRooms(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Vui lòng nhập tên!');
    try {
      await axios.post(`${API_BASE}/api/rooms`, {
        name: form.name.trim(),
        type: form.type,
        capacity: Number(form.capacity) || 1,
      });
      setForm({ name: '', type: form.type, capacity: 1 });
      fetchRooms();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi thêm');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Xóa "${name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/rooms/${id}`);
      fetchRooms();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi xóa');
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
          <BedDouble className="w-8 h-8 text-purple-500" /> {L.title}
        </h1>
        <p className="text-slate-500 mt-1 font-medium">{L.desc}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form thêm mới */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Thêm mới</h2>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Tên {L.unit}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Phòng 101"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Loại</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 bg-white"
              >
                {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Sức chứa</label>
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Hình ảnh đại diện</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => setForm({ ...form, image: evt.target.result });
                    reader.readAsDataURL(file);
                  }
                }}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
              {form.image && <img src={form.image} className="w-16 h-16 rounded-xl object-cover mt-2 border border-slate-200" />}
            </div>
            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md shadow-purple-500/25 transition-colors"
            >
              <Plus className="w-5 h-5" /> Thêm
            </button>
          </form>
        </div>

        {/* Danh sách */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            Danh sách <span className="text-slate-400 font-medium">({rooms.length})</span>
          </h2>

          {loading ? (
            <div className="py-12 text-center text-slate-400">Đang tải...</div>
          ) : rooms.length === 0 ? (
            <div className="py-12 text-center">
              <BedDouble className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Chưa có {L.unit.toLowerCase()} nào.</p>
              <p className="text-slate-400 text-sm mt-1">Thêm mới ở khung bên trái để bắt đầu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {rooms.map((r) => (
                <div key={r.id} className="border border-slate-200 rounded-xl p-4 flex items-start justify-between hover:border-purple-300 transition-colors">
                  <div>
                    <div className="font-bold text-slate-800">{r.name}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{r.type}</div>
                    <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                      <Users className="w-3.5 h-3.5" /> Sức chứa: {r.capacity}
                    </div>
                    <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full font-bold ${
                      r.status === 'available'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status === 'available' ? 'Đang trống' : 'Đang dùng'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(r.id, r.name)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
