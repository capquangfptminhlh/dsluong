import React, { useState } from 'react';
import { Search, CreditCard, Receipt } from 'lucide-react';

export default function POSPayments() {
  const [orders, _setOrders] = useState([
    { id: 'ORD-84883', customer: 'Nguyễn Văn A', total: 15000000, paid: 5000000, debt: 10000000, date: '2026-07-18', status: 'partial' },
    { id: 'ORD-92112', customer: 'Trần Thị B', total: 5000000, paid: 0, debt: 5000000, date: '2026-07-17', status: 'unpaid' },
  ]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800">Thanh Toán Đơn Hàng (POS)</h2>
          <p className="text-slate-500 mt-1">Xử lý thanh toán lần 2, thu nợ, hoặc nhận cọc cho các đơn hàng chưa hoàn tất</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="relative w-72">
            <Search className="w-5 h-5 absolute left-3 top-2 text-slate-400" />
            <input type="text" placeholder="Tìm theo mã đơn, SĐT khách..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-100">
                <th className="p-4 font-semibold whitespace-nowrap">Mã Đơn Hàng</th>
                <th className="p-4 font-semibold whitespace-nowrap">Khách Hàng</th>
                <th className="p-4 font-semibold whitespace-nowrap">Tổng Đơn</th>
                <th className="p-4 font-semibold whitespace-nowrap">Đã Thanh Toán</th>
                <th className="p-4 font-semibold whitespace-nowrap text-rose-600">Còn Nợ</th>
                <th className="p-4 font-semibold text-right">Thanh Toán Thu Thêm</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-mono font-bold text-slate-700">{o.id}</td>
                  <td className="p-4 font-bold text-slate-800">{o.customer}</td>
                  <td className="p-4 font-semibold text-slate-600">{new Intl.NumberFormat('vi-VN').format(o.total)} đ</td>
                  <td className="p-4 font-semibold text-green-600">{new Intl.NumberFormat('vi-VN').format(o.paid)} đ</td>
                  <td className="p-4 font-black text-rose-600">{new Intl.NumberFormat('vi-VN').format(o.debt)} đ</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-indigo-600 shadow-md flex items-center gap-2">
                        <Receipt className="w-4 h-4"/> Tiền Mặt
                      </button>
                      <button className="px-4 py-2 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-200 flex items-center gap-2">
                        <CreditCard className="w-4 h-4"/> Chuyển Khoản
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
