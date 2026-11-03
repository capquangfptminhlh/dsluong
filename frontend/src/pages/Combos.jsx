import React, { useState, useEffect } from 'react';
import { Boxes, Plus, Trash2, Search, X, TrendingUp } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Combos() {
  const [combos, setCombos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', price: '' });
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        axios.get(`${API_BASE}/api/pd/combos`),
        axios.get(`${API_BASE}/api/products`),
      ]);
      setCombos(c.data);
      setProducts(p.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

  const themDong = (pid) => {
    const p = products.find((x) => x.id === Number(pid));
    if (!p || lines.some((l) => l.product_id === p.id)) return;
    setLines([...lines, { product_id: p.id, name: p.name, quantity: 1, cost_price: p.cost_price || 0, stock: p.stock }]);
    setPick('');
  };
  const suaSL = (i, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, quantity: v } : l));
  const xoaDong = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const vonTam = lines.reduce((s, l) => s + (l.cost_price || 0) * (Number(l.quantity) || 0), 0);
  const laiTam = (Number(form.price) || 0) - vonTam;

  const moForm = () => { setForm({ name: '', sku: '', price: '' }); setLines([]); setShowForm(true); };

  const luu = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Nhập tên combo!');
    if (lines.length === 0) return alert('Thêm ít nhất một sản phẩm vào combo!');
    try {
      await axios.post(`${API_BASE}/api/pd/combos`, {
        name: form.name.trim(), sku: form.sku || null, price: Number(form.price) || 0,
        items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) || 1 })),
      });
      setShowForm(false);
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi tạo combo'); }
  };

  const xoa = async (c) => {
    if (!window.confirm(`Xóa combo "${c.name}"?`)) return;
    try { await axios.delete(`${API_BASE}/api/pd/combos/${c.id}`); fetchAll(); }
    catch { alert('Lỗi khi xóa'); }
  };

  const hienThi = combos.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Boxes className="w-7 h-7 text-fuchsia-600" /> Combo / Bán Theo Bộ
          </h2>
          <p className="text-xs text-slate-500 mt-1">Bán 1 combo, hệ thống tự trừ kho từng món bên trong</p>
        </div>
        <button onClick={moForm} className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 text-white text-xs font-bold rounded-lg hover:bg-fuchsia-700 shadow-md shadow-fuchsia-200">
          <Plus className="w-4 h-4" /> Tạo combo
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm combo..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-fuchsia-500" />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : hienThi.length === 0 ? (
              <div className="py-16 text-center">
                <Boxes className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">Chưa có combo nào.</p>
                <p className="text-slate-400 text-sm mt-1">VD: "Combo bàn phím + chuột" bán 450.000đ.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {hienThi.map((c) => (
                  <div key={c.id} className="border border-slate-200 rounded-2xl p-4 hover:border-fuchsia-300 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800">{c.name}</div>
                        {c.sku && <div className="text-xs text-slate-400 font-mono">{c.sku}</div>}
                      </div>
                      <button onClick={() => xoa(c)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"><Trash2 className="w-4 h-4" /></button>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-1">
                      {c.items.map((i) => (
                        <div key={i.id} className="flex justify-between text-sm">
                          <span className="text-slate-600">{i.product_name} <span className="text-slate-400">× {i.quantity}</span></span>
                          <span className="text-xs text-slate-400">tồn {i.stock}</span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[11px] text-slate-500">Giá bán</div>
                        <div className="font-bold text-slate-800">{money(c.price)}đ</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Giá vốn</div>
                        <div className="font-bold text-slate-600">{money(c.gia_von)}đ</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Lãi/bộ</div>
                        <div className={`font-black ${c.loi_nhuan >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{money(c.loi_nhuan)}đ</div>
                      </div>
                    </div>

                    <div className={`mt-3 text-center py-1.5 rounded-lg text-xs font-bold ${
                      c.ban_duoc > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {c.ban_duoc > 0 ? `Còn bán được ${c.ban_duoc} bộ` : 'Hết hàng — thiếu nguyên liệu'}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-slate-800">Tạo combo mới</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={luu} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Tên combo</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Combo bàn phím + chuột"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-fuchsia-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mã combo</label>
                  <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="CB-01"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-fuchsia-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Thêm sản phẩm vào combo</label>
                <select value={pick} onChange={(e) => themDong(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-fuchsia-500 bg-white">
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.filter((p) => !lines.some((l) => l.product_id === p.id)).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (tồn {p.stock})</option>
                  ))}
                </select>
              </div>

              {lines.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr><th className="py-2 px-3 text-left font-semibold">Sản phẩm</th><th className="py-2 px-3 text-right font-semibold w-24">SL/bộ</th><th className="w-10"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lines.map((l, i) => (
                        <tr key={l.product_id}>
                          <td className="py-2 px-3 font-semibold text-slate-700">{l.name}</td>
                          <td className="py-2 px-3">
                            <input type="number" min="1" value={l.quantity} onChange={(e) => suaSL(i, e.target.value)}
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-right outline-none focus:border-fuchsia-500" />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button type="button" onClick={() => xoaDong(i)} className="text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Giá bán combo</label>
                <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="450000"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-fuchsia-500 text-right font-bold" />
              </div>

              {lines.length > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 flex justify-between text-sm">
                  <span className="text-slate-500">Giá vốn {money(vonTam)}đ</span>
                  <span className={`font-bold flex items-center gap-1 ${laiTam >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <TrendingUp className="w-4 h-4" /> Lãi {money(laiTam)}đ
                  </span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-fuchsia-600 text-white rounded-xl font-bold hover:bg-fuchsia-700">Tạo combo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
