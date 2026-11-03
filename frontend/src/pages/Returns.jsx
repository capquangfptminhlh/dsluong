import React, { useState, useEffect, useRef } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Returns() {
  const [orders, setOrders] = useState([]);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [donChon, setDonChon] = useState(null);
  const [qty, setQty] = useState({});
  const [reason, setReason] = useState('');
  const [openingOrderId, setOpeningOrderId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [o, r] = await Promise.all([
        axios.get(`${API_BASE}/api/pos`),
        axios.get(`${API_BASE}/api/returns`),
      ]);
      setOrders(o.data);
      setReturns(r.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' ₫';

  const moTra = async (don) => {
    if (openingOrderId) return;
    setOpeningOrderId(don.id);
    try {
      const res = await axios.get(`${API_BASE}/api/returns/eligibility/${don.id}`);
      if (res.data.order_status === 'pending_payment') {
        return alert('Đơn chuyển khoản này chưa được xác nhận thanh toán. Hãy xác nhận thanh toán hoặc hủy đơn trước khi tạo phiếu trả.');
      }
      const eligibleItems = (res.data.items || []).filter((item) => item.remaining_quantity > 0 && !item.mixed_unit_ratio);
      if (eligibleItems.length === 0) {
        const mixed = (res.data.items || []).some((item) => item.remaining_quantity > 0 && item.mixed_unit_ratio);
        return alert(mixed
          ? 'Đơn này có sản phẩm bán theo nhiều quy đổi đơn vị trong cùng đơn. AutoTax đang chặn hoàn gộp để tránh sai kho; cần xử lý theo dòng bán cụ thể.'
          : 'Đơn này không còn mặt hàng nào có thể trả.');
      }
      setDonChon({ ...don, eligibility: res.data });
      setQty({});
      setReason('');
      savingRef.current = false;
      setSaving(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Không tải được số lượng còn có thể trả');
    } finally {
      setOpeningOrderId(null);
    }
  };

  const returnRows = donChon?.eligibility?.items || [];
  const selectedItems = returnRows
    .map((item) => ({ ...item, requested: qty[item.order_item_id || item.product_id] === undefined || qty[item.order_item_id || item.product_id] === '' ? 0 : Number(qty[item.order_item_id || item.product_id]) }))
    .filter((item) => item.requested > 0);
  const invalidInput = returnRows.find((item) => {
    const raw = qty[item.order_item_id || item.product_id];
    if (raw === undefined || raw === '') return false;
    const quantity = Number(raw);
    return !Number.isFinite(quantity) || quantity < 0 || quantity > Number(item.remaining_quantity) || (quantity > 0 && item.mixed_unit_ratio);
  });
  const rawRefundPreview = selectedItems.reduce((sum, item) => sum + item.requested * Number(item.refund_unit_estimate || 0), 0);
  const remainingRefundable = Number(donChon?.eligibility?.remaining_refundable || 0);
  const tongHoan = Math.min(rawRefundPreview, remainingRefundable);
  const canSubmit = selectedItems.length > 0 && !invalidInput && !saving;

  const luuTra = async () => {
    if (!donChon || savingRef.current) return;
    if (selectedItems.length === 0) return alert('Chọn số lượng cần trả!');
    for (const item of selectedItems) {
      if (!Number.isFinite(item.requested) || item.requested <= 0) return alert(`Số lượng trả của "${item.product_name}" không hợp lệ.`);
      if (item.requested > Number(item.remaining_quantity)) return alert(`"${item.product_name}" chỉ còn ${item.remaining_quantity} có thể trả.`);
      if (item.mixed_unit_ratio) return alert(`"${item.product_name}" có nhiều quy đổi đơn vị trong cùng đơn nên chưa thể hoàn gộp an toàn.`);
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/api/returns`, {
        order_id: donChon.id,
        items: selectedItems.map((item) => ({ order_item_id: item.order_item_id, product_id: item.product_id, variant_id: item.variant_id, quantity: item.requested })),
        reason,
      });
      const parts = [`Đã tạo phiếu trả ${res.data.code}.`, `Giá trị hoàn: ${money(res.data.total_refund)}.`];
      if (Number(res.data.debt_reduction) > 0) parts.push(`Giảm công nợ: ${money(res.data.debt_reduction)}.`);
      if (Number(res.data.cash_refund) > 0) parts.push(`Tiền trả lại khách: ${money(res.data.cash_refund)}.`);
      alert(parts.join('\n'));
      setDonChon(null);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi tạo phiếu trả');
      if (err.response?.status === 409) {
        try {
          const refreshed = await axios.get(`${API_BASE}/api/returns/eligibility/${donChon.id}`);
          if (refreshed.data.order_status === 'pending_payment') {
            setDonChon(null);
          } else {
            setDonChon((current) => current ? { ...current, eligibility: refreshed.data } : current);
            setQty({});
          }
        } catch {}
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const donHienThi = orders.filter((o) => o.status !== 'cancelled' && (!search || (o.order_code || '').includes(search) || (o.customer_name || '').toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <RotateCcw className="w-7 h-7 text-rose-500" /> Trả Hàng & Hoàn Tiền
          </h2>
          <p className="text-xs text-slate-500 mt-1">Chọn đơn đã bán, hệ thống kiểm tra phần còn được trả rồi mới hoàn kho, công nợ và tiền</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm đơn theo mã hoặc tên khách..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-rose-500" />
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {loading ? <div className="py-10 text-center text-slate-400">Đang tải...</div>
              : donHienThi.length === 0 ? <div className="py-10 text-center text-slate-400">Không có đơn hàng.</div>
              : donHienThi.map((o) => (
                <div key={o.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-rose-300 transition-colors">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800">{o.order_code}</div>
                    <div className="text-xs text-slate-500">{o.customer_name || 'Khách lẻ'} · {(o.createdAt || '').split(' ')[0]} · {(o.items || []).length} mặt hàng</div>
                    {o.status === 'pending_payment' && <div className="mt-1 text-[11px] font-semibold text-amber-700">Chờ xác nhận chuyển khoản — chưa thể trả hàng</div>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-slate-700">{money(o.total_amount)}</span>
                    <button disabled={openingOrderId !== null} onClick={() => moTra(o)} className="px-3 py-1.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-lg hover:bg-rose-100 disabled:opacity-50">
                      {openingOrderId === o.id ? 'Đang kiểm tra...' : 'Trả hàng'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 font-bold text-slate-700">Lịch sử trả hàng</div>
          <div className="flex-1 overflow-auto">
            {returns.length === 0 ? (
              <div className="py-10 text-center text-slate-400">Chưa có phiếu trả nào.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr><th className="py-2.5 px-4 font-semibold">Mã phiếu</th><th className="py-2.5 px-4 font-semibold">Đơn gốc</th><th className="py-2.5 px-4 font-semibold text-right">Giá trị hoàn</th><th className="py-2.5 px-4 font-semibold">Ngày</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {returns.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-4 font-bold text-rose-600">{r.code}</td>
                      <td className="py-2.5 px-4 text-slate-600">{r.order_code || '—'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-800">{money(r.total_refund)}</td>
                      <td className="py-2.5 px-4 text-slate-500">{(r.createdAt || '').split(' ')[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {donChon && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setDonChon(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Trả hàng — đơn {donChon.order_code}</h3>
                <p className="text-sm text-slate-500">{donChon.customer_name || 'Khách lẻ'} · đã hoàn {money(donChon.eligibility.already_refunded)}</p>
              </div>
              <button disabled={saving} onClick={() => setDonChon(null)} className="text-slate-400 hover:text-slate-600 disabled:opacity-50"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-2 mb-4">
              {returnRows.map((item) => {
                const raw = qty[item.order_item_id || item.product_id];
                const quantity = raw === undefined || raw === '' ? 0 : Number(raw);
                const invalid = !Number.isFinite(quantity) || quantity < 0 || quantity > Number(item.remaining_quantity);
                const disabled = saving || item.remaining_quantity <= 0 || item.mixed_unit_ratio;
                return (
                  <div key={item.order_item_id || item.product_id} className={`border rounded-xl p-3 ${item.mixed_unit_ratio ? 'border-amber-300 bg-amber-50/60' : invalid ? 'border-rose-400 bg-rose-50/60' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate">{item.product_name}</div>
                        {item.variant_label && <div className="text-xs font-semibold text-blue-600 mt-0.5">Phân loại: {item.variant_label}</div>}
                        <div className="text-xs text-slate-500">Đã mua {item.sold_quantity} · đã trả {item.returned_quantity} · còn {item.remaining_quantity}</div>
                        {!item.mixed_unit_ratio && <div className="text-xs text-slate-400">Giá trị hoàn dự kiến / đơn vị: {money(item.refund_unit_estimate)}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500">Trả:</span>
                        <input type="number" min="0" step="any" max={item.remaining_quantity} value={raw || ''} disabled={disabled}
                          onChange={(e) => setQty({ ...qty, [item.order_item_id || item.product_id]: e.target.value })}
                          className={`w-20 px-2 py-1.5 border rounded-lg text-right outline-none disabled:bg-slate-100 ${invalid ? 'border-rose-400' : 'border-slate-200 focus:border-rose-500'}`} />
                      </div>
                    </div>
                    {item.mixed_unit_ratio && <div className="mt-2 text-xs font-semibold text-amber-700">Sản phẩm này có nhiều quy đổi đơn vị trong cùng đơn. AutoTax chặn hoàn gộp để tránh cộng sai kho.</div>}
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Lý do trả</label>
              <input disabled={saving} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Lỗi sản phẩm, khách đổi ý..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-500 disabled:bg-slate-100" />
            </div>

            {invalidInput && (
              <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Số lượng trả phải hợp lệ và không vượt phần còn có thể trả.</div>
            )}

            <div className="bg-rose-50 rounded-xl p-4 mt-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-bold text-slate-600">Giá trị hoàn dự kiến</div>
                <div className="text-xs text-slate-500">Tối đa còn {money(remainingRefundable)} của đơn</div>
              </div>
              <span className="text-2xl font-black text-rose-600">{money(tongHoan)}</span>
            </div>

            <div className="flex gap-2 pt-4">
              <button disabled={saving} onClick={() => setDonChon(null)} className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button disabled={!canSubmit} onClick={luuTra} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 disabled:bg-slate-300 disabled:cursor-not-allowed">
                {saving ? 'Đang xử lý...' : 'Xác nhận trả hàng'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}