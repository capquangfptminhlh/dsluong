import React, { useState, useEffect } from 'react';
import { Search, Printer, Barcode as BarcodeIcon } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { barcodeSVG, inTemMaVach } from '../utils/print';

export default function Barcode() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chon, setChon] = useState({}); // { [productId]: soTem }
  const [copies, setCopies] = useState(1);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/products`);
      setProducts(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const toggle = (p) => {
    setChon((prev) => {
      const n = { ...prev };
      if (n[p.id]) delete n[p.id]; else n[p.id] = true;
      return n;
    });
  };

  const daChon = products.filter((p) => chon[p.id]);
  const hienThi = products.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || '').includes(search));

  const inTem = () => {
    if (daChon.length === 0) return alert('Chọn ít nhất một sản phẩm để in tem!');
    const labels = daChon.map((p) => ({ name: p.name, price: p.price, code: p.sku || String(p.id) }));
    inTemMaVach(labels, { copies: Number(copies) || 1 });
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(n || 0);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <BarcodeIcon className="w-7 h-7 text-slate-700" /> In Tem Mã Vạch
          </h2>
          <p className="text-xs text-slate-500 mt-1">Chọn sản phẩm, đặt số tem rồi in ra giấy decal để dán lên hàng</p>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Số tem / sản phẩm</label>
            <input type="number" min="1" value={copies} onChange={(e) => setCopies(e.target.value)}
              className="w-28 px-3 py-2 border border-slate-200 rounded-lg text-right outline-none focus:border-blue-500" />
          </div>
          <button onClick={inTem} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-200 transition-colors">
            <Printer className="w-5 h-5" /> In {daChon.length > 0 ? `(${daChon.length})` : ''}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500" />
          </div>
          {daChon.length > 0 && (
            <button onClick={() => setChon({})} className="text-sm font-bold text-slate-500 hover:text-slate-700">Bỏ chọn hết</button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400">Đang tải...</div>
          ) : hienThi.length === 0 ? (
            <div className="py-16 text-center text-slate-400">Không có sản phẩm.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hienThi.map((p) => {
                const chose = !!chon[p.id];
                return (
                  <div key={p.id} onClick={() => toggle(p)}
                    className={`border rounded-xl p-3 cursor-pointer transition-all ${chose ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/40' : 'border-slate-200 hover:border-blue-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{p.name}</div>
                        <div className="text-xs text-slate-500">{money(p.price)} đ</div>
                      </div>
                      <input type="checkbox" readOnly checked={chose} className="w-4 h-4 accent-blue-600 mt-1" />
                    </div>
                    <div className="mt-2 bg-white rounded-lg p-2 flex justify-center overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: barcodeSVG(p.sku || String(p.id), { height: 34, narrow: 1.4, wide: 4.2 }) }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
