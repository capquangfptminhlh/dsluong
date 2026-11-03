import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Search, Tags } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

const CATEGORIES = [
  ['1.1', 'Phân phối, cung cấp hàng hóa'],
  ['1.2', 'Dịch vụ, xây dựng không bao thầu'],
  ['1.3', 'Cho thuê tài sản'],
  ['1.4', 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa'],
  ['1.5', 'Nội dung thông tin số'],
  ['1.6', 'Hoạt động kinh doanh khác'],
];
const PAGE_SIZE = 12;
const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} ₫`;

export default function MappingStep({ products = [], setProducts, excelData = [], onExport }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [bulkCategory, setBulkCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const revenueByGroup = useMemo(() => {
    const map = {};
    excelData.forEach((row) => {
      const key = row.groupName || 'Không xác định';
      if (!map[key]) map[key] = { revenue: 0, rows: 0 };
      map[key].revenue += Number(row.normalizedRevenue) || 0;
      map[key].rows += 1;
    });
    return map;
  }, [excelData]);

  const rows = useMemo(() => products.map((item) => ({
    ...item,
    revenue: revenueByGroup[item.groupName]?.revenue ?? (Number(item.totalRevenue) || 0),
    rowCount: revenueByGroup[item.groupName]?.rows ?? (Number(item.itemCount) || 0),
  })), [products, revenueByGroup]);

  const filtered = useMemo(() => rows.filter((item) => {
    const matchesSearch = String(item.groupName || '').toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = status === 'all' || (status === 'mapped' ? Boolean(item.category) : !item.category);
    return matchesSearch && matchesStatus;
  }), [rows, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const mapped = rows.filter((item) => item.category).length;
  const completeness = rows.length ? Math.round((mapped / rows.length) * 100) : 0;

  const persistOne = async (groupName, category) => {
    setError('');
    setProducts(products.map((item) => item.groupName === groupName ? { ...item, category } : item));
    try {
      await axios.post(`${API_BASE}/api/mappings`, { keyword: groupName, category });
    } catch {
      setError('Không lưu được phân loại. Dữ liệu trên màn hình đã được giữ để bạn thử lại.');
    }
  };

  const applyBulk = async () => {
    if (!selected.length || !bulkCategory) return;
    setSaving(true);
    setError('');
    const mappings = selected.map((groupName) => ({ keyword: groupName, category: bulkCategory }));
    setProducts(products.map((item) => selected.includes(item.groupName) ? { ...item, category: bulkCategory } : item));
    try {
      await axios.post(`${API_BASE}/api/mappings/bulk`, { mappings });
      setSelected([]);
      setBulkCategory('');
    } catch {
      setError('Không lưu được phân loại hàng loạt. Hãy kiểm tra kết nối rồi thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = (checked) => {
    if (!checked) return setSelected(selected.filter((name) => !visible.some((item) => item.groupName === name)));
    setSelected([...new Set([...selected, ...visible.map((item) => item.groupName)])]);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-xl font-extrabold text-slate-950">Phân loại nhóm hoạt động</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            AutoTax không tự gán nhóm thuế bằng từ khóa. Bạn xác nhận từng nhóm hoặc áp dụng hàng loạt khi chắc chắn cùng bản chất hoạt động.
          </p>
        </div>
        <div className={`status-pill ${completeness === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {completeness === 100 ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          Hoàn thành {completeness}%
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="metric-card"><div className="metric-label">Nhóm dữ liệu</div><div className="metric-value">{rows.length}</div><div className="mt-2 text-xs text-slate-400">Từ file vừa tải</div></div>
        <div className="metric-card"><div className="metric-label">Đã phân loại</div><div className="metric-value">{mapped}</div><div className="mt-2 text-xs text-slate-400">Cần review trước tính thuế</div></div>
        <div className="metric-card"><div className="metric-label">Chưa phân loại</div><div className="metric-value">{Math.max(0, rows.length - mapped)}</div><div className="mt-2 text-xs text-slate-400">Không được tự động đoán</div></div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm nhóm sản phẩm / dịch vụ…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
            <option value="all">Tất cả trạng thái</option><option value="mapped">Đã phân loại</option><option value="unmapped">Chưa phân loại</option>
          </select>
          <div className="flex flex-wrap gap-2">
            <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
              <option value="">Chọn nhóm cho {selected.length} mục</option>
              {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{id} · {label}</option>)}
            </select>
            <button type="button" className="btn-secondary" disabled={!selected.length || !bulkCategory || saving} onClick={applyBulk}><Tags className="h-4 w-4" />Áp dụng</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left"><input type="checkbox" checked={visible.length > 0 && visible.every((item) => selected.includes(item.groupName))} onChange={(event) => toggleVisible(event.target.checked)} /></th>
                <th className="px-4 py-3 text-left">Nhóm dữ liệu</th><th className="px-4 py-3 text-right">Dòng</th><th className="px-4 py-3 text-right">Doanh thu</th><th className="px-4 py-3 text-left">Phân loại đã xác nhận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => (
                <tr key={item.groupName} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.includes(item.groupName)} onChange={() => setSelected(selected.includes(item.groupName) ? selected.filter((name) => name !== item.groupName) : [...selected, item.groupName])} /></td>
                  <td className="px-4 py-3"><div className="text-sm font-bold text-slate-800">{item.groupName || 'Không xác định'}</div><div className="mt-0.5 max-w-[360px] truncate text-[11px] text-slate-400">{Array.isArray(item.sampleNames) ? item.sampleNames.slice(0, 3).join(', ') : '—'}</div></td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-slate-600">{item.rowCount}</td>
                  <td className="px-4 py-3 text-right text-sm font-extrabold text-slate-900">{money(item.revenue)}</td>
                  <td className="px-4 py-3"><select value={item.category || ''} onChange={(event) => persistOne(item.groupName, event.target.value)} className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold ${item.category ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}><option value="">Chưa phân loại</option>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{id} · {label}</option>)}</select></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan="5" className="px-4 py-12 text-center text-sm text-slate-400">Không có nhóm dữ liệu phù hợp bộ lọc.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-400">Trang {safePage}/{totalPages} · {filtered.length} nhóm</div>
          <div className="flex items-center gap-2">
            <button type="button" className="icon-btn border border-slate-200" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" className="icon-btn border border-slate-200" disabled={safePage >= totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))}><ChevronRight className="h-4 w-4" /></button>
            <button type="button" className="btn-primary ml-2" disabled={!rows.length} onClick={onExport}>Kiểm tra kết quả</button>
          </div>
        </div>
      </div>
    </div>
  );
}
