import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, Search, Save, Download } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel, tien } from '../utils/excel';

export default function ProductPricing() {
  const [levels, setLevels] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sua, setSua] = useState({}); // { "productId_levelId": giá đang gõ }
  const [dangLuu, setDangLuu] = useState(false);
  const [tenMuc, setTenMuc] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/pricing/matrix`);
      setLevels(res.data.levels);
      setProducts(res.data.products);
      setSua({});
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const themMuc = async () => {
    if (!tenMuc.trim()) return alert('Nhập tên mức giá!');
    try {
      await axios.post(`${API_BASE}/api/pricing/levels`, { name: tenMuc.trim() });
      setTenMuc('');
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi thêm mức giá'); }
  };

  const xoaMuc = async (lv) => {
    if (!window.confirm(`Xóa mức giá "${lv.name}"? Giá đã đặt theo mức này sẽ mất.`)) return;
    try { await axios.delete(`${API_BASE}/api/pricing/levels/${lv.id}`); fetchAll(); }
    catch (err) { alert(err.response?.data?.error || 'Lỗi khi xóa'); }
  };

  const luuTatCa = async () => {
    const ds = Object.entries(sua);
    if (ds.length === 0) return alert('Chưa sửa giá nào.');
    setDangLuu(true);
    try {
      for (const [key, gia] of ds) {
        const [pid, lid] = key.split('_');
        await axios.post(`${API_BASE}/api/pricing/matrix`, {
          product_id: Number(pid), level_id: Number(lid), price: Number(gia) || 0,
        });
      }
      alert(`Đã lưu ${ds.length} mức giá.`);
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi lưu'); }
    finally { setDangLuu(false); }
  };

  const hienThi = products.filter((p) => !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase()));

  const xuat = () => xuatExcel(
    hienThi,
    [
      { key: 'sku', label: 'Mã SKU' },
      { key: 'name', label: 'Tên sản phẩm' },
      ...levels.map((lv) => ({ key: 'prices', label: lv.name, format: (v) => tien(v[lv.id]) })),
    ],
    'Bang-gia', 'Bảng giá'
  );

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Tag className="w-7 h-7 text-violet-600" /> Bảng Giá Nhiều Mức
          </h2>
          <p className="text-xs text-slate-500 mt-1">Đặt giá lẻ / sỉ / VIP cho từng mặt hàng. Gán mức giá cho khách ở trang Khách hàng — POS sẽ tự lấy đúng giá.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={xuat} className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </button>
          <button onClick={luuTatCa} disabled={dangLuu || Object.keys(sua).length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 disabled:opacity-40">
            <Save className="w-4 h-4" /> Lưu {Object.keys(sua).length > 0 ? `(${Object.keys(sua).length})` : ''}
          </button>
        </div>
      </div>

      {/* Quản lý mức giá */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-slate-700 mr-1">Mức giá:</span>
          {levels.map((lv) => (
            <span key={lv.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold ${
              lv.is_default ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
            }`}>
              {lv.name}
              {lv.is_default ? <span className="text-[10px] font-bold">(mặc định)</span> : (
                <button onClick={() => xoaMuc(lv)} className="hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
              )}
            </span>
          ))}
          <div className="flex gap-1 ml-2">
            <input value={tenMuc} onChange={(e) => setTenMuc(e.target.value)} placeholder="Tên mức giá mới..."
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-500 w-44" />
            <button onClick={themMuc} className="px-2.5 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Bảng giá */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-violet-500" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : hienThi.length === 0 ? <div className="py-16 text-center text-slate-400">Không có sản phẩm.</div>
            : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Sản phẩm</th>
                    {levels.map((lv) => (
                      <th key={lv.id} className="py-3 px-4 font-semibold text-right w-36">{lv.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hienThi.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4">
                        <div className="font-bold text-slate-800">{p.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{p.sku}</div>
                      </td>
                      {levels.map((lv) => {
                        const key = `${p.id}_${lv.id}`;
                        const val = sua[key] !== undefined ? sua[key] : p.prices[lv.id];
                        const daSua = sua[key] !== undefined;
                        return (
                          <td key={lv.id} className="py-2 px-4">
                            <input type="number" min="0" value={val}
                              onChange={(e) => setSua({ ...sua, [key]: e.target.value })}
                              className={`w-full px-2 py-1.5 border rounded-lg text-right font-semibold outline-none ${
                                daSua ? 'border-violet-400 bg-violet-50' : 'border-slate-200'
                              } focus:border-violet-500`} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
