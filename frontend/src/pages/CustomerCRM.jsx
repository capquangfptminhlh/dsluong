import React, { useState } from 'react';
import { Search, Crown, Gift, MessageCircle, Phone, Star, Send } from 'lucide-react';

export default function CustomerCRM() {
  const [customers, _setCustomers] = useState([
    { id: 'KH001', name: 'Nguyễn Văn A', phone: '0901234567', tier: 'VIP', points: 15400, lastVisit: 'Hôm nay', totalSpent: 15500000 },
    { id: 'KH002', name: 'Trần Thị B', phone: '0988777666', tier: 'Gold', points: 5200, lastVisit: '3 ngày trước', totalSpent: 5200000 },
    { id: 'KH003', name: 'Lê Văn C', phone: '0912345678', tier: 'Silver', points: 1200, lastVisit: '1 tuần trước', totalSpent: 1200000 },
    { id: 'KH004', name: 'Phạm Thị D', phone: '0977111222', tier: 'Member', points: 50, lastVisit: '1 tháng trước', totalSpent: 50000 }
  ]);

  const getTierStyle = (tier) => {
    switch(tier) {
      case 'VIP': return 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg shadow-purple-200';
      case 'Gold': return 'bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-200';
      case 'Silver': return 'bg-gradient-to-r from-slate-300 to-slate-400 text-slate-800 shadow-lg shadow-slate-200';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-slate-800">CRM & Hạng Thành Viên</h2>
          <p className="text-slate-500 mt-1">Chăm sóc khách hàng, quản lý thẻ tích điểm và gửi tin nhắn Zalo/SMS</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold rounded-lg hover:bg-indigo-100 transition-colors">
            Cấu hình Điểm
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600 transition-colors shadow-lg shadow-blue-200">
            <Send className="w-4 h-4" /> Chiến dịch SMS/Zalo
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1">Tổng khách hàng</div>
          <div className="text-3xl font-black text-slate-800">1,245</div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1 flex items-center gap-1"><Crown className="w-4 h-4 text-purple-500"/> Khách VIP</div>
          <div className="text-3xl font-black text-purple-600">86</div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1 flex items-center gap-1"><Star className="w-4 h-4 text-amber-500"/> Khách Vàng</div>
          <div className="text-3xl font-black text-amber-500">215</div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1">Điểm đã phát hành</div>
          <div className="text-3xl font-black text-indigo-600">854,200</div>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="relative w-72">
            <Search className="w-5 h-5 absolute left-3 top-2 text-slate-400" />
            <input type="text" placeholder="Tìm khách hàng..." className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 border border-slate-200 text-slate-600 font-semibold rounded-lg hover:bg-slate-50">Lọc theo Hạng</button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-sm border-b border-slate-100">
                <th className="p-4 font-semibold whitespace-nowrap">Khách hàng</th>
                <th className="p-4 font-semibold whitespace-nowrap">Số điện thoại</th>
                <th className="p-4 font-semibold whitespace-nowrap">Hạng thẻ</th>
                <th className="p-4 font-semibold whitespace-nowrap">Điểm tích lũy</th>
                <th className="p-4 font-semibold whitespace-nowrap">Tổng chi tiêu</th>
                <th className="p-4 font-semibold whitespace-nowrap">Lần cuối mua</th>
                <th className="p-4 font-semibold text-right">Tương tác</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((t, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-bold text-slate-800">{t.name}</div>
                    <div className="text-xs text-slate-400 font-mono">{t.id}</div>
                  </td>
                  <td className="p-4 text-slate-600">{t.phone}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${getTierStyle(t.tier)}`}>
                      {t.tier}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-indigo-600">{new Intl.NumberFormat('vi-VN').format(t.points)}</td>
                  <td className="p-4 font-bold text-slate-800">{new Intl.NumberFormat('vi-VN').format(t.totalSpent)} đ</td>
                  <td className="p-4 text-slate-500">{t.lastVisit}</td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-colors" title="Nhắn Zalo">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors" title="Tặng quà">
                        <Gift className="w-4 h-4" />
                      </button>
                      <button className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center hover:bg-green-500 hover:text-white transition-colors" title="Gọi điện">
                        <Phone className="w-4 h-4" />
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
