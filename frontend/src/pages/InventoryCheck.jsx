import { useEffect, useMemo, useState } from 'react';
import { Camera, ClipboardCheck, PackageSearch, Save, Search, Trash2 } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { emitUiNotification } from '../utils/uiEvents';

function normalizeCode(value) {
  return String(value ?? '').trim().toLowerCase();
}

export default function InventoryCheck() {
  const [code, setCode] = useState(() => 'CHECK-' + Date.now().toString().slice(-5));
  const [checks, setChecks] = useState([]);
  const [products, setProducts] = useState([]);
  const [scanInput, setScanInput] = useState('');
  const [counted, setCounted] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [checkRes, productRes] = await Promise.all([
        axios.get(`${API_BASE}/api/inventory-adv/check`),
        axios.get(`${API_BASE}/api/products`),
      ]);
      setChecks(checkRes.data || []);
      setProducts(productRes.data || []);
    } catch (error) {
      emitUiNotification({ title: 'Không tải được kiểm kho', message: error.response?.data?.error || 'Vui lòng thử lại.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const findProduct = (rawCode) => {
    const normalized = normalizeCode(rawCode);
    return products.find((product) => [product.barcode, product.sku, product.id]
      .some((value) => normalizeCode(value) === normalized));
  };

  const addCode = (rawCode) => {
    const value = String(rawCode || '').trim();
    if (!value) return { ok: false, message: 'Hãy nhập hoặc quét một mã sản phẩm.' };
    const product = findProduct(value);
    if (!product) return { ok: false, message: `Không tìm thấy sản phẩm có mã ${value}.` };

    setCounted((current) => {
      const exists = current.find((item) => item.id === product.id);
      if (exists) {
        return current.map((item) => item.id === product.id ? { ...item, actual: Number(item.actual || 0) + 1 } : item);
      }
      return [...current, {
        id: product.id,
        name: product.name,
        sku: product.sku || '',
        barcode: product.barcode || '',
        systemStock: Number(product.stock || 0),
        actual: 1,
      }];
    });
    setScanInput('');
    return { ok: true, message: `Đã ghi nhận ${product.name}.` };
  };

  const submitCode = (event) => {
    event.preventDefault();
    const result = addCode(scanInput);
    if (!result.ok) emitUiNotification({ title: 'Không thêm được sản phẩm', message: result.message, type: 'warning' });
  };

  const totalDifference = useMemo(
    () => counted.reduce((sum, item) => sum + Number(item.actual || 0) - Number(item.systemStock || 0), 0),
    [counted],
  );

  const handleSave = async () => {
    if (!counted.length) {
      emitUiNotification({ title: 'Chưa có sản phẩm kiểm', message: 'Hãy quét hoặc nhập ít nhất một mã sản phẩm.', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/api/inventory-adv/check`, { code, total_difference: totalDifference });
      setCode('CHECK-' + Date.now().toString().slice(-5));
      setCounted([]);
      await fetchData();
    } catch (error) {
      emitUiNotification({ title: 'Không lưu được phiếu kiểm kho', message: error.response?.data?.error || 'Vui lòng thử lại.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 sm:gap-5">
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2 text-2xl font-black text-slate-900"><ClipboardCheck className="h-7 w-7 text-emerald-600" />Kiểm kho thực tế</h1>
          <p className="page-subtitle mt-1 text-sm text-slate-500">Quét từng sản phẩm, nhập số đếm thực tế và xem chênh lệch so với tồn hệ thống.</p>
        </div>
        <button type="button" onClick={handleSave} disabled={saving || !counted.length} className="btn-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><Save className="h-4 w-4" />{saving ? 'Đang lưu…' : 'Lưu phiếu kiểm kho'}</button>
      </div>

      <section className="surface rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
          <form onSubmit={submitCode}>
            <label htmlFor="inventory-scan-code" className="mb-1.5 block text-xs font-extrabold text-slate-700">Mã vạch / SKU sản phẩm</label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="inventory-scan-code" value={scanInput} onChange={(event) => setScanInput(event.target.value)} placeholder="Quét bằng máy USB hoặc nhập mã…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-base font-semibold outline-none focus:border-emerald-500" data-testid="inventory-check-code" />
              </div>
              <button type="submit" className="rounded-xl bg-slate-900 px-4 text-sm font-black text-white" data-testid="inventory-check-add">Thêm</button>
            </div>
          </form>
          <button type="button" onClick={() => setShowScanner(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white shadow-sm shadow-blue-600/20" data-testid="inventory-open-barcode-scanner"><Camera className="h-4 w-4" />Quét bằng camera</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1.5">Mã phiếu: <strong className="text-slate-800">{code}</strong></span>
          <span className={`rounded-full px-3 py-1.5 ${totalDifference === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>Tổng chênh lệch: <strong>{totalDifference > 0 ? '+' : ''}{totalDifference}</strong></span>
        </div>
      </section>

      <section className="surface rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="font-black text-slate-900">Sản phẩm đã kiểm</h2><p className="mt-0.5 text-xs text-slate-500">Quét cùng một mã nhiều lần sẽ tăng số đếm thực tế.</p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-600">{counted.length} sản phẩm</span>
        </div>
        {counted.length === 0 ? (
          <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
            <div><PackageSearch className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-bold text-slate-500">Chưa quét sản phẩm nào</p><p className="mt-1 text-xs text-slate-400">Dùng camera, máy quét USB hoặc nhập mã thủ công.</p></div>
          </div>
        ) : (
          <div className="space-y-2" data-testid="inventory-counted-list">
            {counted.map((item) => {
              const difference = Number(item.actual || 0) - Number(item.systemStock || 0);
              return (
                <div key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_42px] sm:items-center">
                  <div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{item.name}</div><div className="mt-0.5 text-xs font-mono text-slate-400">{item.barcode || item.sku || item.id}</div></div>
                  <div className="text-xs text-slate-500">Tồn hệ thống<strong className="mt-1 block text-base text-slate-800">{item.systemStock}</strong></div>
                  <label className="text-xs text-slate-500">Đếm thực tế<input type="number" min="0" value={item.actual} onChange={(event) => setCounted((current) => current.map((row) => row.id === item.id ? { ...row, actual: Math.max(0, Number(event.target.value || 0)) } : row))} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-base font-black text-slate-800 outline-none focus:border-emerald-500" /></label>
                  <button type="button" onClick={() => setCounted((current) => current.filter((row) => row.id !== item.id))} className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-600" aria-label={`Xóa ${item.name}`}><Trash2 className="h-4 w-4" /></button>
                  <div className="sm:col-span-4 text-right text-xs font-bold"><span className={difference === 0 ? 'text-emerald-600' : difference > 0 ? 'text-blue-600' : 'text-rose-600'}>Chênh lệch: {difference > 0 ? '+' : ''}{difference}</span></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="surface rounded-2xl border border-slate-200 bg-white p-3 sm:p-5">
        <h2 className="font-black text-slate-900">Lịch sử kiểm kho</h2>
        <div className="table-shell mt-3 overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2.5">Mã phiếu</th><th className="px-3 py-2.5">Chênh lệch</th><th className="px-3 py-2.5">Ngày tạo</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="3" className="px-3 py-6 text-center text-slate-400">Đang tải…</td></tr> : checks.length === 0 ? <tr><td colSpan="3" className="px-3 py-6 text-center text-slate-400">Chưa có lịch sử</td></tr> : checks.map((item) => <tr key={item.id}><td className="px-3 py-3 font-bold text-slate-800">{item.code}</td><td className="px-3 py-3 font-bold text-slate-700">{Number(item.total_difference || 0) > 0 ? '+' : ''}{item.total_difference || 0}</td><td className="px-3 py-3 text-slate-500">{new Date(item.createdAt).toLocaleString('vi-VN')}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <BarcodeScannerModal open={showScanner} onClose={() => setShowScanner(false)} onDetected={addCode} title="Quét sản phẩm kiểm kho" />
    </div>
  );
}
