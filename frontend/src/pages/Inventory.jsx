import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Warehouse, Search, PackageOpen, ArrowDownToLine, ArrowUpFromLine, Clock, AlertTriangle, TrendingUp, X, Filter } from 'lucide-react';
import API_BASE from '../config/api';

const numberFormat = new Intl.NumberFormat('vi-VN');
const compactFormat = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState('IN'); // 'IN' or 'OUT'
  const [form, setForm] = useState({ product_id: '', quantity: '', note: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [resProd, resLog] = await Promise.all([
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/inventory/logs`)
      ]);
      setProducts(resProd.data);
      setLogs(resLog.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const submitAction = async (e) => {
    e.preventDefault();
    if (!form.product_id) return alert('Vui lòng chọn sản phẩm!');

    // Backend /api/inventory/import is the authoritative stock-movement endpoint:
    // positive quantity = nhập kho, negative quantity = xuất kho.
    const qty = actionType === 'IN' ? Number(form.quantity) : -Number(form.quantity);

    try {
      await axios.post(`${API_BASE}/api/inventory/import`, {
        product_id: form.product_id,
        quantity: qty,
        note: form.note || (actionType === 'IN' ? 'Nhập kho' : 'Xuất kho')
      });
      setShowModal(false);
      setForm({ product_id: '', quantity: '', note: '' });
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Lỗi xử lý kho!');
    }
  };

  const openModal = (type) => {
    setActionType(type);
    setForm({ product_id: '', quantity: '', note: '' });
    setShowModal(true);
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || String(p.sku || '').toLowerCase().includes(search.toLowerCase());
    const stock = Number(p.stock) || 0;
    const matchesStock = stockFilter === 'all'
      || (stockFilter === 'out' && stock <= 0)
      || (stockFilter === 'low' && stock > 0 && stock <= 5)
      || (stockFilter === 'ok' && stock > 5);
    return matchesSearch && matchesStock;
  });

  // Stats
  const totalStock = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  const totalValue = products.reduce((sum, p) => sum + ((Number(p.stock) || 0) * (Number(p.cost_price || p.price) || 0)), 0);
  const lowStockCount = products.filter((p) => (Number(p.stock) || 0) <= 5).length;

  const getStockMeta = (stockValue) => {
    const stock = Number(stockValue) || 0;
    if (stock <= 0) return { label: 'Hết hàng', className: 'bg-red-100 text-red-700' };
    if (stock <= 5) return { label: 'Sắp hết', className: 'bg-yellow-100 text-yellow-700' };
    return { label: 'Còn hàng', className: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      {/* Desktop page header. Mobile already has the app-shell title, so avoid a duplicate header. */}
      <div className="hidden md:flex p-8 border-b border-slate-200 bg-white flex-row justify-between items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Warehouse className="w-8 h-8 text-blue-600" /> Quản lý Kho bãi
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Kiểm soát tồn kho, lập phiếu nhập xuất và theo dõi giá trị kho.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => openModal('OUT')}
            className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
          >
            <ArrowUpFromLine className="w-5 h-5" /> Xuất Kho
          </button>
          <button
            onClick={() => openModal('IN')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all hover:-translate-y-0.5"
          >
            <ArrowDownToLine className="w-5 h-5" /> Nhập Kho
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+7rem)] sm:p-5 sm:pb-[calc(env(safe-area-inset-bottom)+7rem)] md:p-8 md:pb-8 space-y-3 md:space-y-6">
        {/* KPI Cards: compact 3-up layout on mobile, full cards on desktop. */}
        <div className="grid grid-cols-3 gap-2 md:gap-6">
          <div className="bg-white p-3 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
            <div className="w-9 h-9 md:w-14 md:h-14 rounded-xl md:rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <PackageOpen className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <div className="min-w-0">
              <div className="text-slate-500 font-bold uppercase tracking-wide text-[10px] md:text-xs mb-0.5 md:mb-1">
                <span className="md:hidden">Tồn kho</span><span className="hidden md:inline">Tổng Tồn Kho</span>
              </div>
              <div className="text-lg md:text-2xl font-black text-slate-800 truncate" title={`${numberFormat.format(totalStock)} sp`}>
                <span className="md:hidden">{compactFormat.format(totalStock)}</span><span className="hidden md:inline">{numberFormat.format(totalStock)}</span>{' '}
                <span className="text-[10px] md:text-sm font-semibold text-slate-500">sp</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
            <div className="w-9 h-9 md:w-14 md:h-14 rounded-xl md:rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
              <TrendingUp className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <div className="min-w-0">
              <div className="text-slate-500 font-bold uppercase tracking-wide text-[10px] md:text-xs mb-0.5 md:mb-1">
                <span className="md:hidden">Giá trị</span><span className="hidden md:inline">Tổng Giá Trị Kho</span>
              </div>
              <div className="text-lg md:text-2xl font-black text-slate-800 truncate" title={`${numberFormat.format(totalValue)} ₫`}>
                <span className="md:hidden">{compactFormat.format(totalValue)}</span><span className="hidden md:inline">{numberFormat.format(totalValue)}</span>{' '}
                <span className="text-[10px] md:text-sm font-semibold text-slate-500">₫</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
            className="text-left bg-white p-3 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0 hover:border-red-300 transition-colors"
            aria-pressed={stockFilter === 'low'}
          >
            <div className="w-9 h-9 md:w-14 md:h-14 rounded-xl md:rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
              <AlertTriangle className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <div className="min-w-0">
              <div className="text-slate-500 font-bold uppercase tracking-wide text-[10px] md:text-xs mb-0.5 md:mb-1">
                <span className="md:hidden">Sắp hết</span><span className="hidden md:inline">Sắp Hết Hàng</span>
              </div>
              <div className="text-lg md:text-2xl font-black text-red-600 truncate" title={`${numberFormat.format(lowStockCount)} mã cần nhập`}>
                <span className="md:hidden">{compactFormat.format(lowStockCount)}</span><span className="hidden md:inline">{numberFormat.format(lowStockCount)}</span>{' '}
                <span className="text-[10px] md:text-sm font-semibold text-slate-500">mã</span>
              </div>
            </div>
          </button>
        </div>

        {/* Primary stock actions remain visible on mobile without taking header space. */}
        <div className="grid grid-cols-2 gap-2 md:hidden">
          <button
            onClick={() => openModal('OUT')}
            className="py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 shadow-sm"
          >
            <ArrowUpFromLine className="w-5 h-5" /> Xuất kho
          </button>
          <button
            onClick={() => openModal('IN')}
            className="py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-blue-600 text-white shadow-sm"
          >
            <ArrowDownToLine className="w-5 h-5" /> Nhập kho
          </button>
        </div>

        {/* Main Grid: Products vs History */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 md:gap-6">
          {/* Left: Products */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden md:h-[600px]">
            <div className="p-3 md:p-4 border-b border-slate-200 flex flex-col sm:flex-row gap-2 md:gap-4 sm:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên hoặc SKU..."
                  className="w-full pl-11 pr-4 py-3 md:py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 outline-none transition-all font-medium text-slate-700"
                />
              </div>
              <div className="relative w-full sm:w-auto sm:min-w-48">
                <Filter className="w-4 h-4 absolute left-3 top-3.5 md:top-3 text-slate-400 pointer-events-none" />
                <select
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  aria-label="Lọc theo trạng thái tồn kho"
                  className="w-full pl-9 pr-8 py-3 md:py-2.5 bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 outline-none focus:border-blue-500"
                >
                  <option value="all">Tất cả tồn kho</option>
                  <option value="out">Hết hàng</option>
                  <option value="low">Sắp hết</option>
                  <option value="ok">Còn hàng</option>
                </select>
              </div>
            </div>

            {/* Mobile product cards: readable without horizontal scrolling. */}
            <div className="md:hidden max-h-[62vh] overflow-y-auto bg-slate-50/50 divide-y divide-slate-200">
              {loading ? (
                <div className="text-center py-12 text-slate-500 font-medium">Đang tải dữ liệu...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">Không tìm thấy sản phẩm.</div>
              ) : (
                filteredProducts.map((p) => {
                  const stockMeta = getStockMeta(p.stock);
                  const unitCost = Number(p.cost_price || p.price) || 0;
                  return (
                    <div key={p.id} className="p-4 bg-white">
                      <div className="font-bold text-slate-800 text-[15px] leading-5 break-words">{p.name}</div>
                      <div className="font-mono text-slate-500 text-xs mt-1 break-all">{p.sku || 'Chưa có SKU'}</div>
                      <div className="grid grid-cols-[0.75fr_1.2fr_auto] gap-3 items-end mt-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase font-black tracking-wide text-slate-400">Tồn</div>
                          <div className="text-lg font-black text-slate-800 truncate">{numberFormat.format(Number(p.stock) || 0)}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase font-black tracking-wide text-slate-400">Giá vốn</div>
                          <div className="text-sm font-bold text-slate-600 truncate" title={`${numberFormat.format(unitCost)} ₫`}>{numberFormat.format(unitCost)} ₫</div>
                        </div>
                        <span className={`inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${stockMeta.className}`}>
                          {stockMeta.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop product table */}
            <div className="hidden md:block flex-1 overflow-auto bg-slate-50/50">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 text-slate-500 text-[11px] uppercase font-black sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-6 py-4">Sản Phẩm & SKU</th>
                    <th className="px-6 py-4 text-center">Tồn Kho</th>
                    <th className="px-6 py-4 text-right">Giá Vốn</th>
                    <th className="px-6 py-4 text-center">Trạng Thái</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {loading ? (
                    <tr><td colSpan="4" className="text-center py-12 text-slate-500 font-medium">Đang tải dữ liệu...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan="4" className="text-center py-12 text-slate-500">Không tìm thấy sản phẩm.</td></tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const stockMeta = getStockMeta(p.stock);
                      return (
                        <tr key={p.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800">{p.name}</div>
                            <div className="font-mono text-slate-500 text-xs mt-0.5">{p.sku}</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="font-black text-slate-800 text-lg">{numberFormat.format(Number(p.stock) || 0)}</div>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-600">
                            {numberFormat.format(Number(p.cost_price || p.price) || 0)} ₫
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${stockMeta.className}`}>
                              {stockMeta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: History Log */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col max-h-[460px] md:h-[600px] md:max-h-none overflow-hidden">
            <div className="p-4 md:p-5 border-b border-slate-200 bg-slate-800 text-white flex items-center justify-between">
              <h3 className="font-black flex items-center gap-2"><Clock className="w-5 h-5 text-blue-400" /> Sổ Kho & Lịch Sử</h3>
            </div>
            <div className="flex-1 overflow-auto p-4 md:p-5 space-y-4 md:space-y-5 bg-slate-50">
              {logs.length === 0 ? (
                <div className="text-center text-slate-400 py-10 flex flex-col items-center">
                  <Warehouse className="w-12 h-12 opacity-20 mb-3" />
                  <p className="font-medium">Chưa có giao dịch kho nào.</p>
                </div>
              ) : (
                logs.map((log, idx) => {
                  const isImport = log.quantity > 0 || log.type === 'IN';
                  const absQty = Math.abs(log.quantity);

                  return (
                    <div key={idx} className="relative pl-5 border-l-2 border-slate-200">
                      <div className={`absolute w-3.5 h-3.5 rounded-full -left-[9px] top-1 ring-4 ring-slate-50 ${isImport ? 'bg-blue-500' : 'bg-orange-500'}`}></div>
                      <div className="text-xs font-bold text-slate-400 mb-1.5">{new Date(log.createdAt).toLocaleString('vi-VN')}</div>
                      <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2">
                          <div className={`font-black text-sm uppercase tracking-wide flex items-center gap-1 ${isImport ? 'text-blue-700' : 'text-orange-700'}`}>
                            {isImport ? <ArrowDownToLine className="w-4 h-4"/> : <ArrowUpFromLine className="w-4 h-4"/>}
                            {isImport ? 'Phiếu Nhập' : 'Phiếu Xuất'}
                          </div>
                          <div className={`font-black text-lg ${isImport ? 'text-blue-600' : 'text-orange-600'}`}>
                            {isImport ? '+' : '-'}{absQty}
                          </div>
                        </div>
                        <div className="font-bold text-slate-700 text-sm mb-1">{log.product_name || 'Sản phẩm ID: ' + log.product_id}</div>
                        {log.note && <div className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg mt-2">&quot;{log.note}&quot;</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Modal (Import/Export) */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-6 py-5 flex justify-between items-center text-white ${actionType === 'IN' ? 'bg-blue-600' : 'bg-slate-800'}`}>
              <h2 className="text-xl font-black flex items-center gap-2">
                {actionType === 'IN' ? <ArrowDownToLine className="w-6 h-6"/> : <ArrowUpFromLine className="w-6 h-6"/>}
                Tạo Phiếu {actionType === 'IN' ? 'Nhập' : 'Xuất'} Kho
              </h2>
              <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitAction} className="p-6 space-y-5 bg-slate-50">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Chọn mặt hàng <span className="text-red-500">*</span></label>
                <select
                  required
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
                >
                  <option value="">-- Chọn Sản Phẩm --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.sku} - {p.name} (Tồn: {p.stock})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Số lượng {actionType === 'IN' ? 'nhập' : 'xuất'} <span className="text-red-500">*</span></label>
                <input
                  required
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className={`w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 font-black text-xl transition-all ${actionType === 'IN' ? 'focus:ring-blue-500/20 focus:border-blue-500 text-blue-600' : 'focus:ring-slate-800/20 focus:border-slate-800 text-slate-800'}`}
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Ghi chú (Lý do / NCC)</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition-all"
                  placeholder={actionType === 'IN' ? 'VD: Nhập hàng từ nhà cung cấp A...' : 'VD: Xuất kho chuyển đi chi nhánh 2...'}
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors">Hủy Bỏ</button>
                <button type="submit" className={`flex-1 py-3 text-white font-black rounded-xl shadow-lg transition-all hover:-translate-y-0.5 ${actionType === 'IN' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30' : 'bg-slate-800 hover:bg-slate-900 shadow-slate-800/30'}`}>
                  Xác Nhận {actionType === 'IN' ? 'Nhập Kho' : 'Xuất Kho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
