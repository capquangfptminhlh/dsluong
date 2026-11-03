import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, FileText, Ban, Receipt, CheckCircle2, AlertCircle, Clock3 } from 'lucide-react';
import API_BASE from '../config/api';

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} đ`;

function OrderStatus({ status }) {
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
        <Ban className="w-3.5 h-3.5" /> Đã hủy
      </span>
    );
  }
  if (status === 'pending_payment') {
    return (
      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <Clock3 className="w-3.5 h-3.5" /> Chờ thanh toán
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-600">
      <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành
    </span>
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [cancelReason, setCancelReason] = useState('');

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/pos`);
      setOrders(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancelOrder = async () => {
    if (!cancelReason.trim()) {
      return alert('Vui lòng nhập lý do hủy đơn!');
    }
    if (window.confirm('Bạn có chắc chắn muốn hủy đơn hàng này? Thao tác này sẽ hoàn lại kho và trừ doanh thu.')) {
      try {
        await axios.post(`${API_BASE}/api/pos/${selectedOrder.id}/cancel`, { cancel_reason: cancelReason });
        alert('Hủy đơn thành công!');
        setSelectedOrder(null);
        setCancelReason('');
        fetchOrders();
      } catch (err) {
        alert(err.response?.data?.error || 'Lỗi khi hủy đơn');
      }
    }
  };

  const handleReprint = () => {
    if (!selectedOrder) return;
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=440,height=720');
    if (!popup) {
      alert('Trình duyệt đang chặn cửa sổ in. Vui lòng cho phép pop-up rồi thử lại.');
      return;
    }

    const rows = (selectedOrder.items || []).map((item) => `
      <tr>
        <td>${escapeHtml(item.product_name || 'Sản phẩm')}</td>
        <td class="num">${escapeHtml(item.quantity)}</td>
        <td class="num">${escapeHtml(money(item.price))}</td>
        <td class="num">${escapeHtml(money((Number(item.price) || 0) * (Number(item.quantity) || 0)))}</td>
      </tr>
    `).join('');

    popup.document.write(`<!doctype html>
      <html lang="vi">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>Hóa đơn ${escapeHtml(selectedOrder.order_code)}</title>
          <style>
            *{box-sizing:border-box} body{font-family:Arial,sans-serif;color:#0f172a;margin:0;padding:22px;font-size:13px}
            h1{font-size:20px;margin:0 0 4px} .muted{color:#64748b}.meta{margin:16px 0;line-height:1.65}
            table{width:100%;border-collapse:collapse;margin-top:14px} th,td{padding:8px 4px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
            th{font-size:11px;text-transform:uppercase;color:#64748b}.num{text-align:right;white-space:nowrap}.total{font-size:18px;font-weight:700;text-align:right;margin-top:18px}
            .status{margin-top:8px;font-weight:700}.footer{margin-top:28px;text-align:center;color:#64748b;font-size:11px}
            @media print{body{padding:0}@page{margin:10mm}}
          </style>
        </head>
        <body>
          <h1>HÓA ĐƠN BÁN HÀNG</h1>
          <div class="muted">AutoTax POS</div>
          <div class="meta">
            <div><strong>Mã đơn:</strong> ${escapeHtml(selectedOrder.order_code)}</div>
            <div><strong>Thời gian:</strong> ${escapeHtml(new Date(selectedOrder.createdAt).toLocaleString('vi-VN'))}</div>
            <div><strong>Khách hàng:</strong> ${escapeHtml(selectedOrder.customer_name || 'Khách lẻ')}</div>
            ${selectedOrder.customer_phone ? `<div><strong>Điện thoại:</strong> ${escapeHtml(selectedOrder.customer_phone)}</div>` : ''}
            <div><strong>Thanh toán:</strong> ${escapeHtml(selectedOrder.payment_method || '—')}</div>
            <div class="status"><strong>Trạng thái:</strong> ${escapeHtml(selectedOrder.status === 'cancelled' ? 'Đã hủy' : selectedOrder.status === 'pending_payment' ? 'Chờ thanh toán' : 'Hoàn thành')}</div>
          </div>
          <table>
            <thead><tr><th>Mặt hàng</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4">Không có chi tiết mặt hàng.</td></tr>'}</tbody>
          </table>
          <div class="total">Tổng cộng: ${escapeHtml(money(selectedOrder.total_amount))}</div>
          ${selectedOrder.status === 'cancelled' && selectedOrder.cancel_reason ? `<div class="meta"><strong>Lý do hủy:</strong> ${escapeHtml(selectedOrder.cancel_reason)}</div>` : ''}
          <div class="footer">Bản in lại từ AutoTax POS</div>
          <script>window.addEventListener('load',()=>{window.print();});</script>
        </body>
      </html>`);
    popup.document.close();
  };

  const filteredOrders = orders.filter((o) =>
    o.order_code.toLowerCase().includes(search.toLowerCase()) ||
    (o.customer_name && o.customer_name.toLowerCase().includes(search.toLowerCase())) ||
    (o.customer_phone && o.customer_phone.includes(search))
  );

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải lịch sử đơn hàng...</div>;

  return (
    <div className="orders-page space-y-5">
      <div className="page-header orders-page-header">
        <div className="min-w-0">
          <h1 className="page-title">Lịch sử Đơn hàng</h1>
          <p className="page-subtitle">Xem lại và xử lý các hóa đơn đã bán</p>
        </div>
        <div className="orders-search relative w-full sm:w-80 sm:shrink-0">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm mã đơn, tên khách..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
      </div>

      <div className="sm:hidden space-y-3" data-testid="orders-mobile-list">
        {filteredOrders.length === 0 ? (
          <div className="surface p-6 text-center text-slate-500">Không có đơn hàng nào</div>
        ) : filteredOrders.map((order) => (
          <button
            key={order.id}
            type="button"
            onClick={() => setSelectedOrder(order)}
            className={`w-full text-left rounded-2xl border p-4 shadow-sm transition ${order.status === 'cancelled' ? 'border-red-100 bg-red-50/40' : 'border-slate-200 bg-white active:bg-slate-50'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono font-bold text-primary truncate">{order.order_code}</div>
                <div className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString('vi-VN')}</div>
              </div>
              <OrderStatus status={order.status} />
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-slate-100 pt-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-500">Khách hàng</div>
                <div className="font-semibold text-slate-800 truncate">{order.customer_name || 'Khách lẻ'}</div>
                {order.customer_phone && <div className="text-xs text-slate-500 truncate">{order.customer_phone}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Tổng tiền</div>
                <div className={`font-black whitespace-nowrap ${order.status === 'cancelled' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{money(order.total_amount)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="orders-table-shell table-shell hidden sm:block overflow-x-auto" data-testid="orders-desktop-table">
        <table className="orders-table w-full min-w-[760px] table-fixed text-left">
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="orders-cell py-4 px-5 text-xs font-semibold text-slate-500 uppercase">Mã Đơn</th>
              <th className="orders-cell py-4 px-5 text-xs font-semibold text-slate-500 uppercase">Thời gian</th>
              <th className="orders-cell py-4 px-5 text-xs font-semibold text-slate-500 uppercase">Khách hàng</th>
              <th className="orders-cell py-4 px-5 text-xs font-semibold text-slate-500 uppercase">Tổng tiền</th>
              <th className="orders-cell py-4 px-5 text-xs font-semibold text-slate-500 uppercase">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr><td colSpan="5" className="orders-cell py-8 px-5 text-center text-slate-500">Không có đơn hàng nào</td></tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`cursor-pointer transition-colors ${order.status === 'cancelled' ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-slate-50'}`}
                >
                  <td className="orders-cell py-4 px-5 font-mono font-medium text-primary whitespace-nowrap overflow-hidden text-ellipsis" title={order.order_code}>{order.order_code}</td>
                  <td className="orders-cell py-4 px-5 text-slate-600 whitespace-nowrap">{new Date(order.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="orders-cell py-4 px-5 min-w-0">
                    <div className="font-medium text-slate-800 truncate" title={order.customer_name || 'Khách lẻ'}>{order.customer_name || 'Khách lẻ'}</div>
                    {order.customer_phone && <div className="text-xs text-slate-500 truncate">{order.customer_phone}</div>}
                  </td>
                  <td className="orders-cell py-4 px-5 font-bold text-slate-800 whitespace-nowrap">
                    <span className={order.status === 'cancelled' ? 'line-through text-slate-400' : ''}>{money(order.total_amount)}</span>
                  </td>
                  <td className="orders-cell py-4 px-5 whitespace-nowrap"><OrderStatus status={order.status} /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center bg-slate-50 rounded-t-2xl">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-start gap-2">
                  <FileText className="w-6 h-6 text-primary shrink-0" />
                  <span className="break-words">Chi tiết đơn hàng {selectedOrder.order_code}</span>
                </h2>
                <p className="text-sm text-slate-500 mt-1">{new Date(selectedOrder.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              <OrderStatus status={selectedOrder.status} />
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 p-4 bg-blue-50/60 rounded-xl border border-blue-100">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500 mb-1">Khách hàng</div>
                  <div className="font-semibold text-slate-800 break-words">{selectedOrder.customer_name || 'Khách lẻ'}</div>
                  {selectedOrder.customer_phone && <div className="text-sm text-slate-600">{selectedOrder.customer_phone}</div>}
                </div>
                <div className="sm:text-right min-w-0">
                  <div className="text-sm text-slate-500 mb-1">Phương thức</div>
                  <div className="font-semibold text-slate-800 uppercase break-words">{selectedOrder.payment_method}</div>
                </div>
              </div>

              <h3 className="font-semibold text-slate-800 mb-3">Danh sách mặt hàng ({selectedOrder.items?.length || 0})</h3>
              <div className="space-y-3 mb-6">
                {selectedOrder.items && selectedOrder.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 border border-slate-100 rounded-lg">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate" title={item.product_name}>{item.product_name}</div>
                      <div className="text-sm text-slate-500 whitespace-nowrap">{money(item.price)} x {item.quantity}</div>
                    </div>
                    <div className="font-bold text-slate-800 whitespace-nowrap text-right">{money(item.price * item.quantity)}</div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center gap-4 pt-4 border-t border-slate-200">
                <span className="font-bold text-slate-600 text-base sm:text-lg">Tổng cộng:</span>
                <span className="text-xl sm:text-2xl font-black text-slate-800 whitespace-nowrap">{money(selectedOrder.total_amount)}</span>
              </div>

              {selectedOrder.status === 'cancelled' && selectedOrder.cancel_reason && (
                <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-100 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-red-700 text-sm">Lý do hủy đơn:</div>
                    <div className="text-red-600 mt-1 break-words">{selectedOrder.cancel_reason}</div>
                  </div>
                </div>
              )}

              {selectedOrder.status !== 'cancelled' && (
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <h3 className="font-semibold text-red-600 mb-2">Tiến hành Hủy Đơn</h3>
                  <p className="text-sm text-slate-500 mb-3">Lưu ý: Hàng hóa sẽ được cộng lại vào kho và doanh thu sẽ bị trừ đi.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Nhập lý do hủy đơn (bắt buộc)..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="min-w-0 flex-1 px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                    <button
                      onClick={handleCancelOrder}
                      className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Ban className="w-4 h-4" /> Xác nhận Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-2 sm:gap-3 rounded-b-2xl">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-5 sm:px-6 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Đóng
              </button>
              <button
                onClick={handleReprint}
                className="px-5 sm:px-6 py-2 bg-primary hover:bg-indigo-600 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
              >
                <Receipt className="w-4 h-4" /> In lại hóa đơn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
