import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, FileText, Ban, Receipt, CheckCircle2, AlertCircle } from 'lucide-react';
import API_BASE from '../config/api';

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
      return alert("Vui lòng nhập lý do hủy đơn!");
    }
    if (window.confirm("Bạn có chắc chắn muốn hủy đơn hàng này? Thao tác này sẽ hoàn lại kho và trừ doanh thu.")) {
      try {
        await axios.post(`${API_BASE}/api/pos/${selectedOrder.id}/cancel`, { cancel_reason: cancelReason });
        alert("Hủy đơn thành công!");
        setSelectedOrder(null);
        setCancelReason('');
        fetchOrders();
      } catch (err) {
        alert(err.response?.data?.error || "Lỗi khi hủy đơn");
      }
    }
  };

  const filteredOrders = orders.filter(o => 
    o.order_code.toLowerCase().includes(search.toLowerCase()) || 
    (o.customer_name && o.customer_name.toLowerCase().includes(search.toLowerCase())) ||
    (o.customer_phone && o.customer_phone.includes(search))
  );

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải lịch sử đơn hàng...</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Lịch sử Hóa đơn Bán thuốc</h1>
          <p className="text-slate-500 text-sm mt-1">Xem lại và tra cứu các đơn thuốc đã xuất bán tại quầy</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Tìm mã đơn, tên khách..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase">Mã Đơn</th>
              <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase">Thời gian</th>
              <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase">Khách hàng</th>
              <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase">Tổng tiền</th>
              <th className="py-4 px-6 text-xs font-semibold text-slate-500 uppercase">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.length === 0 ? (
              <tr><td colSpan="5" className="py-8 text-center text-slate-500">Không có đơn hàng nào</td></tr>
            ) : (
              filteredOrders.map(order => (
                <tr 
                  key={order.id} 
                  onClick={() => setSelectedOrder(order)}
                  className={`cursor-pointer transition-colors ${order.status === 'cancelled' ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-slate-50'}`}
                >
                  <td className="py-4 px-6 font-mono font-medium text-primary">{order.order_code}</td>
                  <td className="py-4 px-6 text-slate-600">{new Date(order.createdAt).toLocaleString('vi-VN')}</td>
                  <td className="py-4 px-6">
                    <div className="font-medium text-slate-800">{order.customer_name || 'Khách lẻ'}</div>
                    {order.customer_phone && <div className="text-xs text-slate-500">{order.customer_phone}</div>}
                  </td>
                  <td className="py-4 px-6 font-bold text-slate-800">
                    {order.status === 'cancelled' ? (
                      <span className="line-through text-slate-400">{new Intl.NumberFormat('vi-VN').format(order.total_amount)} đ</span>
                    ) : (
                      <span>{new Intl.NumberFormat('vi-VN').format(order.total_amount)} đ</span>
                    )}
                  </td>
                  <td className="py-4 px-6">
                    {order.status === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                        <Ban className="w-3.5 h-3.5" /> Đã hủy
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ORDER DETAILS MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-primary" />
                  Chi tiết đơn hàng {selectedOrder.order_code}
                </h2>
                <p className="text-sm text-slate-500 mt-1">{new Date(selectedOrder.createdAt).toLocaleString('vi-VN')}</p>
              </div>
              {selectedOrder.status === 'cancelled' && (
                <span className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-sm font-medium bg-red-100 text-red-600">
                  <Ban className="w-4 h-4" /> Đã hủy
                </span>
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex justify-between items-center mb-6 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                <div>
                  <div className="text-sm text-slate-500 mb-1">Khách hàng</div>
                  <div className="font-semibold text-slate-800">{selectedOrder.customer_name || 'Khách lẻ'}</div>
                  {selectedOrder.customer_phone && <div className="text-sm text-slate-600">{selectedOrder.customer_phone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500 mb-1">Phương thức</div>
                  <div className="font-semibold text-slate-800 uppercase">{selectedOrder.payment_method}</div>
                </div>
              </div>

              <h3 className="font-semibold text-slate-800 mb-3">Danh sách mặt hàng ({selectedOrder.items?.length || 0})</h3>
              <div className="space-y-3 mb-6">
                {selectedOrder.items && selectedOrder.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg">
                    <div>
                      <div className="font-medium text-slate-800">{item.product_name}</div>
                      <div className="text-sm text-slate-500">{new Intl.NumberFormat('vi-VN').format(item.price)} đ x {item.quantity}</div>
                    </div>
                    <div className="font-bold text-slate-800">
                      {new Intl.NumberFormat('vi-VN').format(item.price * item.quantity)} đ
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                <span className="font-bold text-slate-600 text-lg">Tổng cộng:</span>
                <span className="text-2xl font-black text-slate-800">
                  {new Intl.NumberFormat('vi-VN').format(selectedOrder.total_amount)} đ
                </span>
              </div>

              {selectedOrder.status === 'cancelled' && selectedOrder.cancel_reason && (
                <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-100 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <div>
                    <div className="font-semibold text-red-700 text-sm">Lý do hủy đơn:</div>
                    <div className="text-red-600 mt-1">{selectedOrder.cancel_reason}</div>
                  </div>
                </div>
              )}

              {selectedOrder.status !== 'cancelled' && (
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <h3 className="font-semibold text-red-600 mb-2">Tiến hành Hủy Đơn</h3>
                  <p className="text-sm text-slate-500 mb-3">Lưu ý: Hàng hóa sẽ được cộng lại vào kho và doanh thu sẽ bị trừ đi.</p>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Nhập lý do hủy đơn (bắt buộc)..." 
                      value={cancelReason}
                      onChange={e => setCancelReason(e.target.value)}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                    <button 
                      onClick={handleCancelOrder}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Ban className="w-4 h-4" /> Xác nhận Hủy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Đóng
              </button>
              {selectedOrder.status !== 'cancelled' && (
                <button 
                  onClick={() => alert("Tính năng In lại hóa đơn đang được phát triển.")}
                  className="px-6 py-2 bg-primary hover:bg-indigo-600 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
                >
                  <Receipt className="w-4 h-4" /> In lại hóa đơn
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
