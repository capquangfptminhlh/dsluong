import React, { useState, useEffect, useRef } from 'react';
import { PackagePlus, Plus, Trash2, X, FileText, FileCheck2, Upload } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

const MAX_INVOICE_XML_BYTES = 2 * 1024 * 1024;

const emptyInvoice = () => ({
  seller_tax_code: '',
  buyer_tax_code: '',
  invoice_number: '',
  invoice_symbol: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  subtotal: '',
  vat_amount: '',
  total_amount: '',
  currency: 'VND',
});

export default function Purchase() {
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [paid, setPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [xem, setXem] = useState(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState('manual');
  const [invoiceDraft, setInvoiceDraft] = useState(emptyInvoice);
  const [invoiceXml, setInvoiceXml] = useState('');
  const [invoiceFileName, setInvoiceFileName] = useState('');
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, s, o] = await Promise.all([
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/suppliers`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/purchases`),
      ]);
      setProducts(p.data);
      setSuppliers(s.data);
      setOrders(o.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(n || 0) + ' ₫';
  const variantLabel = (variant) => {
    const values = Object.values(variant?.attributes || {}).map((value) => String(value || '').trim()).filter(Boolean);
    return values.join(' / ') || String(variant?.sku || `Phân loại #${variant?.id || ''}`);
  };
  const paymentLabel = (method) => ({
    cash: 'Tiền mặt',
    bank: 'Chuyển khoản',
    card: 'Thẻ',
    other: 'Khác',
    unknown: 'Chưa xác định',
  }[method] || method || '—');
  const invoiceSourceLabel = (source) => ({
    MANUAL: 'Nhập tay',
    XML_CANONICAL_V1: 'XML AutoTax',
    XML_TCT_HDON: 'XML HĐĐT',
  }[source] || source || 'Không rõ');

  const themDong = (productId) => {
    const p = products.find((x) => x.id === Number(productId));
    if (!p) return;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length === 0 && lines.some((l) => l.product_id === p.id)) return;
    const singleVariant = variants.length === 1 ? variants[0] : null;
    setLines([...lines, {
      product_id: p.id,
      name: p.name,
      quantity: 1,
      cost_price: singleVariant ? (singleVariant.cost_price || p.cost_price || 0) : (p.cost_price || 0),
      variants,
      variant_id: singleVariant?.id || '',
    }]);
    setPick('');
  };
  const suaDong = (i, field, val) => setLines(lines.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const xoaDong = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const invalidLine = lines.find((line) => {
    const quantity = Number(line.quantity);
    const costPrice = Number(line.cost_price);
    const missingVariant = Array.isArray(line.variants) && line.variants.length > 1 && !line.variant_id;
    return !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(costPrice) || costPrice < 0 || missingVariant;
  });
  const tongTien = invalidLine ? NaN : lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.cost_price), 0);
  const paidAmountPreview = paid.trim() === '' ? 0 : Number(paid);
  const paidInvalid = !Number.isFinite(paidAmountPreview) || paidAmountPreview < 0 || (Number.isFinite(tongTien) && paidAmountPreview > tongTien);
  const purchaseFormValid = lines.length > 0
    && !invalidLine
    && Number.isFinite(tongTien)
    && !paidInvalid
    && (paidAmountPreview <= 0 || Boolean(paymentMethod))
    && !saving;

  const moForm = () => {
    setSupplierId('');
    setNote('');
    setPaid('');
    setPaymentMethod('');
    setPaymentReference('');
    setLines([]);
    savingRef.current = false;
    setSaving(false);
    setShowForm(true);
  };

  const luu = async () => {
    if (savingRef.current) return;
    if (lines.length === 0) return alert('Thêm ít nhất một mặt hàng!');
    for (const l of lines) {
      const quantity = Number(l.quantity);
      const costPrice = Number(l.cost_price);
      if (!Number.isFinite(quantity) || quantity <= 0) return alert(`Số lượng của "${l.name}" phải là số hợp lệ lớn hơn 0`);
      if (!Number.isFinite(costPrice) || costPrice < 0) return alert(`Giá nhập của "${l.name}" phải là số hợp lệ và không được âm`);
      if (Array.isArray(l.variants) && l.variants.length > 1 && !l.variant_id) return alert(`Hãy chọn phân loại cần nhập của "${l.name}"`);
    }
    if (!Number.isFinite(tongTien)) return alert('Tổng tiền phiếu nhập không hợp lệ');
    const paidAmount = paid.trim() === '' ? 0 : Number(paid);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) return alert('Số tiền trả NCC không hợp lệ');
    if (paidAmount > tongTien) return alert('Số tiền trả NCC không được lớn hơn tổng tiền phiếu nhập');
    if (paidAmount > 0 && !paymentMethod) {
      return alert('Hãy chọn hình thức thanh toán để AutoTax ghi nhận chứng từ đúng dữ liệu.');
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/purchases`, {
        supplier_id: supplierId || null,
        items: lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id || null, quantity: Number(l.quantity), cost_price: Number(l.cost_price) })),
        paid_amount: paidAmount,
        payment_method: paidAmount > 0 ? paymentMethod : null,
        payment_reference: paidAmount > 0 ? (paymentReference.trim() || null) : null,
        note,
      });
      const conNo = res.data.con_no;
      alert(`Đã tạo phiếu nhập ${res.data.code}.\nTổng: ${money(res.data.total_amount)}${conNo > 0 ? `\nCòn nợ NCC: ${money(conNo)}` : ''}`);
      setShowForm(false);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi tạo phiếu nhập');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const xemChiTiet = async (id) => {
    try {
      const res = await axios.get(`${API_BASE}/api/purchases/${id}`);
      setXem(res.data);
      setShowInvoiceForm(false);
      setInvoiceResult(null);
    } catch { alert('Lỗi khi tải chi tiết'); }
  };

  const moGanHoaDon = async () => {
    if (!xem) return;
    const supplier = suppliers.find((item) => Number(item.id) === Number(xem.supplier_id));
    let buyerTaxCode = '';
    try {
      const profile = await axios.get(`${API_BASE}/api/auth/profile`);
      buyerTaxCode = profile.data?.taxCode || '';
    } catch {}
    setInvoiceDraft({
      ...emptyInvoice(),
      seller_tax_code: supplier?.tax_code || '',
      buyer_tax_code: buyerTaxCode,
      total_amount: xem.total_amount || '',
    });
    setInvoiceXml('');
    setInvoiceFileName('');
    setInvoiceMode('manual');
    setInvoiceResult(null);
    setShowInvoiceForm(true);
  };

  const docXml = async (file) => {
    if (!file) return;
    if (file.size > MAX_INVOICE_XML_BYTES) {
      setInvoiceXml('');
      setInvoiceFileName('');
      setInvoiceResult({ ok: false, message: 'File XML vượt quá giới hạn 2 MB.' });
      return;
    }
    try {
      const text = await file.text();
      setInvoiceXml(text);
      setInvoiceFileName(file.name);
      setInvoiceResult(null);
    } catch {
      alert('Không đọc được file XML.');
    }
  };

  const ganHoaDon = async () => {
    if (!xem) return;
    if (invoiceMode === 'xml' && !invoiceXml.trim()) return alert('Hãy chọn file XML trước.');
    if (invoiceMode === 'manual') {
      if (!invoiceDraft.seller_tax_code.trim() || !invoiceDraft.invoice_number.trim() || !invoiceDraft.invoice_date) {
        return alert('Cần MST người bán, số hóa đơn và ngày hóa đơn.');
      }
      for (const field of ['subtotal', 'vat_amount', 'total_amount']) {
        if (!Number.isFinite(Number(invoiceDraft[field])) || Number(invoiceDraft[field]) < 0) {
          return alert('Tiền trước thuế, VAT và tổng thanh toán phải là số hợp lệ.');
        }
      }
    }

    setInvoiceSaving(true);
    setInvoiceResult(null);
    try {
      const purchaseId = xem.id;
      const payload = invoiceMode === 'xml'
        ? { purchase_order_id: purchaseId, xml: invoiceXml }
        : {
            purchase_order_id: purchaseId,
            invoice: {
              ...invoiceDraft,
              subtotal: Number(invoiceDraft.subtotal),
              vat_amount: Number(invoiceDraft.vat_amount),
              total_amount: Number(invoiceDraft.total_amount),
            },
          };
      const res = await axios.post(`${API_BASE}/api/audit-compliance/input-invoices`, payload);
      setInvoiceResult({ ok: true, ...res.data });
      try {
        const refreshed = await axios.get(`${API_BASE}/api/purchases/${purchaseId}`);
        setXem(refreshed.data);
      } catch {}
    } catch (err) {
      const data = err.response?.data || {};
      if (data.code === 'DUPLICATE_INVOICE') {
        setInvoiceResult({ ok: false, message: `Hóa đơn đã tồn tại trong AutoTax (ID ${data.existing_invoice_id}).` });
      } else if (data.code === 'XML_UNSUPPORTED_SCHEMA') {
        setInvoiceResult({ ok: false, message: 'AutoTax chưa nhận diện chắc chắn cấu trúc XML này. File bị từ chối thay vì tự đoán dữ liệu.' });
      } else if (data.code === 'XML_SIGNATURE_INVALID') {
        setInvoiceResult({ ok: false, message: 'Chữ ký XML không khớp dữ liệu. File bị từ chối và không được lưu.' });
      } else if (data.code === 'XML_SIGNATURE_UNVERIFIED') {
        setInvoiceResult({ ok: false, message: 'XML có chữ ký nhưng AutoTax chưa xác minh được signed reference một cách an toàn. File chưa được nhập.' });
      } else if (data.code === 'XML_CERTIFICATE_AUTHORITY_UNVERIFIED') {
        const authorityStatus = data.detail?.authority_registry_status;
        setInvoiceResult({
          ok: false,
          message: `Chữ ký XML khớp dữ liệu nhưng CA phát hành chưa vượt qua chính sách RootCA đã cấu hình. File chưa được nhập.${authorityStatus ? ` Trạng thái kiểm tra CA: ${authorityStatus}.` : ''}`,
        });
      } else {
        setInvoiceResult({ ok: false, message: data.error || 'Không thể nhập hóa đơn.' });
      }
    } finally {
      setInvoiceSaving(false);
    }
  };

  const nhanTrangThai = (st) => ({
    paid: { t: 'Đã trả đủ', c: 'bg-emerald-100 text-emerald-700' },
    partial: { t: 'Trả một phần', c: 'bg-amber-100 text-amber-700' },
    unpaid: { t: 'Chưa trả', c: 'bg-rose-100 text-rose-700' },
  }[st] || { t: st, c: 'bg-slate-100 text-slate-600' });

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <PackagePlus className="w-8 h-8 text-emerald-500" /> Nhập Hàng
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Nhập hàng từ NCC — tự cộng tồn kho, cập nhật giá vốn và công nợ</p>
        </div>
        <button onClick={moForm} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md shadow-emerald-200 transition-colors">
          <Plus className="w-5 h-5" /> Tạo phiếu nhập
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 font-bold text-slate-700">Lịch sử nhập hàng</div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="py-16 text-center text-slate-400">Đang tải...</div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Chưa có phiếu nhập nào.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                <tr>
                  <th className="py-3 px-4 font-semibold">Mã phiếu</th>
                  <th className="py-3 px-4 font-semibold">NCC</th>
                  <th className="py-3 px-4 font-semibold text-right">Tổng tiền</th>
                  <th className="py-3 px-4 font-semibold text-right">Đã trả</th>
                  <th className="py-3 px-4 font-semibold">Trạng thái</th>
                  <th className="py-3 px-4 font-semibold">Ngày</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => {
                  const tt = nhanTrangThai(o.status);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => xemChiTiet(o.id)}>
                      <td className="py-3 px-4 font-bold text-emerald-700">{o.code}</td>
                      <td className="py-3 px-4 text-slate-600">{o.supplier_name || '—'}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">{money(o.total_amount)}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{money(o.paid_amount)}</td>
                      <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tt.c}`}>{tt.t}</span></td>
                      <td className="py-3 px-4 text-slate-500">{(o.createdAt || '').split(' ')[0]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 mb-4">Tạo phiếu nhập hàng</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nhà cung cấp</label>
                <select disabled={saving} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-white disabled:bg-slate-100">
                  <option value="">-- Không chọn (nhập lẻ) --</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Ghi chú</label>
                <input disabled={saving} value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 disabled:bg-slate-100" />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-sm font-bold text-slate-700 mb-1">Thêm sản phẩm vào phiếu</label>
              <select disabled={saving} value={pick} onChange={(e) => themDong(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 bg-white disabled:bg-slate-100">
                <option value="">-- Chọn sản phẩm --</option>
                {products.filter((p) => {
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
                    <tr>
                      <th className="py-2 px-3 text-left font-semibold">Sản phẩm</th>
                      <th className="py-2 px-3 text-right font-semibold w-24">SL nhập</th>
                      <th className="py-2 px-3 text-right font-semibold w-32">Giá nhập</th>
                      <th className="py-2 px-3 text-right font-semibold w-32">Thành tiền</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l, i) => {
                      const quantity = Number(l.quantity);
                      const costPrice = Number(l.cost_price);
                      const invalid = !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(costPrice) || costPrice < 0;
                      const lineTotal = Number.isFinite(quantity) && Number.isFinite(costPrice) ? quantity * costPrice : NaN;
                      return (
                        <tr key={`${l.product_id}-${l.variant_id || 'base'}-${i}`} className={invalid ? 'bg-rose-50/60' : ''}>
                          <td className="py-2 px-3 font-semibold text-slate-700">
                            <div>{l.name}</div>
                            {Array.isArray(l.variants) && l.variants.length > 0 && (
                              <select
                                disabled={saving}
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
                                className={`mt-1 w-full rounded-lg border bg-white px-2 py-1 text-xs font-bold outline-none ${l.variants.length > 1 && !l.variant_id ? 'border-rose-400' : 'border-slate-200 focus:border-emerald-500'}`}
                              >
                                {l.variants.length > 1 && <option value="">-- Chọn phân loại --</option>}
                                {l.variants.map((variant) => (
                                  <option key={variant.id} value={variant.id}>{variantLabel(variant)} · tồn {variant.stock}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <input disabled={saving} type="number" min="0" step="any" value={l.quantity} onChange={(e) => suaDong(i, 'quantity', e.target.value)} className={`w-full px-2 py-1 border rounded-lg text-right outline-none focus:border-emerald-500 disabled:bg-slate-100 ${invalid ? 'border-rose-400' : 'border-slate-200'}`} />
                          </td>
                          <td className="py-2 px-3">
                            <input disabled={saving} type="number" min="0" step="any" value={l.cost_price} onChange={(e) => suaDong(i, 'cost_price', e.target.value)} className={`w-full px-2 py-1 border rounded-lg text-right outline-none focus:border-emerald-500 disabled:bg-slate-100 ${invalid ? 'border-rose-400' : 'border-slate-200'}`} />
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">{Number.isFinite(lineTotal) ? money(lineTotal) : 'Không hợp lệ'}</td>
                          <td className="py-2 px-3 text-center">
                            <button type="button" disabled={saving} onClick={() => xoaDong(i)} className="text-slate-400 hover:text-red-600 disabled:opacity-40"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {invalidLine && (
              <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Số lượng phải lớn hơn 0; giá nhập phải hợp lệ; sản phẩm có nhiều phân loại phải chọn đúng phân loại.</div>
            )}

            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">Tổng tiền nhập</div>
                  <div className="text-2xl font-black text-emerald-700">{Number.isFinite(tongTien) ? money(tongTien) : 'Dữ liệu không hợp lệ'}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Còn nợ</div>
                  <div className="font-bold text-rose-600">{Number.isFinite(tongTien) && !paidInvalid ? money(Math.max(0, tongTien - paidAmountPreview)) : '—'}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Trả NCC ngay</label>
                  <input disabled={saving} type="number" min="0" step="any" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" className={`w-full px-3 py-2 border rounded-lg text-right outline-none focus:border-emerald-500 disabled:bg-slate-100 ${paidInvalid ? 'border-rose-400 bg-rose-50' : 'border-slate-200'}`} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Hình thức thanh toán</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} disabled={saving || !Number.isFinite(paidAmountPreview) || paidAmountPreview <= 0} className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 bg-white disabled:bg-slate-100 disabled:text-slate-400">
                    <option value="">-- Chọn --</option>
                    <option value="cash">Tiền mặt</option>
                    <option value="bank">Chuyển khoản</option>
                    <option value="card">Thẻ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Mã giao dịch / tham chiếu</label>
                  <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} disabled={saving || !Number.isFinite(paidAmountPreview) || paidAmountPreview <= 0} placeholder="Không bắt buộc" className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-emerald-500 disabled:bg-slate-100" />
                </div>
              </div>
              {paidInvalid && (
                <p className="text-xs font-semibold text-rose-700">Số tiền trả phải là số hợp lệ từ 0 đến tổng tiền phiếu nhập.</p>
              )}
              {!paidInvalid && paidAmountPreview > 0 && !paymentMethod && (
                <p className="text-xs font-semibold text-amber-700">Cần chọn hình thức thanh toán để chứng từ thanh toán được ghi nhận đúng.</p>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <button type="button" disabled={saving} onClick={() => setShowForm(false)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button type="button" disabled={!purchaseFormValid} onClick={luu} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                {saving ? 'Đang lưu...' : 'Lưu phiếu nhập'}
              </button>
            </div>
          </div>
        </div>
      )}

      {xem && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setXem(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Phiếu nhập {xem.code}</h3>
                <p className="text-sm text-slate-500">{xem.supplier_name || 'Nhập lẻ'} · {(xem.createdAt || '').split(' ')[0]}</p>
              </div>
              <button onClick={() => setXem(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm mb-4">
                <thead className="text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2 text-left font-semibold">Sản phẩm</th>
                    <th className="py-2 text-right font-semibold">SL</th>
                    <th className="py-2 text-right font-semibold">Giá nhập</th>
                    <th className="py-2 text-right font-semibold">Thành tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(xem.items || []).map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 font-semibold text-slate-700">{it.product_name}</td>
                      <td className="py-2 text-right">{it.quantity}</td>
                      <td className="py-2 text-right">{money(it.cost_price)}</td>
                      <td className="py-2 text-right font-bold">{money(it.quantity * it.cost_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tổng tiền</span><span className="font-bold">{money(xem.total_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Đã trả</span><span className="font-bold text-emerald-600">{money(xem.paid_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Còn nợ</span><span className="font-bold text-rose-600">{money(xem.total_amount - xem.paid_amount)}</span></div>
            </div>

            {(xem.payment_evidence || []).length > 0 && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <div className="text-sm font-bold text-slate-700 mb-2">Chứng từ thanh toán</div>
                <div className="space-y-2">
                  {xem.payment_evidence.map((evidence) => (
                    <div key={evidence.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div>
                        <div className="font-semibold text-slate-700">{paymentLabel(evidence.payment_method)} · {money(evidence.amount)}</div>
                        <div className="text-xs text-slate-500">{evidence.transaction_reference || 'Chưa có mã tham chiếu'}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${evidence.status === 'RECORDED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {evidence.status === 'RECORDED' ? 'Đã ghi nhận' : 'Cần bổ sung'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-black text-slate-800"><FileCheck2 className="h-4 w-4 text-blue-600" /> Hóa đơn đầu vào</div>
                  <p className="mt-1 text-xs text-slate-500">Đối chiếu dữ liệu hóa đơn ↔ phiếu nhập ↔ nhập kho. Chưa áp dụng rule VAT/TNDN nếu chưa được cấu hình.</p>
                </div>
                {!showInvoiceForm && (
                  <button type="button" onClick={moGanHoaDon} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Gắn hóa đơn</button>
                )}
              </div>

              {(xem.input_invoices || []).length > 0 ? (
                <div className="mt-3 space-y-2">
                  {xem.input_invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800">
                            HĐ {invoice.invoice_symbol ? `${invoice.invoice_symbol} · ` : ''}{invoice.invoice_number || `#${invoice.id}`}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {invoice.invoice_date || 'Chưa có ngày'} · {invoiceSourceLabel(invoice.source_type)} · MST bán {invoice.seller_tax_code || '—'}
                          </div>
                          {invoice.schema_family && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Schema {invoice.schema_family}{invoice.schema_version ? ` · ${invoice.schema_version}` : ''}</span>
                              {invoice.wrapper_type && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Wrapper {invoice.wrapper_type}</span>}
                              {invoice.message_code && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Mã thông điệp XML {invoice.message_code}</span>}
                              {invoice.tax_authority_code && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">Mã CQT trong XML {invoice.tax_authority_code}</span>}
                              {Number(invoice.signature_present) === 1 && invoice.signature_verification_status === 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION' && (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">XMLDSig khớp · CA khớp registry RootCA đã ghim · chưa kiểm tra thời điểm/thu hồi</span>
                              )}
                              {Number(invoice.signature_present) === 1 && invoice.signature_verification_status === 'CRYPTO_VALID_TRUSTED_CHAIN_NO_TIME_OR_REVOCATION' && (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">XMLDSig khớp · chuỗi chứng thư nối tới CA cấu hình · chưa kiểm tra thời điểm/thu hồi</span>
                              )}
                              {Number(invoice.signature_present) === 1 && invoice.signature_verification_status === 'CRYPTO_VALID_UNTRUSTED_CERT' && (
                                <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800">XMLDSig khớp dữ liệu · chứng thư chưa kiểm tra tin cậy</span>
                              )}
                              {Number(invoice.signature_present) === 1 && !['CRYPTO_VALID_UNTRUSTED_CERT', 'CRYPTO_VALID_TRUSTED_CHAIN_NO_TIME_OR_REVOCATION', 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION'].includes(invoice.signature_verification_status) && (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">Chữ ký XML chưa xác minh</span>
                              )}
                              {invoice.certificate_authority_name && (
                                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">CA: {invoice.certificate_authority_name}</span>
                              )}
                              {invoice.certificate_fingerprint_sha256 && (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600" title={invoice.certificate_fingerprint_sha256}>Cert SHA-256 {String(invoice.certificate_fingerprint_sha256).replace(/:/g, '').slice(0, 16)}…</span>
                              )}
                              {invoice.certificate_authority_registry_sha256 && (
                                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600" title={invoice.certificate_authority_registry_sha256}>Registry SHA-256 {String(invoice.certificate_authority_registry_sha256).replace(/:/g, '').slice(0, 16)}…</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-black text-slate-800">{money(invoice.total_amount)}</div>
                          <span className={`mt-1 inline-block rounded-full px-2 py-1 text-[11px] font-bold ${invoice.match_status === 'MATCHED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {invoice.match_status === 'MATCHED' ? 'Đã khớp phiếu nhập' : 'Cần đối chiếu'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-blue-200 bg-white/60 px-3 py-2 text-xs text-slate-500">Chưa có hóa đơn nào gắn với phiếu nhập này.</div>
              )}

              {showInvoiceForm && (
                <div className="mt-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <div className="mb-3 flex gap-2">
                    <button type="button" onClick={() => { setInvoiceMode('manual'); setInvoiceResult(null); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${invoiceMode === 'manual' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Nhập tay</button>
                    <button type="button" onClick={() => { setInvoiceMode('xml'); setInvoiceResult(null); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${invoiceMode === 'xml' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>XML</button>
                  </div>

                  {invoiceMode === 'manual' ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[
                        ['seller_tax_code', 'MST người bán'],
                        ['buyer_tax_code', 'MST người mua'],
                        ['invoice_number', 'Số hóa đơn'],
                        ['invoice_symbol', 'Ký hiệu'],
                      ].map(([field, label]) => (
                        <label key={field} className="text-xs font-bold text-slate-600">
                          {label}
                          <input value={invoiceDraft[field]} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, [field]: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500" />
                        </label>
                      ))}
                      <label className="text-xs font-bold text-slate-600">
                        Ngày hóa đơn
                        <input type="date" value={invoiceDraft.invoice_date} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, invoice_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-blue-500" />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Tiền trước thuế
                        <input type="number" min="0" value={invoiceDraft.subtotal} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, subtotal: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-medium outline-none focus:border-blue-500" />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        VAT
                        <input type="number" min="0" value={invoiceDraft.vat_amount} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, vat_amount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-medium outline-none focus:border-blue-500" />
                      </label>
                      <label className="text-xs font-bold text-slate-600">
                        Tổng thanh toán
                        <input type="number" min="0" value={invoiceDraft.total_amount} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, total_amount: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-right text-sm font-medium outline-none focus:border-blue-500" />
                      </label>
                    </div>
                  ) : (
                    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-5 text-center hover:border-blue-300 hover:bg-blue-50/50">
                      <Upload className="mx-auto mb-2 h-6 w-6 text-blue-500" />
                      <span className="block text-sm font-bold text-slate-700">{invoiceFileName || 'Chọn file XML'}</span>
                      <span className="mt-1 block text-xs text-slate-500">Hỗ trợ AutoTax canonical và family TCT_HDON (HDon trực tiếp hoặc bọc trong TDiep), tối đa 2 MB. Schema lạ sẽ bị từ chối, không tự đoán.</span>
                      <input type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => docXml(e.target.files?.[0])} />
                    </label>
                  )}

                  {invoiceResult && (
                    <div className={`mt-3 rounded-lg p-3 text-sm ${invoiceResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
                      <div className="font-bold">{invoiceResult.message || (invoiceResult.ok ? 'Đã nhập hóa đơn.' : 'Không thể nhập hóa đơn.')}</div>
                      {invoiceResult.ok && invoiceResult.xml_schema?.family && (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                          <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-emerald-200">Schema: {invoiceResult.xml_schema.family}</span>
                          {invoiceResult.xml_schema.version && <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-emerald-200">Phiên bản XML: {invoiceResult.xml_schema.version}</span>}
                          {invoiceResult.xml_schema.wrapped_message && <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-emerald-200">Có TDiep wrapper</span>}
                          {invoiceResult.xml_schema.message_code && <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-emerald-200">Mã thông điệp XML: {invoiceResult.xml_schema.message_code}</span>}
                          {invoiceResult.xml_schema.tax_authority_code && <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-emerald-200">Mã CQT trong XML: {invoiceResult.xml_schema.tax_authority_code}</span>}
                          {invoiceResult.xml_schema.signature_present && invoiceResult.xml_schema.signature_verification_status === 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 ring-1 ring-emerald-200">XMLDSig khớp · CA khớp registry RootCA đã ghim · chưa kiểm tra thời điểm/thu hồi</span>}
                          {invoiceResult.xml_schema.signature_present && invoiceResult.xml_schema.signature_verification_status === 'CRYPTO_VALID_TRUSTED_CHAIN_NO_TIME_OR_REVOCATION' && <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800 ring-1 ring-emerald-200">XMLDSig khớp · chuỗi chứng thư nối tới CA cấu hình · chưa kiểm tra thời điểm/thu hồi</span>}
                          {invoiceResult.xml_schema.signature_present && invoiceResult.xml_schema.signature_verification_status === 'CRYPTO_VALID_UNTRUSTED_CERT' && <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-800 ring-1 ring-blue-200">XMLDSig khớp dữ liệu · chứng thư chưa kiểm tra tin cậy</span>}
                          {invoiceResult.xml_schema.signature_present && !['CRYPTO_VALID_UNTRUSTED_CERT', 'CRYPTO_VALID_TRUSTED_CHAIN_NO_TIME_OR_REVOCATION', 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION'].includes(invoiceResult.xml_schema.signature_verification_status) && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800 ring-1 ring-amber-200">Chữ ký XML chưa xác minh</span>}
                          {invoiceResult.xml_schema.certificate_authority_name && <span className="rounded-full bg-white/80 px-2 py-1 text-emerald-700 ring-1 ring-emerald-200">CA: {invoiceResult.xml_schema.certificate_authority_name}</span>}
                          {invoiceResult.xml_schema.certificate_fingerprint_sha256 && <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-slate-200" title={invoiceResult.xml_schema.certificate_fingerprint_sha256}>Cert SHA-256 {String(invoiceResult.xml_schema.certificate_fingerprint_sha256).replace(/:/g, '').slice(0, 16)}…</span>}
                          {invoiceResult.xml_schema.certificate_authority_registry_sha256 && <span className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-slate-200" title={invoiceResult.xml_schema.certificate_authority_registry_sha256}>Registry SHA-256 {String(invoiceResult.xml_schema.certificate_authority_registry_sha256).replace(/:/g, '').slice(0, 16)}…</span>}
                        </div>
                      )}
                      {invoiceResult.ok && Array.isArray(invoiceResult.findings) && invoiceResult.findings.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {invoiceResult.findings.map((finding) => <div key={finding.id}>• {finding.message}</div>)}
                        </div>
                      )}
                      {invoiceResult.ok && Array.isArray(invoiceResult.findings) && invoiceResult.findings.length === 0 && (
                        <div className="mt-1 text-xs">Chưa phát hiện vấn đề trong phạm vi dữ liệu và các rule đã được cấu hình.</div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => setShowInvoiceForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Đóng</button>
                    <button type="button" disabled={invoiceSaving} onClick={ganHoaDon} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                      {invoiceSaving ? 'Đang kiểm tra...' : 'Nhập & đối chiếu'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
