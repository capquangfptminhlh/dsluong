import React, { useState, useEffect, useRef } from 'react';
import { ClipboardList, Plus, Trash2, X, PackageCheck, Undo2, Truck } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function SupplierOrders() {
  const [tab, setTab] = useState('order'); // order | return
  const [requests, setRequests] = useState([]);
  const [returns, setReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [laTra, setLaTra] = useState(false); // form đang là trả hàng?
  const [head, setHead] = useState({ supplier_id: '', branch_id: '', expected_date: '', note: '', reason: '' });
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState('');
  const [returnRefundMethod, setReturnRefundMethod] = useState('');
  const [returnRefundReference, setReturnRefundReference] = useState('');
  const [returning, setReturning] = useState(false);
  const returningRef = useRef(false);
  const [ordering, setOrdering] = useState(false);
  const orderingRef = useRef(false);

  const [receiveOrder, setReceiveOrder] = useState(null);
  const [receivePaid, setReceivePaid] = useState('0');
  const [receiveMethod, setReceiveMethod] = useState('');
  const [receiveReference, setReceiveReference] = useState('');
  const [receiving, setReceiving] = useState(false);
  const receivingRef = useRef(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r, tr, s, p, b] = await Promise.all([
        axios.get(`${API_BASE}/api/supplier-orders/requests`),
        axios.get(`${API_BASE}/api/supplier-orders/returns`),
        axios.get(`${API_BASE}/api/suppliers`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/branches`).catch(() => ({ data: [] })),
      ]);
      setRequests(r.data); setReturns(tr.data); setSuppliers(s.data); setProducts(p.data); setBranches(b.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
  const variantLabel = (variant) => {
    const values = Object.values(variant?.attributes || {}).map((value) => String(value || '').trim()).filter(Boolean);
    return values.join(' / ') || String(variant?.sku || `Phân loại #${variant?.id || ''}`);
  };

  const moForm = (tra) => {
    const md = branches.find((b) => b.is_default) || branches[0];
    returningRef.current = false;
    orderingRef.current = false;
    setReturning(false);
    setOrdering(false);
    setReturnRefundMethod('');
    setReturnRefundReference('');
    setLaTra(tra);
    setHead({ supplier_id: '', branch_id: md ? String(md.id) : '', expected_date: '', note: '', reason: '' });
    setLines([]); setShowForm(true);
  };

  const dongForm = () => {
    if (returningRef.current || orderingRef.current) return;
    setShowForm(false);
  };

  const themDong = (pid) => {
    const p = products.find((x) => x.id === Number(pid));
    if (!p) return;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (laTra && lines.some((l) => l.product_id === p.id)) return;
    if (!laTra && variants.length === 0 && lines.some((l) => l.product_id === p.id)) return;
    const singleVariant = variants.length === 1 ? variants[0] : null;
    setLines([...lines, {
      product_id: p.id,
      name: p.name,
      quantity: 1,
      cost_price: singleVariant ? (singleVariant.cost_price || p.cost_price || 0) : (p.cost_price || 0),
      stock: p.stock,
      variants,
      variant_id: singleVariant?.id || '',
    }]);
    setPick('');
  };
  const sua = (i, f, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, [f]: v } : l));
  const tong = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.cost_price || 0), 0);
  const selectedSupplier = suppliers.find((s) => String(s.id) === String(head.supplier_id));
  const supplierDebt = Math.max(0, Number(selectedSupplier?.total_debt) || 0);
  const estimatedDebtReduction = laTra && selectedSupplier ? Math.min(supplierDebt, tong) : 0;
  const estimatedRefund = laTra && selectedSupplier ? Math.max(0, tong - estimatedDebtReduction) : 0;
  const invalidQuantityLine = lines.some((line) => {
    const quantity = Number(line.quantity);
    return !Number.isFinite(quantity) || quantity <= 0;
  });
  const invalidOrderCost = !laTra && lines.some((line) => {
    const costPrice = Number(line.cost_price);
    return !Number.isFinite(costPrice) || costPrice < 0;
  });
  const invalidOrderVariant = !laTra && lines.some((line) => Array.isArray(line.variants) && line.variants.length > 1 && !line.variant_id);
  const returnFormValid = laTra
    && Boolean(head.supplier_id)
    && Boolean(head.branch_id)
    && lines.length > 0
    && !invalidQuantityLine
    && (estimatedRefund <= 0 || Boolean(returnRefundMethod))
    && !returning;
  const orderFormValid = !laTra
    && lines.length > 0
    && !invalidQuantityLine
    && !invalidOrderCost
    && !invalidOrderVariant
    && !ordering;
  const formSaving = returning || ordering;

  const luu = async () => {
    if (lines.length === 0) return alert('Thêm ít nhất một mặt hàng!');
    if (invalidQuantityLine) return alert('Số lượng phải là số hữu hạn lớn hơn 0.');
    if (!laTra && invalidOrderCost) return alert('Giá nhập phải là số hữu hạn không âm.');
    if (!laTra && invalidOrderVariant) return alert('Sản phẩm có nhiều phân loại: hãy chọn đúng phân loại cần nhập.');
    if (laTra && !head.supplier_id) return alert('Hãy chọn nhà cung cấp để ghi giảm công nợ/hoàn tiền đúng dữ liệu.');
    if (laTra && estimatedRefund > 0 && !returnRefundMethod) return alert('Hãy chọn hình thức NCC hoàn tiền.');
    if (laTra && returningRef.current) return;
    if (!laTra && orderingRef.current) return;

    if (laTra) {
      returningRef.current = true;
      setReturning(true);
    } else {
      orderingRef.current = true;
      setOrdering(true);
    }
    try {
      const body = {
        supplier_id: head.supplier_id || null,
        branch_id: head.branch_id ? Number(head.branch_id) : null,
        items: lines.map((l) => laTra
          ? { product_id: l.product_id, quantity: Number(l.quantity) }
          : { product_id: l.product_id, variant_id: l.variant_id || null, quantity: Number(l.quantity), cost_price: Number(l.cost_price) }),
      };
      if (laTra) {
        body.reason = head.reason;
        body.refund_method = estimatedRefund > 0 ? returnRefundMethod : null;
        body.refund_reference = estimatedRefund > 0 ? (returnRefundReference.trim() || null) : null;
        const res = await axios.post(`${API_BASE}/api/supplier-orders/returns`, body);
        const refundLine = Number(res.data.refund_amount || 0) > 0
          ? `\nNCC hoàn lại: ${money(res.data.refund_amount)}đ (${res.data.refund_method || 'chưa rõ phương thức'})`
          : '';
        alert(`Đã tạo phiếu trả NCC ${res.data.code} — ${money(res.data.total_amount)}đ.\nGiảm công nợ: ${money(res.data.debt_reduction)}đ${refundLine}`);
      } else {
        body.expected_date = head.expected_date || null;
        body.note = head.note;
        const res = await axios.post(`${API_BASE}/api/supplier-orders/requests`, body);
        alert(`Đã tạo đơn đặt hàng ${res.data.code} — ${money(res.data.total_amount)}đ.\nHàng chưa về nên chưa cộng kho.`);
      }
      setShowForm(false);
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi lưu');
    } finally {
      if (laTra) {
        returningRef.current = false;
        setReturning(false);
      } else {
        orderingRef.current = false;
        setOrdering(false);
      }
    }
  };

  const moNhanHang = (dh) => {
    receivingRef.current = false;
    setReceiving(false);
    setReceivePaid('0');
    setReceiveMethod('');
    setReceiveReference('');
    setReceiveOrder(dh);
  };

  const dongNhanHang = () => {
    if (receivingRef.current) return;
    setReceiveOrder(null);
  };

  const receiveTotal = Number(receiveOrder?.total_amount || 0);
  const receivePaidNumber = receivePaid.trim() === '' ? 0 : Number(receivePaid);
  const receivePaidInvalid = !Number.isFinite(receivePaidNumber)
    || receivePaidNumber < 0
    || receivePaidNumber > receiveTotal;
  const receiveFormValid = Boolean(receiveOrder)
    && !receivePaidInvalid
    && (receivePaidNumber <= 0 || Boolean(receiveMethod))
    && !receiving;

  const nhanHang = async () => {
    if (!receiveOrder || receivingRef.current) return;
    const paidAmount = receivePaid.trim() === '' ? 0 : Number(receivePaid);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) return alert('Số tiền trả NCC phải là số hợp lệ không âm.');
    if (paidAmount > Number(receiveOrder.total_amount || 0)) return alert('Số tiền trả NCC không được lớn hơn tổng tiền đơn đặt hàng.');
    if (paidAmount > 0 && !receiveMethod) return alert('Hãy chọn hình thức thanh toán để ghi nhận sổ tiền đúng dữ liệu.');

    receivingRef.current = true;
    setReceiving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/supplier-orders/requests/${receiveOrder.id}/nhan-hang`, {
        paid_amount: paidAmount,
        payment_method: paidAmount > 0 ? receiveMethod : null,
        payment_reference: paidAmount > 0 ? (receiveReference.trim() || null) : null,
      });
      alert(`Đã nhận hàng, tạo phiếu nhập ${res.data.purchase_code}.\nCộng kho xong.${res.data.con_no > 0 ? `\nCòn nợ NCC: ${money(res.data.con_no)}đ` : ''}`);
      setReceiveOrder(null);
      await fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi nhận hàng');
    } finally {
      receivingRef.current = false;
      setReceiving(false);
    }
  };

  const huyDon = async (dh) => {
    if (!window.confirm(`Hủy đơn đặt hàng ${dh.code}?`)) return;
    try { await axios.post(`${API_BASE}/api/supplier-orders/requests/${dh.id}/huy`); fetchAll(); }
    catch (err) { alert(err.response?.data?.error || 'Lỗi'); }
  };

  const nhanTT = (s) => ({
    ordered: { t: 'Đã đặt, chờ hàng', c: 'bg-amber-100 text-amber-700' },
    received: { t: 'Đã nhận hàng', c: 'bg-emerald-100 text-emerald-700' },
    cancelled: { t: 'Đã hủy', c: 'bg-slate-100 text-slate-500' },
  }[s] || { t: s, c: 'bg-slate-100 text-slate-600' });

  return (
    <div className="h-full flex flex-col space-y-5">
      <div className="flex justify-between items-end flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-orange-600" /> Đặt Hàng & Trả Hàng NCC
          </h2>
          <p className="text-xs text-slate-500 mt-1">Đặt hàng trước — khi hàng về mới cộng kho và ghi công nợ</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => moForm(true)} className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-rose-200 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-50">
            <Undo2 className="w-4 h-4" /> Trả hàng NCC
          </button>
          <button onClick={() => moForm(false)} className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-700 shadow-md shadow-orange-200">
            <Plus className="w-4 h-4" /> Tạo đơn đặt hàng
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('order')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${tab === 'order' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Đơn đặt hàng ({requests.length})</button>
        <button onClick={() => setTab('return')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${tab === 'return' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Trả hàng NCC ({returns.length})</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : tab === 'order' ? (
              requests.length === 0 ? (
                <div className="py-16 text-center">
                  <Truck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">Chưa có đơn đặt hàng nào.</p>
                  <p className="text-slate-400 text-sm mt-1">Đặt hàng trước, khi hàng về bấm "Nhận hàng" là tự cộng kho.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr><th className="py-3 px-4 font-semibold">Mã đơn</th><th className="py-3 px-4 font-semibold">NCC</th><th className="py-3 px-4 font-semibold text-right">Tổng tiền</th><th className="py-3 px-4 font-semibold">Dự kiến về</th><th className="py-3 px-4 font-semibold">Trạng thái</th><th className="py-3 px-4 text-right font-semibold">Thao tác</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => {
                      const tt = nhanTT(r.status);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4 font-bold text-orange-700">{r.code}</td>
                          <td className="py-3 px-4 text-slate-600">{r.supplier_name || '—'}</td>
                          <td className="py-3 px-4 text-right font-bold text-slate-800">{money(r.total_amount)}đ</td>
                          <td className="py-3 px-4 text-slate-500">{r.expected_date || '—'}</td>
                          <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tt.c}`}>{tt.t}</span></td>
                          <td className="py-3 px-4 text-right">
                            {r.status === 'ordered' && (
                              <div className="flex justify-end gap-1">
                                <button onClick={() => moNhanHang(r)} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100 flex items-center gap-1">
                                  <PackageCheck className="w-3.5 h-3.5" /> Nhận hàng
                                </button>
                                <button onClick={() => huyDon(r)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : (
              returns.length === 0 ? (
                <div className="py-16 text-center">
                  <Undo2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium">Chưa có phiếu trả hàng NCC nào.</p>
                  <p className="text-slate-400 text-sm mt-1">Trả hàng lỗi cho NCC sẽ tự trừ kho và giảm công nợ phải trả.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr><th className="py-3 px-4 font-semibold">Mã phiếu</th><th className="py-3 px-4 font-semibold">NCC</th><th className="py-3 px-4 font-semibold text-right">Giá trị</th><th className="py-3 px-4 font-semibold">Lý do</th><th className="py-3 px-4 font-semibold">Ngày</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {returns.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-bold text-rose-700">{r.code}</td>
                        <td className="py-3 px-4 text-slate-600">{r.supplier_name || '—'}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800">{money(r.total_amount)}đ</td>
                        <td className="py-3 px-4 text-slate-600">{r.reason || '—'}</td>
                        <td className="py-3 px-4 text-slate-500">{(r.createdAt || '').split(' ')[0]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={dongForm}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className={`text-lg font-bold ${laTra ? 'text-rose-700' : 'text-orange-700'}`}>
                {laTra ? 'Trả hàng cho nhà cung cấp' : 'Tạo đơn đặt hàng NCC'}
              </h3>
              <button disabled={formSaving} onClick={dongForm} className="text-slate-400 hover:text-slate-600 disabled:opacity-40"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nhà cung cấp</label>
                <select disabled={formSaving} value={head.supplier_id} onChange={(e) => { setHead({ ...head, supplier_id: e.target.value }); setReturnRefundMethod(''); setReturnRefundReference(''); }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500 bg-white">
                  <option value="">-- Chọn NCC --</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{laTra ? 'Trả từ kho' : 'Nhận về kho'}</label>
                <select disabled={formSaving} value={head.branch_id} onChange={(e) => setHead({ ...head, branch_id: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500 bg-white">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">{laTra ? 'Lý do trả' : 'Ngày dự kiến về'}</label>
                {laTra ? (
                  <input disabled={formSaving} value={head.reason} onChange={(e) => setHead({ ...head, reason: e.target.value })} placeholder="Hàng lỗi"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-500" />
                ) : (
                  <input disabled={formSaving} type="date" value={head.expected_date} onChange={(e) => setHead({ ...head, expected_date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500" />
                )}
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-bold text-slate-700 mb-1">Thêm mặt hàng</label>
              <select disabled={formSaving} value={pick} onChange={(e) => themDong(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-orange-500 bg-white">
                <option value="">-- Chọn sản phẩm --</option>
                {products.filter((p) => {
                  if (laTra) return !lines.some((l) => l.product_id === p.id);
                  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
                  return hasVariants || !lines.some((l) => l.product_id === p.id);
                }).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (tồn {p.stock})</option>
                ))}
              </select>
            </div>

            {lines.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr><th className="py-2 px-3 text-left font-semibold">Sản phẩm</th><th className="py-2 px-3 text-right font-semibold w-24">SL</th><th className="py-2 px-3 text-right font-semibold w-32">{laTra ? 'Giá vốn hệ thống' : 'Đơn giá'}</th><th className="py-2 px-3 text-right font-semibold w-32">Thành tiền</th><th className="w-10"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l, i) => {
                      const quantityInvalid = !Number.isFinite(Number(l.quantity)) || Number(l.quantity) <= 0;
                      const costInvalid = !laTra && (!Number.isFinite(Number(l.cost_price)) || Number(l.cost_price) < 0);
                      return (
                        <tr key={`${l.product_id}-${l.variant_id || 'base'}-${i}`}>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-slate-700">{l.name}</div>
                            {!laTra && Array.isArray(l.variants) && l.variants.length > 0 && (
                              <select
                                disabled={formSaving}
                                value={l.variant_id || ''}
                                onChange={(e) => {
                                  const variantId = Number(e.target.value);
                                  const selected = l.variants.find((variant) => Number(variant.id) === variantId);
                                  setLines(lines.map((line, idx) => idx === i ? {
                                    ...line,
                                    variant_id: e.target.value,
                                    cost_price: selected ? (selected.cost_price || 0) : line.cost_price,
                                  } : line));
                                }}
                                className={`mt-1 w-full rounded-lg border bg-white px-2 py-1 text-xs font-bold outline-none ${l.variants.length > 1 && !l.variant_id ? 'border-red-400' : 'border-slate-200 focus:border-orange-500'}`}
                              >
                                {l.variants.length > 1 && <option value="">-- Chọn phân loại --</option>}
                                {l.variants.map((variant) => (
                                  <option key={variant.id} value={variant.id}>{variantLabel(variant)} · tồn {variant.stock}</option>
                                ))}
                              </select>
                            )}
                            {laTra && <div className="text-xs text-slate-400">Tổng tồn đang hiển thị {l.stock}; backend sẽ kiểm đúng kho khi xác nhận</div>}
                          </td>
                          <td className="py-2 px-3 align-top">
                            <input disabled={formSaving} type="number" min="1" step="1" value={l.quantity} onChange={(e) => sua(i, 'quantity', e.target.value)}
                              className={`w-full px-2 py-1 border rounded-lg text-right outline-none ${quantityInvalid ? 'border-red-400' : 'border-slate-200 focus:border-orange-500'}`} />
                            {quantityInvalid && <div className="mt-1 text-[10px] font-semibold text-red-600">SL &gt; 0</div>}
                          </td>
                          <td className="py-2 px-3 align-top">
                            {laTra ? (
                              <div className="w-full px-2 py-1 border border-slate-200 rounded-lg text-right font-semibold text-slate-700 bg-slate-50">{money(l.cost_price)}đ</div>
                            ) : (
                              <>
                                <input disabled={formSaving} type="number" min="0" step="1" value={l.cost_price} onChange={(e) => sua(i, 'cost_price', e.target.value)}
                                  className={`w-full px-2 py-1 border rounded-lg text-right outline-none ${costInvalid ? 'border-red-400' : 'border-slate-200 focus:border-orange-500'}`} />
                                {costInvalid && <div className="mt-1 text-[10px] font-semibold text-red-600">Giá hữu hạn ≥ 0</div>}
                              </>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-bold">{money(Number(l.quantity || 0) * Number(l.cost_price || 0))}đ</td>
                          <td className="py-2 px-3 text-center">
                            <button disabled={formSaving} onClick={() => setLines(lines.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="bg-slate-50 rounded-xl p-4 flex justify-between items-center mb-4">
              <span className="font-bold text-slate-600">{laTra ? 'Giá trị theo giá vốn hệ thống' : 'Tổng giá trị'}</span>
              <span className={`text-2xl font-black ${laTra ? 'text-rose-600' : 'text-orange-600'}`}>{money(tong)}đ</span>
            </div>

            {laTra && (
              <div className="space-y-3 mb-4">
                {!selectedSupplier ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-semibold text-amber-800">
                    Chọn nhà cung cấp để AutoTax tính phần giảm công nợ và phần tiền NCC cần hoàn lại.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="text-xs text-slate-500">Nợ NCC hiện tại</div>
                        <div className="font-black text-slate-800 mt-1">{money(supplierDebt)}đ</div>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <div className="text-xs text-emerald-700">Dự kiến giảm nợ</div>
                        <div className="font-black text-emerald-800 mt-1">{money(estimatedDebtReduction)}đ</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="text-xs text-blue-700">Dự kiến NCC hoàn</div>
                        <div className="font-black text-blue-800 mt-1">{money(estimatedRefund)}đ</div>
                      </div>
                    </div>
                    {estimatedRefund > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Hình thức NCC hoàn tiền</label>
                          <select disabled={formSaving} value={returnRefundMethod} onChange={(e) => setReturnRefundMethod(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 bg-white">
                            <option value="">-- Chọn hình thức --</option>
                            <option value="cash">Tiền mặt</option>
                            <option value="bank">Chuyển khoản</option>
                            <option value="card">Thẻ</option>
                            <option value="other">Khác</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">Mã tham chiếu <span className="font-normal text-slate-400">(không bắt buộc)</span></label>
                          <input disabled={formSaving} value={returnRefundReference} onChange={(e) => setReturnRefundReference(e.target.value)} placeholder="VD: mã giao dịch ngân hàng"
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500" />
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">
                      Số trên là ước tính từ dữ liệu đang hiển thị. Backend sẽ kiểm lại tồn kho, giá vốn và công nợ trong cùng một transaction khi xác nhận.
                    </p>
                  </>
                )}
              </div>
            )}

            {!laTra && (
              <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs font-semibold leading-5 text-orange-800">
                Đơn đặt hàng <b>chưa cộng kho và chưa ghi công nợ</b>. Header và toàn bộ dòng hàng được tạo trong cùng một transaction; nếu một dòng lỗi, đơn sẽ không được tạo dở dang.
              </div>
            )}

            <div className="flex gap-2">
              <button disabled={formSaving} onClick={dongForm} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button disabled={laTra ? !returnFormValid : !orderFormValid} onClick={luu} className={`flex-[2] py-3 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed ${laTra ? 'bg-rose-600 hover:bg-rose-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                {laTra ? (returning ? 'Đang trả hàng...' : 'Xác nhận trả hàng') : (ordering ? 'Đang tạo đơn...' : 'Tạo đơn đặt hàng')}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiveOrder && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4" onClick={dongNhanHang}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3 mb-5">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <PackageCheck className="w-5 h-5 text-emerald-600" /> Nhận hàng NCC
                </h3>
                <p className="text-xs text-slate-500 mt-1">Đơn {receiveOrder.code} · {receiveOrder.supplier_name || 'Không chọn NCC'}</p>
              </div>
              <button disabled={receiving} onClick={dongNhanHang} className="text-slate-400 hover:text-slate-600 disabled:opacity-40">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-600">Tổng đơn</span>
              <span className="text-xl font-black text-slate-900">{money(receiveTotal)}đ</span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Trả NCC ngay</label>
                <input
                  type="number"
                  min="0"
                  max={receiveTotal}
                  step="1"
                  value={receivePaid}
                  disabled={receiving}
                  onChange={(e) => setReceivePaid(e.target.value)}
                  className={`w-full px-3 py-2.5 border rounded-xl outline-none ${receivePaidInvalid ? 'border-red-400' : 'border-slate-200 focus:border-emerald-500'}`}
                />
                {receivePaidInvalid && (
                  <p className="text-xs font-semibold text-red-600 mt-1">Số tiền phải từ 0 đến {money(receiveTotal)}đ.</p>
                )}
              </div>

              {receivePaidNumber > 0 && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Hình thức thanh toán</label>
                    <select
                      value={receiveMethod}
                      disabled={receiving}
                      onChange={(e) => setReceiveMethod(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-white"
                    >
                      <option value="">-- Chọn hình thức --</option>
                      <option value="cash">Tiền mặt</option>
                      <option value="bank">Chuyển khoản</option>
                      <option value="card">Thẻ</option>
                      <option value="other">Khác</option>
                    </select>
                    {!receiveMethod && <p className="text-xs text-amber-600 font-semibold mt-1">Cần chọn để sổ quỹ không ghi sai phương thức.</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">Mã tham chiếu <span className="font-normal text-slate-400">(không bắt buộc)</span></label>
                    <input
                      value={receiveReference}
                      disabled={receiving}
                      onChange={(e) => setReceiveReference(e.target.value)}
                      placeholder="VD: mã giao dịch ngân hàng"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500"
                    />
                  </div>
                </>
              )}

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 leading-relaxed">
                Khi xác nhận, AutoTax sẽ cộng kho, cập nhật giá vốn và ghi công nợ/luồng tiền trong cùng một giao dịch. Bấm nhiều lần cũng không thể nhận cùng đơn hai lần.
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button disabled={receiving} onClick={dongNhanHang} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button
                disabled={!receiveFormValid}
                onClick={nhanHang}
                className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {receiving ? 'Đang nhận hàng...' : 'Xác nhận nhận hàng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}