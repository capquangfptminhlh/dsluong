import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit2, Trash2, Search, Phone, MapPin } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dangSua, setDangSua] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', address: '', tax_code: '', note: '' });

  useEffect(() => { fetchList(); }, []);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/suppliers`);
      setList(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const moThem = () => { setDangSua(null); setForm({ name: '', phone: '', address: '', tax_code: '', note: '' }); setShowForm(true); };
  const moSua = (s) => { setDangSua(s); setForm({ name: s.name, phone: s.phone || '', address: s.address || '', tax_code: s.tax_code || '', note: s.note || '' }); setShowForm(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Vui lòng nhập tên nhà cung cấp!');
    try {
      if (dangSua) await axios.put(`${API_BASE}/api/suppliers/${dangSua.id}`, form);
      else await axios.post(`${API_BASE}/api/suppliers`, form);
      setShowForm(false);
      fetchList();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi lưu'); }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`Xóa nhà cung cấp "${s.name}"?`)) return;
    try { await axios.delete(`${API_BASE}/api/suppliers/${s.id}`); fetchList(); }
    catch (err) { alert(err.response?.data?.error || 'Lỗi khi xóa'); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + ' ₫';
  const hienThi = list.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search));

  const tongNo = list.reduce((s, x) => s + (x.total_debt || 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Truck className="w-8 h-8 text-orange-500" /> Nhà Cung Cấp
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            {list.length} NCC · Đang nợ NCC: <span className="font-bold text-rose-600">{money(tongNo)}</span>
          </p>
        </div>
        <button onClick={moThem} className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-md shadow-orange-200 transition-colors">
          <Plus className="w-5 h-5" /> Thêm NCC
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc SĐT..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-500" />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">Đang tải...</div>
          ) : hienThi.length === 0 ? (
            <div className="py-16 text-center">
              <Truck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">{list.length === 0 ? 'Chưa có nhà cung cấp nào.' : 'Không tìm thấy.'}</p>
              {list.length === 0 && <p className="text-slate-400 text-sm mt-1">Thêm NCC để bắt đầu nhập hàng.</p>}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                <tr>
                  <th className="py-3 px-4 font-semibold">Tên NCC</th>
                  <th className="py-3 px-4 font-semibold">Liên hệ</th>
                  <th className="py-3 px-4 font-semibold text-right">Tổng đã nhập</th>
                  <th className="py-3 px-4 font-semibold text-right">Đang nợ</th>
                  <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hienThi.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{s.name}</div>
                      {s.tax_code && <div className="text-xs text-slate-400">MST: {s.tax_code}</div>}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {s.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" />{s.phone}</div>}
                      {s.address && <div className="flex items-center gap-1 text-xs text-slate-400"><MapPin className="w-3 h-3" />{s.address}</div>}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600">{money(s.total_purchased)}</td>
                    <td className="py-3 px-4 text-right font-bold text-rose-600">{money(s.total_debt)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => moSua(s)} className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(s)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">{dangSua ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tên NCC</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Cty Tân Hiệp Phát"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Số điện thoại</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0988..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mã số thuế</label>
                  <input value={form.tax_code} onChange={(e) => setForm({ ...form, tax_code: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Địa chỉ</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ghi chú</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="submit" className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600">{dangSua ? 'Lưu' : 'Thêm'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
