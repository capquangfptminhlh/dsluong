import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Plus, AlertTriangle, Trash2, Search, Download, PackageX, Warehouse } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel, tien } from '../utils/excel';

const emptyForm = { product_id: '', branch_id: '', batch_code: '', expiry_date: '', quantity: '', cost_price: '', note: '' };

export default function Batches() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [canhBao, setCanhBao] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [loc, setLoc] = useState('all'); // all | het_han | sap_het
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [assignBatch, setAssignBatch] = useState(null);
  const [assignBranchId, setAssignBranchId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const defaultBranchId = (list = branches) => {
    const active = list.filter((b) => (b.status || 'active') === 'active');
    return String((active.find((b) => Number(b.is_default) === 1) || active[0])?.id || '');
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [b, p, br, cb] = await Promise.all([
        axios.get(`${API_BASE}/api/batches`),
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/branches`),
        axios.get(`${API_BASE}/api/batches/canh-bao`).catch(() => ({ data: null })),
      ]);
      setRows(b.data);
      setProducts(p.data);
      setBranches(br.data);
      setCanhBao(cb.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

  const openCreate = () => {
    setForm({ ...emptyForm, branch_id: defaultBranchId() });
    setShowForm(true);
  };

  const them = async (e) => {
    e.preventDefault();
    if (!form.product_id) return alert('Chọn sản phẩm!');
    if (!form.branch_id) return alert('Chọn chi nhánh/kho nhận lô!');
    const quantity = Number(form.quantity);
    const costPrice = Number(form.cost_price || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) return alert('Số lượng phải là số hợp lệ lớn hơn 0!');
    if (!Number.isFinite(costPrice) || costPrice < 0) return alert('Giá vốn không hợp lệ!');
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/batches`, {
        ...form,
        product_id: Number(form.product_id),
        branch_id: Number(form.branch_id),
        quantity,
        cost_price: costPrice,
      });
      setShowForm(false);
      setForm(emptyForm);
      await fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi thêm lô'); }
    finally { setSubmitting(false); }
  };

  const huy = async (b) => {
    const ly = window.prompt(`Hủy lô "${b.batch_code || b.id}" (${b.quantity} ${b.product_name})?\nNhập lý do:`, 'Hết hạn sử dụng');
    if (ly === null) return;
    try {
      const res = await axios.post(`${API_BASE}/api/batches/${b.id}/huy`, { reason: ly });
      alert(`Đã hủy ${res.data.da_huy} sản phẩm khỏi kho.`);
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi hủy lô'); }
  };

  const openAssign = (batch) => {
    setAssignBatch(batch);
    setAssignBranchId(defaultBranchId());
  };

  const ganChiNhanh = async (e) => {
    e.preventDefault();
    if (!assignBatch || !assignBranchId) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/api/batches/${assignBatch.id}/assign-branch`, { branch_id: Number(assignBranchId) });
      setAssignBatch(null);
      setAssignBranchId('');
      await fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Không thể gán chi nhánh cho lô'); }
    finally { setSubmitting(false); }
  };

  const hienThi = useMemo(() => rows.filter((b) => {
    if (loc === 'het_han' && !b.het_han) return false;
    if (loc === 'sap_het' && !(b.ngay_con_lai !== null && b.ngay_con_lai >= 0 && b.ngay_con_lai <= 30)) return false;
    if (!search) return true;
    const txt = `${b.product_name} ${b.batch_code || ''} ${b.sku || ''} ${b.branch_name || 'chưa xác định'}`.toLowerCase();
    return txt.includes(search.toLowerCase());
  }), [rows, loc, search]);

  const nhan = (b) => {
    if (b.ngay_con_lai === null) return { t: 'Không hạn', c: 'bg-slate-100 text-slate-600' };
    if (b.ngay_con_lai < 0) return { t: `Quá hạn ${Math.abs(b.ngay_con_lai)} ngày`, c: 'bg-rose-100 text-rose-700' };
    if (b.ngay_con_lai <= 30) return { t: `Còn ${b.ngay_con_lai} ngày`, c: 'bg-amber-100 text-amber-700' };
    return { t: `Còn ${b.ngay_con_lai} ngày`, c: 'bg-emerald-100 text-emerald-700' };
  };

  const xuat = () => xuatExcel(
    hienThi,
    [
      { key: 'product_name', label: 'Sản phẩm' },
      { key: 'batch_code', label: 'Mã lô' },
      { key: 'branch_name', label: 'Chi nhánh/kho' },
      { key: 'expiry_date', label: 'Hạn sử dụng' },
      { key: 'ngay_con_lai', label: 'Ngày còn lại' },
      { key: 'quantity', label: 'Số lượng', format: tien },
      { key: 'cost_price', label: 'Giá vốn', format: tien },
      { key: 'note', label: 'Ghi chú' },
    ],
    'Lo-han-su-dung', 'Lô hàng'
  );

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <CalendarClock className="w-7 h-7 text-amber-600" /> Lô & Hạn Sử Dụng
          </h2>
          <p className="text-xs text-slate-500 mt-1">FEFO theo chi nhánh — lô mới luôn gắn đúng kho nhận hàng.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={xuat} className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 shadow-md shadow-amber-200">
            <Plus className="w-4 h-4" /> Nhập lô mới
          </button>
        </div>
      </div>

      {canhBao && (canhBao.het_han.c > 0 || canhBao.sap_het_han.c > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {canhBao.het_han.c > 0 && (
            <button onClick={() => setLoc('het_han')} className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-rose-100">
              <AlertTriangle className="w-8 h-8 text-rose-600 shrink-0" />
              <div>
                <div className="font-black text-rose-800">{canhBao.het_han.c} lô đã quá hạn</div>
                <div className="text-sm text-rose-700">{canhBao.het_han.sl} sản phẩm cần hủy khỏi kho</div>
              </div>
            </button>
          )}
          {canhBao.sap_het_han.c > 0 && (
            <button onClick={() => setLoc('sap_het')} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-amber-100">
              <CalendarClock className="w-8 h-8 text-amber-600 shrink-0" />
              <div>
                <div className="font-black text-amber-800">{canhBao.sap_het_han.c} lô sắp hết hạn (30 ngày)</div>
                <div className="text-sm text-amber-700">{canhBao.sap_het_han.sl} sản phẩm — nên xả hàng sớm</div>
              </div>
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {[{ k: 'all', l: 'Tất cả' }, { k: 'sap_het', l: 'Sắp hết hạn' }, { k: 'het_han', l: 'Quá hạn' }].map((t) => (
              <button key={t.k} onClick={() => setLoc(t.k)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold ${loc === t.k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t.l}</button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm sản phẩm, mã lô, chi nhánh..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-500" />
          </div>
          <span className="text-xs text-slate-400">{hienThi.length} lô</span>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : hienThi.length === 0 ? (
              <div className="py-16 text-center">
                <PackageX className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">{rows.length === 0 ? 'Chưa có lô hàng nào.' : 'Không có lô khớp bộ lọc.'}</p>
                {rows.length === 0 && <p className="text-slate-400 text-sm mt-1">Bấm "Nhập lô mới" để bắt đầu theo dõi hạn sử dụng.</p>}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Sản phẩm</th>
                    <th className="py-3 px-4 font-semibold">Mã lô</th>
                    <th className="py-3 px-4 font-semibold">Chi nhánh/kho</th>
                    <th className="py-3 px-4 font-semibold">Hạn dùng</th>
                    <th className="py-3 px-4 font-semibold text-right">Còn lại</th>
                    <th className="py-3 px-4 font-semibold text-right">Giá vốn</th>
                    <th className="py-3 px-4 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hienThi.map((b) => {
                    const n = nhan(b);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{b.product_name}</div>
                          <div className="text-xs text-slate-400 font-mono">{b.sku}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{b.batch_code || '—'}</td>
                        <td className="py-3 px-4">
                          {b.branch_name ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700"><Warehouse className="w-3.5 h-3.5 text-slate-400" />{b.branch_name}</span>
                          ) : (
                            <button onClick={() => openAssign(b)} className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold hover:bg-amber-100">
                              Gán kho
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-600">{b.expiry_date || '—'}</div>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${n.c}`}>{n.t}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">{b.quantity}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{money(b.cost_price)} đ</td>
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => huy(b)} title="Hủy lô (hàng hỏng/quá hạn)"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => !submitting && setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Nhập lô hàng mới</h3>
            <p className="text-sm text-slate-500 mb-4">Lô và tồn kho được ghi nhận đúng chi nhánh trong cùng một giao dịch.</p>
            <form onSubmit={them} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Sản phẩm</label>
                  <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500 bg-white">
                    <option value="">-- Chọn sản phẩm --</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} (tồn {p.stock})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Chi nhánh / kho nhận</label>
                  <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500 bg-white">
                    <option value="">-- Chọn kho --</option>
                    {branches.filter((b) => (b.status || 'active') === 'active').map((b) => (
                      <option key={b.id} value={b.id}>{b.name}{Number(b.is_default) === 1 ? ' (mặc định)' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Mã lô</label>
                  <input value={form.batch_code} onChange={(e) => setForm({ ...form, batch_code: e.target.value })} placeholder="VD: LO-2607"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Hạn sử dụng</label>
                  <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Số lượng</label>
                  <input type="number" min="0.000001" step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-right" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Giá vốn</label>
                  <input type="number" min="0" step="any" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500 text-right" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" disabled={submitting} onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-bold hover:bg-amber-700 disabled:opacity-50">{submitting ? 'Đang nhập...' : 'Nhập lô'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignBatch && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => !submitting && setAssignBatch(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Gán chi nhánh cho lô cũ</h3>
            <p className="text-sm text-slate-500 mb-4">Lô <b>{assignBatch.batch_code || assignBatch.id}</b> có {assignBatch.quantity} {assignBatch.product_name}. Chỉ chọn nơi hàng thực tế đang nằm.</p>
            <form onSubmit={ganChiNhanh} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Chi nhánh / kho thực tế</label>
                <select value={assignBranchId} onChange={(e) => setAssignBranchId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-amber-500 bg-white">
                  <option value="">-- Chọn kho --</option>
                  {branches.filter((b) => (b.status || 'active') === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900">
                Hệ thống chỉ gán khi tồn hiện có tại chi nhánh đủ bao phủ lô, tránh tạo vị trí lô không có hàng thật.
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={submitting} onClick={() => setAssignBatch(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 disabled:opacity-50">Đóng</button>
                <button type="submit" disabled={submitting || !assignBranchId} className="flex-1 py-3 bg-amber-600 text-white rounded-xl font-bold disabled:opacity-50">{submitting ? 'Đang gán...' : 'Xác nhận kho'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}