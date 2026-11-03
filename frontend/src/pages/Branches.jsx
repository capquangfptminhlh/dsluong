import React, { useState, useEffect } from 'react';
import { 
  Store, Plus, Trash2, Star, ArrowRightLeft, Search, Download, X, 
  MapPin, Phone, Building2, CheckCircle2, ShieldCheck, Check, Package, DollarSign
} from 'lucide-react';
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

  const activeBranchId = localStorage.getItem('active_branch_id');

  useEffect(() => { 
    fetchAll(); 
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [b, th, p] = await Promise.all([
        axios.get(`${API_BASE}/api/branches`),
        axios.get(`${API_BASE}/api/branches/ton-kho/tong-hop`),
        axios.get(`${API_BASE}/api/products`),
      ]);
      setBranches(b.data || []);
      setTongHop(th.data || { branches: [], products: [] });
      setProducts(p.data || []);
    } catch (err) { 
      console.error('Lỗi tải dữ liệu chi nhánh:', err); 
    } finally { 
      setLoading(false); 
    }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

  const them = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('Vui lòng nhập tên chi nhánh / quầy thuốc!');
    try {
      await axios.post(`${API_BASE}/api/branches`, form);
      setShowForm(false);
      setForm({ name: '', address: '', phone: '' });
      fetchAll();
      window.dispatchEvent(new Event('branchesUpdated'));
    } catch (err) { 
      alert(err.response?.data?.error || 'Lỗi khi tạo quầy thuốc mới'); 
    }
  };

  const xoa = async (b) => {
    if (!window.confirm(`Xóa chi nhánh / quầy "${b.name}"?`)) return;
    try { 
      await axios.delete(`${API_BASE}/api/branches/${b.id}`); 
      fetchAll();
      window.dispatchEvent(new Event('branchesUpdated'));
    } catch (err) { 
      alert(err.response?.data?.error || 'Lỗi khi xóa chi nhánh'); 
    }
  };

  const datMacDinh = async (b) => {
    try { 
      await axios.post(`${API_BASE}/api/branches/${b.id}/mac-dinh`); 
      fetchAll();
      window.dispatchEvent(new Event('branchesUpdated'));
    } catch (err) { 
      alert('Không thể đặt làm cơ sở chính'); 
    }
  };

  const chonBanTaiQuay = (b) => {
    localStorage.setItem('active_branch_id', b.id);
    localStorage.setItem('active_branch_name', b.name);
    window.dispatchEvent(new CustomEvent('branchChanged', { detail: b }));
    alert(`Đã chuyển quầy bán sang: ${b.name}`);
  };

  // --- Chuyển kho ---
  const moCK = () => {
    const md = branches.find((b) => b.is_default) || branches[0];
    setCk({ from: md ? String(md.id) : '', to: '' });
    setLines([]); 
    setShowCK(true);
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

  const chuyen = async () => {
    if (!ck.from || !ck.to) return alert('Vui lòng chọn quầy xuất và quầy nhập!');
    if (ck.from === ck.to) return alert('Quầy xuất và quầy nhập phải khác nhau!');
    if (lines.length === 0) return alert('Vui lòng chọn ít nhất 1 loại thuốc cần điều chuyển!');
    try {
      const res = await axios.post(`${API_BASE}/api/branches/chuyen-kho`, {
        from_branch_id: Number(ck.from), 
        to_branch_id: Number(ck.to),
        items: lines.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
      });
      alert(`Đã tạo phiếu điều chuyển ${res.data.code}: ${res.data.tu} ➔ ${res.data.den}`);
      setShowCK(false); 
      fetchAll();
      window.dispatchEvent(new Event('branchesUpdated'));
    } catch (err) { 
      alert(err.response?.data?.error || 'Lỗi khi điều chuyển thuốc'); 
    }
  };

  const spHienThi = tongHop.products.filter((p) => !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase()));

  const xuat = () => xuatExcel(
    spHienThi,
    [
      { key: 'sku', label: 'Mã SKU' },
      { key: 'name', label: 'Tên Thuốc / Dược Phẩm' },
      ...tongHop.branches.map((b) => ({ key: 'ton', label: b.name, format: (v) => tien(v[b.id]) })),
      { key: 'stock', label: 'Tổng tồn hệ thống', format: tien },
    ],
    'Ton-kho-chuoi-nha-thuoc-nhan-duc', 'Tồn Kho Chuỗi GPP'
  );

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-3 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Chuỗi Nhà Thuốc & Quầy Thuốc Phụ</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">Tồn Kho Độc Lập</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Tạo các chi nhánh phụ từ cửa hàng chính. Mỗi quầy quản lý tồn kho và doanh số bán riêng biệt.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={moCK} 
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 rounded-xl transition-all text-xs font-bold"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600" /> Điều Chuyển Thuốc
          </button>
          <button 
            onClick={() => setShowForm(true)} 
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm shadow-emerald-600/30 transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm Quầy Thuốc Mới
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl w-fit">
        <button 
          onClick={() => setTab('list')} 
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'list' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Danh Sách Quầy Thuốc ({branches.length})
        </button>
        <button 
          onClick={() => setTab('stock')} 
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'stock' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Tồn Kho Ma Trận Theo Quầy
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400 col-span-full text-xs">Đang tải danh sách cơ sở...</div>
          ) : branches.map((b) => {
            const isCurrentlyActive = String(b.id) === String(activeBranchId);
            return (
              <div 
                key={b.id} 
                className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-all flex flex-col justify-between ${
                  isCurrentlyActive ? 'border-emerald-500 ring-2 ring-emerald-50' : b.is_default ? 'border-emerald-200' : 'border-slate-200/80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                        {b.name}
                        {b.is_default === 1 ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black tracking-wide">
                            CƠ SỞ CHÍNH
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                            CHI NHÁNH PHỤ
                          </span>
                        )}
                      </div>
                      {b.address && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" /> {b.address}
                        </div>
                      )}
                      {b.phone && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" /> {b.phone}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 ml-2">
                      {!b.is_default && (
                        <button 
                          onClick={() => datMacDinh(b)} 
                          title="Đặt làm cơ sở chính" 
                          className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      {!b.is_default && (
                        <button 
                          onClick={() => xoa(b)} 
                          title="Xóa chi nhánh"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chỉ số tồn kho riêng biệt của quầy */}
                  <div className="grid grid-cols-2 gap-2 my-4 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px]">Mặt hàng có tại quầy</div>
                      <div className="font-bold text-slate-800 text-sm mt-0.5">{b.so_mat_hang || 0} mục</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px]">Tổng số lượng tồn</div>
                      <div className="font-black text-emerald-700 text-sm mt-0.5">{b.tong_ton || 0} đv</div>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-slate-200/60 mt-1 flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Giá trị kho dược:</span>
                      <span className="font-bold text-slate-900 text-xs">{money(b.gia_tri_ton)} đ</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  {isCurrentlyActive ? (
                    <div className="w-full py-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" /> Đang chọn bán tại quầy này
                    </div>
                  ) : (
                    <button
                      onClick={() => chonBanTaiQuay(b)}
                      className="w-full py-2 bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700 rounded-xl text-xs font-bold transition-all shadow-xs"
                    >
                      Chọn Bán Tại Quầy Này
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tab Tồn kho ma trận */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[260px] flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder="Tìm tên thuốc, mã SKU..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 bg-white" 
              />
            </div>
            <button 
              onClick={xuat} 
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 border border-slate-200"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel Tồn Kho
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 uppercase font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tên Thuốc / Dược Phẩm</th>
                  <th className="py-3 px-4">Mã SKU</th>
                  {tongHop.branches.map((b) => (
                    <th key={b.id} className="py-3 px-4 text-right">
                      {b.name}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right font-black text-emerald-800 bg-emerald-50/50">Tổng Hệ Thống</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spHienThi.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{p.sku || '—'}</td>
                    {tongHop.branches.map((b) => {
                      const t = tonTai(p.id, b.id);
                      return (
                        <td key={b.id} className="py-3 px-4 text-right">
                          <span className={t > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}>{t}</span>
                        </td>
                      );
                    })}
                    <td className="py-3 px-4 text-right font-black text-emerald-700 bg-emerald-50/30">
                      {p.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Thêm Quầy Thuốc Mới */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">Thêm Quầy Thuốc / Chi Nhánh Phụ</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">Chi nhánh mới sẽ được cấp kho thuốc độc lập. Bạn có thể điều chuyển thuốc từ cơ sở chính sang quầy mới bất kỳ lúc nào.</p>
            
            <form onSubmit={them} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên Chi Nhánh / Quầy Thuốc *</label>
                <input 
                  value={form.name} 
                  onChange={(e) => setForm({ ...form, name: e.target.value })} 
                  placeholder="VD: Nhà Thuốc Nhân Đức - Chi Nhánh 2 (Quận 7)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" 
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Địa Chỉ Quầy Thuốc</label>
                <input 
                  value={form.address} 
                  onChange={(e) => setForm({ ...form, address: e.target.value })} 
                  placeholder="VD: 123 Nguyễn Thị Thập, P. Tân Quy, Quận 7, TP.HCM"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số Điện Thoại / Dược Sĩ Trực Quầy</label>
                <input 
                  value={form.phone} 
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} 
                  placeholder="VD: 0909.123.456 (DS. Minh)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50" 
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)} 
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm shadow-emerald-600/30 transition-all"
                >
                  Khởi Tạo Chi Nhánh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Điều Chuyển Thuốc Giữa Các Quầy (Chuyển Kho) */}
      {showCK && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCK(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Phiếu Điều Chuyển Thuốc Nội Bộ</h3>
                  <p className="text-[11px] text-slate-500">Xuất thuốc từ quầy gửi và tự động nhập vào quầy nhận</p>
                </div>
              </div>
              <button onClick={() => setShowCK(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Quầy Xuất (Nơi gửi)</label>
                  <select 
                    value={ck.from} 
                    onChange={(e) => setCk({ ...ck, from: e.target.value })}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="">-- Chọn quầy xuất --</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Quầy Nhập (Nơi nhận)</label>
                  <select 
                    value={ck.to} 
                    onChange={(e) => setCk({ ...ck, to: e.target.value })}
                    className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-xs bg-white outline-none focus:border-emerald-500 font-medium"
                  >
                    <option value="">-- Chọn quầy nhận --</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Chọn Thuốc Cần Điều Chuyển</label>
                <select 
                  value={pick} 
                  onChange={(e) => themDong(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-emerald-500"
                >
                  <option value="">-- Thêm mặt hàng thuốc vào phiếu --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Kho xuất hiện có: {tonTai(p.id, Number(ck.from))})
                    </option>
                  ))}
                </select>
              </div>

              {/* Danh sách thuốc đang chuyển */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-3">Tên Thuốc</th>
                      <th className="py-2.5 px-3 text-right">Số Lượng Chuyển</th>
                      <th className="py-2.5 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="py-6 text-center text-slate-400">Chưa có thuốc nào trong phiếu.</td>
                      </tr>
                    ) : lines.map((l, idx) => (
                      <tr key={l.product_id}>
                        <td className="py-2 px-3 font-medium text-slate-800">{l.name}</td>
                        <td className="py-2 px-3 text-right">
                          <input 
                            type="number" 
                            min="1" 
                            value={l.quantity} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setLines(lines.map((x, i) => i === idx ? { ...x, quantity: val } : x));
                            }}
                            className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-right font-bold text-xs outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button 
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button 
                type="button" 
                onClick={() => setShowCK(false)} 
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button 
                type="button" 
                onClick={chuyen}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm shadow-emerald-600/30"
              >
                Xác Nhận Điều Chuyển Kho
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
