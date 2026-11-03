import React, { useState, useEffect } from 'react';
import { Store, Plus, Trash2, Star, ArrowRightLeft, Search, Download, X, MapPin, Phone } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel, tien } from '../utils/excel';

export default function Branches() {
  const [branches, setBranches] = useState([]);
  const [tongHop, setTongHop] = useState({ branches: [], products: [] });
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list'); // list | stock
  const [search, setSearch] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '' });

  const [showCK, setShowCK] = useState(false);
  const [ck, setCk] = useState({ from: '', to: '' });
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [b, th, p] = await Promise.all([
        axios.get(`${API_BASE}/api/branches`),
        axios.get(`${API_BASE}/api/branches/ton-kho/tong-hop`),
        axios.get(`${API_BASE}/api/products`),
      ]);
      setBranches(b.data); setTongHop(th.data); setProducts(p.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

  const them = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Nhập tên chi nhánh!');
    try {
      await axios.post(`${API_BASE}/api/branches`, form);
      setShowForm(false); setForm({ name: '', address: '', phone: '' });
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi tạo chi nhánh'); }
  };

  const xoa = async (b) => {
    if (!window.confirm(`Xóa chi nhánh "${b.name}"?`)) return;
    try { await axios.delete(`${API_BASE}/api/branches/${b.id}`); fetchAll(); }
    catch (err) { alert(err.response?.data?.error || 'Lỗi khi xóa'); }
  };

  const datMacDinh = async (b) => {
    try { await axios.post(`${API_BASE}/api/branches/${b.id}/mac-dinh`); fetchAll(); }
    catch { alert('Lỗi'); }
  };

  // --- Chuyển kho ---
  const moCK = () => {
    const md = branches.find((b) => b.is_default) || branches[0];
    setCk({ from: md ? String(md.id) : '', to: '' });
    setLines([]); setTransferring(false); setShowCK(true);
  };
  const themDong = (pid) => {
    const p = products.find((x) => x.id === Number(pid));
    if (!p || lines.some((l) => l.product_id === p.id)) return;
    setLines([...lines, { product_id: p.id, name: p.name, quantity: 1 }]);
    setPick('');
  };
  const tonTai = (pid, bid) => {
    const row = tongHop.products.find((p) => p.id === pid);
    return row ? (row.ton[bid] || 0) : 0;
  };
  const dongKhongHopLe = lines.find((l) => {
    const quantity = Number(l.quantity);
    const available = ck.from ? Number(tonTai(l.product_id, Number(ck.from))) : 0;
    return !Number.isFinite(quantity) || quantity <= 0 || quantity > available;
  });
  const coTheChuyen = Boolean(ck.from && ck.to && ck.from !== ck.to && lines.length > 0 && !dongKhongHopLe && !transferring);

  const chuyen = async () => {
    if (!ck.from || !ck.to) return alert('Chọn chi nhánh gửi và nhận!');
    if (ck.from === ck.to) return alert('Chi nhánh gửi và nhận phải khác nhau!');
    if (lines.length === 0) return alert('Chọn ít nhất một mặt hàng!');
    if (dongKhongHopLe) {
      const quantity = Number(dongKhongHopLe.quantity);
      const available = tonTai(dongKhongHopLe.product_id, Number(ck.from));
      if (!Number.isFinite(quantity) || quantity <= 0) return alert(`Số lượng của "${dongKhongHopLe.name}" phải lớn hơn 0.`);
      return alert(`"${dongKhongHopLe.name}" chỉ còn ${available} tại nơi gửi.`);
    }
    if (transferring) return;
    setTransferring(true);
    try {
      const res = await axios.post(`${API_BASE}/api/branches/chuyen-kho`, {
        from_branch_id: Number(ck.from), to_branch_id: Number(ck.to),
        items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
      });
      alert(`Đã chuyển kho ${res.data.code}: ${res.data.tu} → ${res.data.den}`);
      setShowCK(false); fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi chuyển kho'); }
    finally { setTransferring(false); }
  };

  const spHienThi = tongHop.products.filter((p) => !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase()));

  const xuat = () => xuatExcel(
    spHienThi,
    [
      { key: 'sku', label: 'Mã SKU' },
      { key: 'name', label: 'Tên sản phẩm' },
      ...tongHop.branches.map((b) => ({ key: 'ton', label: b.name, format: (v) => tien(v[b.id]) })),
      { key: 'stock', label: 'Tổng tồn', format: tien },
    ],
    'Ton-kho-chi-nhanh', 'Tồn kho'
  );

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Store className="w-7 h-7 text-blue-600" /> Chi Nhánh & Kho
          </h2>
          <p className="text-xs text-slate-500 mt-1">Mỗi chi nhánh có kho riêng. Bán ở đâu trừ kho ở đó.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={moCK} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-200 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-50">
            <ArrowRightLeft className="w-4 h-4" /> Chuyển kho
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-md shadow-blue-200">
            <Plus className="w-4 h-4" /> Thêm chi nhánh
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('list')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${tab === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Danh sách chi nhánh</button>
        <button onClick={() => setTab('stock')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${tab === 'stock' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Tồn kho theo chi nhánh</button>
      </div>

      {tab === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? <div className="py-16 text-center text-slate-400 col-span-full">Đang tải...</div>
            : branches.map((b) => (
              <div key={b.id} className={`bg-white rounded-2xl border-2 p-5 ${b.is_default ? 'border-blue-400' : 'border-slate-100'} shadow-sm`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <div className="font-black text-slate-800 flex items-center gap-2">
                      {b.name}
                      {b.is_default === 1 && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">MẶC ĐỊNH</span>}
                    </div>
                    {b.address && <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" />{b.address}</div>}
                    {b.phone && <div className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" />{b.phone}</div>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {!b.is_default && (
                      <button onClick={() => datMacDinh(b)} title="Đặt làm mặc định" className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg"><Star className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => xoa(b)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl py-3">
                  <div>
                    <div className="text-[11px] text-slate-500">Mặt hàng</div>
                    <div className="font-bold text-slate-800">{b.so_mat_hang}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Tổng tồn</div>
                    <div className="font-bold text-slate-800">{b.tong_ton}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Vốn đọng</div>
                    <div className="font-bold text-blue-700">{money(b.gia_tri_ton)}đ</div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500" />
            </div>
            <button onClick={xuat} className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                <tr>
                  <th className="py-3 px-4 font-semibold">Sản phẩm</th>
                  {tongHop.branches.map((b) => <th key={b.id} className="py-3 px-4 font-semibold text-right">{b.name}</th>)}
                  <th className="py-3 px-4 font-semibold text-right bg-slate-100">Tổng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spHienThi.slice(0, 300).map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-800">{p.name}</div>
                      <div className="text-xs text-slate-400 font-mono">{p.sku}</div>
                    </td>
                    {tongHop.branches.map((b) => (
                      <td key={b.id} className={`py-2.5 px-4 text-right font-semibold ${p.ton[b.id] > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                        {p.ton[b.id] || 0}
                      </td>
                    ))}
                    <td className="py-2.5 px-4 text-right font-black text-slate-800 bg-slate-50">{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thêm chi nhánh */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Thêm chi nhánh</h3>
            <form onSubmit={them} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tên chi nhánh</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Chi nhánh Quận 7"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Địa chỉ</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Số điện thoại</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">Tạo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chuyển kho */}
      {showCK && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => !transferring && setShowCK(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-slate-800">Chuyển kho giữa chi nhánh</h3>
              <button disabled={transferring} onClick={() => setShowCK(false)} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Chuyển từ</label>
                <select value={ck.from} disabled={transferring} onChange={(e) => {
                  const from = e.target.value;
                  setCk({ from, to: from === ck.to ? '' : ck.to });
                }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white disabled:bg-slate-50">
                  <option value="">-- Chọn --</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Chuyển đến</label>
                <select value={ck.to} disabled={transferring} onChange={(e) => setCk({ ...ck, to: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white disabled:bg-slate-50">
                  <option value="">-- Chọn --</option>
                  {branches.filter((b) => String(b.id) !== ck.from).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-bold text-slate-700 mb-1">Thêm mặt hàng</label>
              <select value={pick} disabled={transferring} onChange={(e) => themDong(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white disabled:bg-slate-50">
                <option value="">-- Chọn sản phẩm --</option>
                {products.filter((p) => !lines.some((l) => l.product_id === p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{ck.from ? ` (có ${tonTai(p.id, Number(ck.from))} tại nơi gửi)` : ''}</option>
                ))}
              </select>
            </div>

            {lines.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr><th className="py-2 px-3 text-left font-semibold">Sản phẩm</th><th className="py-2 px-3 text-right font-semibold w-28">Số lượng</th><th className="w-10"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l, i) => {
                      const co = ck.from ? tonTai(l.product_id, Number(ck.from)) : 0;
                      const quantity = Number(l.quantity);
                      const qua = !Number.isFinite(quantity) || quantity <= 0 || quantity > co;
                      return (
                        <tr key={l.product_id}>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-700">{l.name}</div>
                            <div className="text-xs text-slate-400">Nơi gửi đang có {co}</div>
                          </td>
                          <td className="py-2 px-3">
                            <input type="number" min="0" step="any" max={co} value={l.quantity} disabled={transferring}
                              onChange={(e) => setLines(lines.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                              className={`w-full px-2 py-1 border rounded-lg text-right outline-none disabled:bg-slate-50 ${qua ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`} />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button disabled={transferring} onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {dongKhongHopLe && (
              <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                Kiểm tra lại số lượng: phải lớn hơn 0 và không vượt tồn kho tại nơi gửi.
              </div>
            )}

            <div className="flex gap-2">
              <button disabled={transferring} onClick={() => setShowCK(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button disabled={!coTheChuyen} onClick={chuyen} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                {transferring ? 'Đang chuyển...' : 'Chuyển kho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}