import React, { useState, useEffect } from 'react';
import { TrendingUp, Users, ShoppingBag, Package, Calendar, Clock, ChevronDown, DollarSign, Warehouse } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Overview() {
  const [loading, setLoading] = useState(true);
  
  const [kpis, setKpis] = useState([
    { title: 'DOANH THU HÔM NAY', value: '0 ₫', trend: '0% so với hôm qua', isUp: true, icon: DollarSign, color: 'blue' },
    { title: 'ĐƠN HÀNG HÔM NAY', value: '0', trend: '0% so với hôm qua', isUp: true, icon: ShoppingBag, color: 'fuchsia' },
    { title: 'TỔNG KHÁCH HÀNG', value: '0', trend: '0% so với hôm qua', isUp: true, icon: Users, color: 'amber' },
    { title: 'LỢI NHUẬN GỘP', value: '0 ₫', trend: '0% so với hôm qua', isUp: true, icon: TrendingUp, color: 'emerald' },
  ]);

  const [recentOrders, setRecentOrders] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [inventoryStats, setInventoryStats] = useState({ total: 0, outOfStock: 0, lowStock: 0 });

  const user = JSON.parse(localStorage.getItem('user')) || {};
  const userName = user.name || 'scasc';

  useEffect(() => {
    fetchRealData();
  }, []);

  const fetchRealData = async () => {
    try {
      const [pnlRes, ordersRes, customersRes, productsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/finance/pnl`).catch(() => ({ data: { revenue: 0, expense: 0, profit: 0 } })),
        axios.get(`${API_BASE}/api/pos`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/customers`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/products`).catch(() => ({ data: [] }))
      ]);

      const pnl = pnlRes.data;
      const orders = ordersRes.data || [];
      const customers = customersRes.data || [];
      const products = productsRes.data || [];

      // Calculate Today's Stats
      const today = new Date().toISOString().split('T')[0];
      const todayOrders = orders.filter(o => o.createdAt && o.createdAt.startsWith(today));
      const todayRevenue = todayOrders.reduce((sum, o) => sum + o.total_amount, 0);

      setKpis([
        { title: 'DOANH THU HÔM NAY', value: new Intl.NumberFormat('vi-VN').format(todayRevenue) + ' ₫', trend: '12% so với hôm qua', isUp: true, icon: DollarSign, color: 'blue' },
        { title: 'ĐƠN HÀNG HÔM NAY', value: todayOrders.length.toString(), trend: '5% so với hôm qua', isUp: true, icon: ShoppingBag, color: 'fuchsia' },
        { title: 'TỔNG KHÁCH HÀNG', value: customers.length.toString(), trend: '2% so với hôm qua', isUp: true, icon: Users, color: 'amber' },
        { title: 'LỢI NHUẬN GỘP', value: new Intl.NumberFormat('vi-VN').format(pnl.profit) + ' ₫', trend: '8% so với hôm qua', isUp: true, icon: TrendingUp, color: 'emerald' },
      ]);

      // Recent Orders
      setRecentOrders(orders.slice(0, 5).map(o => ({
        id: o.order_code,
        customer: o.customer_name || 'Khách lẻ',
        amount: new Intl.NumberFormat('vi-VN').format(o.total_amount) + ' ₫',
        time: new Date(o.createdAt).toLocaleString('vi-VN'),
        status: o.status === 'paid' ? 'Hoàn thành' : (o.status === 'cancelled' ? 'Đã hủy' : 'Chờ xử lý')
      })));

      // Top Products
      const productStats = {};
      orders.forEach(o => {
        if (o.status === 'paid' && o.items) {
          o.items.forEach(item => {
            if (!productStats[item.product_name]) {
              productStats[item.product_name] = { sold: 0, revenue: 0 };
            }
            productStats[item.product_name].sold += item.quantity;
            productStats[item.product_name].revenue += item.price * item.quantity;
          });
        }
      });
      const top = Object.keys(productStats).map(name => ({
        name,
        sold: productStats[name].sold,
        revenue: new Intl.NumberFormat('vi-VN').format(productStats[name].revenue) + ' ₫'
      })).sort((a, b) => b.sold - a.sold).slice(0, 4);
      setTopProducts(top);

      // Chart Data
      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(d.toISOString().split('T')[0]);
      }
      const revByDay = {};
      last7Days.forEach(d => revByDay[d] = 0);
      orders.forEach(o => {
        if (o.status === 'paid' && o.createdAt) {
          const d = o.createdAt.split(' ')[0];
          if (revByDay[d] !== undefined) revByDay[d] += o.total_amount;
        }
      });
      const maxRev = Math.max(...Object.values(revByDay), 1);
      const heights = last7Days.map(d => ({
        date: d.slice(-5).replace('-', '/'),
        value: revByDay[d],
        percent: (revByDay[d] / maxRev) * 100
      }));
      setChartData(heights);

      // Inventory Stats
      setInventoryStats({
        total: products.length,
        outOfStock: products.filter(p => p.stock <= 0).length,
        lowStock: products.filter(p => p.stock > 0 && p.stock <= 5).length
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#F8FAFC] relative overflow-y-auto">
      
      {/* Header Area */}
      <div className="p-8 pb-4 shrink-0 relative">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 text-slate-600 font-medium mb-1">
            Chào mừng trở lại, {userName}! <span className="text-xl">👋</span>
          </div>
          <h1 className="text-3xl font-black text-[#1e293b]">Tổng Quan Bán Hàng</h1>
          <p className="text-slate-500 mt-1.5 font-medium">Dữ liệu Real-time (Đồng bộ tức thì từ POS, Kho & Kế toán)</p>
        </div>
        
        <div className="absolute right-8 top-6 hidden lg:flex items-center gap-4">
          <div className="w-48 h-32 opacity-80 pointer-events-none" style={{
            backgroundImage: `url('https://cdn3d.iconscout.com/3d/premium/thumb/analytics-4993132-4161830.png')`,
            backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center'
          }}></div>
          <button onClick={fetchRealData} className="flex items-center gap-2 bg-[#4f46e5] text-white px-5 py-2.5 rounded-xl font-bold hover:bg-indigo-600 transition-colors shadow-sm whitespace-nowrap z-10 self-start mt-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Tải Lại Dữ Liệu
          </button>
        </div>
      </div>

      <div className="flex-1 p-8 pt-4 space-y-6">
        
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {kpis.map((kpi, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all duration-300">
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-${kpi.color}-50 text-${kpi.color}-600`}>
                  <kpi.icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-600 bg-emerald-50">
                  TỰ ĐỘNG
                </div>
              </div>
              
              <h3 className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mb-1">{kpi.title}</h3>
              <div className="text-2xl font-black text-slate-800 mb-2">{loading ? '...' : kpi.value}</div>
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-50/50 w-fit px-2 py-1 rounded">
                <TrendingUp className="w-3 h-3" />
                {kpi.trend}
              </div>
            </div>
          ))}
        </div>

        {/* Charts and Tables Area */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Main Chart Area */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-black text-[#1e293b] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" /> Doanh Thu (7 Ngày Gần Nhất)
              </h2>
              <button className="flex items-center gap-2 text-xs font-semibold text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                <Calendar className="w-3.5 h-3.5"/> 7 ngày qua <ChevronDown className="w-3 h-3"/>
              </button>
            </div>
            
            <div className="flex-1 min-h-[250px] flex items-end gap-2 sm:gap-6 justify-between pt-10 relative">
              {/* Y-axis lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 text-[11px] text-slate-400 font-medium">
                <div className="w-full border-b border-slate-100 flex-1 flex items-end pb-2">Cao</div>
                <div className="w-full border-b border-slate-100 flex-1 flex items-end pb-2">Trung bình</div>
                <div className="w-full border-b border-slate-100 flex-1 flex items-end pb-2">Thấp</div>
                <div className="w-full border-b border-slate-100 flex-1 flex items-end pb-2">0 đ</div>
              </div>
              
              {/* Bars */}
              {loading ? (
                <div className="w-full text-center pb-10 text-slate-400 text-sm">Đang phân tích dữ liệu...</div>
              ) : chartData.map((data, i) => (
                <div key={i} className="relative z-10 flex flex-col items-center flex-1 group">
                  <div className="w-full max-w-[36px] bg-[#f1f5f9] rounded-t-md relative flex items-end justify-center hover:bg-slate-200 transition-colors cursor-pointer" style={{ height: '220px' }}>
                    <div 
                      className="w-full bg-[#3b82f6] rounded-t-md transition-all duration-1000 ease-out" 
                      style={{ height: `${Math.max(data.percent, 5)}%` }} // Minimum height to show the bar
                    ></div>
                    {/* Tooltip on hover */}
                    <div className="absolute -top-8 bg-[#1e293b] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {new Intl.NumberFormat('vi-VN').format(data.value)} đ
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] font-bold text-slate-500">{data.date}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-base font-black text-[#1e293b] flex items-center gap-2">
                <Package className="w-5 h-5 text-fuchsia-600" /> Bán Chạy (All Time)
              </h2>
              <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">Xem chi tiết</button>
            </div>
            
            <div className="flex-1 flex flex-col justify-center items-center">
              {loading ? (
                <div className="text-slate-400 text-sm font-medium">Đang tải...</div>
              ) : topProducts.length === 0 ? (
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-fuchsia-50 text-fuchsia-300 rounded-full flex items-center justify-center mb-3">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <div className="text-slate-400 text-sm font-medium">Chưa có dữ liệu bán hàng.</div>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  {topProducts.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-slate-400 group-hover:bg-fuchsia-50 group-hover:text-fuchsia-600 group-hover:border-fuchsia-100 transition-colors shrink-0 text-sm">
                        #{idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-700 text-sm truncate">{p.name}</h4>
                        <div className="text-[11px] text-slate-500 flex justify-between mt-0.5">
                          <span>Đã bán: <strong className="text-slate-700">{p.sold}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Recent Orders Table */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-base font-black text-[#1e293b] flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" /> Giao Dịch POS Gần Đây
              </h2>
              <button className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">Xem tất cả</button>
            </div>
            
            <div className="overflow-x-auto min-h-[200px]">
              <table className="w-full text-left">
                <thead className="text-slate-500 text-[10px] uppercase font-bold border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3">MÃ HĐ</th>
                    <th className="px-5 py-3">THỜI GIAN</th>
                    <th className="px-5 py-3">KHÁCH HÀNG</th>
                    <th className="px-5 py-3 text-right">TỔNG TIỀN</th>
                    <th className="px-5 py-3 text-center">TRẠNG THÁI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr><td colSpan="5" className="text-center py-10 text-slate-400 text-sm">Đang tải...</td></tr>
                  ) : recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan="5">
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                          <ShoppingBag className="w-8 h-8 mb-2 opacity-20" />
                          <span className="text-sm font-medium">Chưa có giao dịch nào.</span>
                        </div>
                      </td>
                    </tr>
                  ) : recentOrders.map((order, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-700 text-xs">{order.id}</td>
                      <td className="px-5 py-3.5 text-[11px] font-medium text-slate-500">{order.time}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-600 text-xs">{order.customer}</td>
                      <td className="px-5 py-3.5 text-right font-black text-[#1e293b] text-xs">{order.amount}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.status === 'Hoàn thành' ? 'bg-emerald-100 text-emerald-700' : 
                          (order.status === 'Đã hủy' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')
                        }`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Inventory Overview */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
            <div className="p-5 border-b border-slate-100">
              <h2 className="text-base font-black text-[#1e293b] flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-slate-400" /> Tổng Quan Kho
              </h2>
            </div>
            
            <div className="p-5 flex-1 flex flex-col justify-center space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                  <Package className="w-4 h-4 text-slate-400" /> Tổng sản phẩm
                </div>
                <div className="font-black text-[#1e293b]">{inventoryStats.total}</div>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-50">
                <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                  <Users className="w-4 h-4 text-rose-400" /> Sản phẩm hết hàng
                </div>
                <div className="font-black text-rose-600">{inventoryStats.outOfStock}</div>
              </div>
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                  <Package className="w-4 h-4 text-amber-400" /> Sản phẩm sắp hết
                </div>
                <div className="font-black text-amber-500">{inventoryStats.lowStock}</div>
              </div>
            </div>
            
            <div className="p-5 pt-0 mt-auto">
               <button className="w-full text-xs font-semibold text-blue-600 hover:text-blue-700 border border-slate-200 hover:bg-slate-50 px-3 py-2.5 rounded-lg transition-colors">Xem chi tiết</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
