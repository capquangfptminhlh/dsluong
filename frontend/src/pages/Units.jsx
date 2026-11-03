import React, { useState, useEffect } from 'react';
import { Plus, Search, Scale, Trash2, Box, Save } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Units() {
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chon, setChon] = useState(null); // sản phẩm đang mở
  const [baseUnit, setBaseUnit] = useState('');
  const [form, setForm] = useState({ name: '', ratio: '', price: '' });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/pricing/units`),
      ]);
      setProducts(p.data);
      setUnits(u.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
  const dvCua = (pid) => units.filter((u) => u.product_id === pid);

  const moSP = (p) => {
    setChon(p);
    setBaseUnit(p.base_unit || 'Cái');
    setForm({ name: '', ratio: '', price: '' });
  };

  const luuDonViGoc = async () => {
    try {
      await axios.put(`${API_BASE}/api/pricing/base-unit/${chon.id}`, { base_unit: baseUnit });
      await fetchAll();
      setChon({ ...chon, base_unit: baseUnit });
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi lưu đơn vị gốc'); }
  };

  const themDonVi = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Nhập tên đơn vị!');
    if (!(Number(form.ratio) > 0)) return alert('Tỷ lệ quy đổi phải lớn hơn 0!');
    try {
      await axios.post(`${API_BASE}/api/pricing/units`, {
        product_id: chon.id, name: form.name.trim(),
        ratio: Number(form.ratio), price: Number(form.price) || 0,
      });
      setForm({ name: '', ratio: '', price: '' });
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi thêm đơn vị'); }
  };

  const xoaDonVi = async (u) => {
    if (!window.confirm(`Xóa đơn vị "${u.name}"?`)) return;
    try { await axios.delete(`${API_BASE}/api/pricing/units/${u.id}`); fetchAll(); }
    catch { alert('Lỗi khi xóa'); }
  };

  const hienThi = products.filter((p) => !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col space-y-5">
      <div>
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
          <Scale className="w-7 h-7 text-cyan-600" /> Đơn Vị Tính & Quy Đổi
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Khai báo 1 Thùng = 24 Lon. Bán 1 thùng, hệ thống tự trừ 24 lon trong kho.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 flex-1 min-h-0">
        {/* Danh sách sản phẩm */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {loading ? <div className="py-10 text-center text-slate-400">Đang tải...</div>
              : hienThi.length === 0 ? <div className="py-10 text-center text-slate-400">Không có sản phẩm.</div>
              : hienThi.slice(0, 200).map((p) => {
                const dv = dvCua(p.id);
                return (
                  <button key={p.id} onClick={() => moSP(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-colors ${
                      chon && chon.id === p.id ? 'bg-cyan-50 border-2 border-cyan-400' : 'hover:bg-slate-50 border-2 border-transparent'
                    }`}>
                    <div className="font-bold text-slate-800 text-sm truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>Tồn {p.stock} {p.base_unit || 'Cái'}</span>
                      {dv.length > 0 && <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded font-bold">{dv.length} đơn vị</span>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Chi tiết đơn vị */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 overflow-auto">
          {!chon ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <Box className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-400 font-medium">Chọn một sản phẩm bên trái</p>
              <p className="text-slate-400 text-sm mt-1">để khai báo đơn vị quy đổi cho nó.</p>
            </div>
          ) : (
            <>
              <h3 className="text-lg font-bold text-slate-800">{chon.name}</h3>
              <p className="text-sm text-slate-500 mb-5">Tồn kho: {chon.stock} {chon.base_unit || 'Cái'}</p>

              {/* Đơn vị gốc */}
              <div className="bg-slate-50 rounded-xl p-4 mb-5">
                <label className="block text-sm font-bold text-slate-700 mb-1">Đơn vị gốc (đơn vị nhỏ nhất, dùng để tính tồn kho)</label>
                <div className="flex gap-2">
                  <input value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} placeholder="VD: Lon, Chai, Cái, Gói"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-500" />
                  <button onClick={luuDonViGoc} className="px-4 py-2 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-800 flex items-center gap-1.5">
                    <Save className="w-4 h-4" /> Lưu
                  </button>
                </div>
              </div>

              {/* Danh sách đơn vị quy đổi */}
              <h4 className="font-bold text-slate-700 mb-2">Đơn vị lớn hơn</h4>
              {dvCua(chon.id).length === 0 ? (
                <p className="text-sm text-slate-400 mb-4">Chưa khai báo đơn vị nào. Thêm ở dưới.</p>
              ) : (
                <div className="space-y-2 mb-5">
                  {dvCua(chon.id).map((u) => (
                    <div key={u.id} className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-2.5">
                      <div>
                        <span className="font-bold text-slate-800">1 {u.name}</span>
                        <span className="text-slate-500"> = {u.ratio} {chon.base_unit || 'Cái'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-cyan-700">{money(u.price)} đ</span>
                        <button onClick={() => xoaDonVi(u)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Thêm đơn vị */}
              <form onSubmit={themDonVi} className="border-t border-slate-100 pt-4">
                <h4 className="font-bold text-slate-700 mb-3">Thêm đơn vị quy đổi</h4>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Tên đơn vị</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Thùng"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">= bao nhiêu {chon.base_unit || 'Cái'}?</label>
                    <input type="number" min="1" value={form.ratio} onChange={(e) => setForm({ ...form, ratio: e.target.value })} placeholder="24"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-500 text-right" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Giá bán / đơn vị</label>
                    <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="380000"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-cyan-500 text-right" />
                  </div>
                </div>
                <button type="submit" className="w-full py-2.5 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" /> Thêm đơn vị
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
