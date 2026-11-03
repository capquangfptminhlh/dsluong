import React, { useState, useEffect } from 'react';
import { FileText, DollarSign, Activity, Download, BarChart3, Receipt, Box, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('sales');
  const [loading, setLoading] = useState(true);

  // Data states
  const [_orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [pnlData, setPnlData] = useState({ revenue: 0, expense: 0, profit: 0, net_revenue: 0, cost_of_goods: 0, gross_profit: 0, operating_expense: 0, net_profit: 0 });
  const [_cashFlows, setCashFlows] = useState([]);
  const [profitByProduct, setProfitByProduct] = useState([]);
  const [inventoryValuation, setInventoryValuation] = useState({ summary: {}, items: [] });
  const [_topSlowSelling, setTopSlowSelling] = useState({ topSelling: [], slowSelling: [] });
  
  // Dashboard state
  const [dashboard, setDashboard] = useState({
    overview: { totalRevenue: 0, totalOrders: 0 },
    chartData: [],
    topProducts: []
  });

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const [ordersRes, productsRes, pnlRes, cashFlowRes, dashboardRes, profitRes, valRes, topSlowRes] = await Promise.all([
        axios.get(`${API_BASE}/api/pos`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/products`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/finance/pnl`).catch(() => ({ data: { revenue: 0, expense: 0, profit: 0 } })),
        axios.get(`${API_BASE}/api/finance/cash-flows`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/reports/dashboard`).catch(() => ({ data: null })),
        axios.get(`${API_BASE}/api/reports/profit-by-product`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/reports/inventory-valuation`).catch(() => ({ data: { summary: {}, items: [] } })),
        axios.get(`${API_BASE}/api/reports/top-slow-selling`).catch(() => ({ data: { topSelling: [], slowSelling: [] } }))
      ]);

      setOrders(ordersRes.data || []);
      setProducts(productsRes.data || []);
      setPnlData(pnlRes.data || { revenue: 0, expense: 0, profit: 0 });
      setCashFlows(cashFlowRes.data || []);
      if (dashboardRes.data) {
        setDashboard(dashboardRes.data);
      }
      setProfitByProduct(profitRes.data || []);
      setInventoryValuation(valRes.data || { summary: {}, items: [] });
      setTopSlowSelling(topSlowRes.data || { topSelling: [], slowSelling: [] });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Lợi Nhuận Từng Sản Phẩm
      const profitData = (profitByProduct.length > 0 ? profitByProduct : products).map((item, idx) => ({
        'STT': idx + 1,
        'Mã SKU': item.sku || '---',
        'Tên Sản Phẩm': item.name || item.product_name,
        'Đã Bán': item.total_sold || 0,
        'Tổng Doanh Thu (đ)': item.total_revenue || 0,
        'Tổng Giá Vốn (đ)': item.total_cost || 0,
        'Lợi Nhuận Gộp (đ)': item.profit || 0,
        'Tỷ Suất Lợi Nhuận (%)': (item.margin_percent || 0) + '%'
      }));
      const wsProfit = XLSX.utils.json_to_sheet(profitData);
      XLSX.utils.book_append_sheet(wb, wsProfit, 'Loi_Nhuan_Mat_Hang');

      // Sheet 2: Định Giá Tồn Kho & Đọng Vốn
      const invData = (inventoryValuation.items.length > 0 ? inventoryValuation.items : products).map((item, idx) => ({
        'STT': idx + 1,
        'Mã SKU': item.sku || '---',
        'Tên Sản Phẩm': item.name,
        'Danh Mục': item.category || 'Khác',
        'Tồn Kho': item.stock || 0,
        'Giá Vốn (đ)': item.cost_price || 0,
        'Giá Bán (đ)': item.price || 0,
        'Tổng Vốn Đọng (đ)': (item.stock || 0) * (item.cost_price || 0),
        'Giá Trị Bán Dự Kiến (đ)': (item.stock || 0) * (item.price || 0)
      }));
      const wsInv = XLSX.utils.json_to_sheet(invData);
      XLSX.utils.book_append_sheet(wb, wsInv, 'Gia_Tri_Ton_Kho');

      XLSX.writeFile(wb, `Bao_Cao_KiotViet_AutoTax_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (err) {
      console.error(err);
      alert('Lỗi xuất Excel: ' + err.message);
    }
  };

  const formatMoney = (amount) => new Intl.NumberFormat('vi-VN').format(amount || 0) + ' ₫';

  // SALES REPORT LOGIC
  const renderSalesReport = () => {
    const { overview, chartData, topProducts } = dashboard;
    
    // Custom Tooltip for Recharts
    const CustomTooltip = ({ active, payload, label }) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-slate-800 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-xl">
            <p>{`Ngày: ${label}`}</p>
            <p className="text-blue-400">{`Doanh thu: ${formatMoney(payload[0].value)}`}</p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><DollarSign className="w-7 h-7"/></div>
            <div>
              <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">Tổng Doanh Thu</div>
              <div className="text-3xl font-black text-slate-800">{formatMoney(overview.totalRevenue)}</div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Receipt className="w-7 h-7"/></div>
            <div>
              <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">Tổng Đơn Hàng Thành Công</div>
              <div className="text-3xl font-black text-slate-800">{overview.totalOrders} <span className="text-sm text-slate-400 font-medium lowercase">đơn</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 mb-6">Biểu đồ doanh số (7 ngày gần nhất)</h3>
            <div className="w-full h-[300px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12, fontWeight: 'bold'}} dy={10} />
                    <YAxis 
                      axisLine={false} tickLine={false} tick={{fill: '#94A3B8', fontSize: 12, fontWeight: 'bold'}}
                      tickFormatter={(value) => value === 0 ? '0' : `${(value / 1000000).toFixed(1)}M`}
                      width={60}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{fill: '#F1F5F9'}} />
                    <Bar dataKey="revenue" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">Chưa có dữ liệu bán hàng.</div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-amber-500 fill-amber-500" /> Top 5 Bán Chạy</h3>
            <div className="space-y-4">
              {topProducts.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">Chưa có sản phẩm nào được bán</div>
              ) : (
                topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-700 text-sm truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium">Đã bán: <span className="text-slate-700">{p.sold}</span></div>
                    </div>
                    <div className="font-black text-emerald-600 text-sm">{formatMoney(p.revenue)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // INVENTORY REPORT LOGIC
  const renderInventoryReport = () => {
    const totalItems = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5).length;
    const outOfStock = products.filter(p => p.stock <= 0).length;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng Tồn Kho</div>
            <div className="text-2xl font-black text-slate-800">{totalItems} <span className="text-xs text-slate-400 font-medium">sản phẩm</span></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Tổng Giá Trị Vốn</div>
            <div className="text-2xl font-black text-emerald-600">{formatMoney(totalValue)}</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Sắp Hết Hàng</div>
            <div className="text-2xl font-black text-amber-500">{lowStock} <span className="text-xs text-slate-400 font-medium">SKU</span></div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Hết Hàng</div>
            <div className="text-2xl font-black text-rose-600">{outOfStock} <span className="text-xs text-slate-400 font-medium">SKU</span></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50"><h3 className="font-black text-slate-800">Chi tiết tồn kho</h3></div>
          <table className="w-full text-left">
            <thead className="bg-white text-slate-500 text-[11px] uppercase font-black border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Sản Phẩm</th>
                <th className="px-6 py-4 text-center">Tồn Kho</th>
                <th className="px-6 py-4 text-right">Đơn Giá</th>
                <th className="px-6 py-4 text-right">Giá Trị Tồn</th>
                <th className="px-6 py-4 text-center">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-10 text-slate-400">Không có sản phẩm nào.</td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-bold text-slate-700">{p.name}</td>
                  <td className="px-6 py-4 text-center font-black text-slate-800">{p.stock}</td>
                  <td className="px-6 py-4 text-right font-medium text-slate-500">{formatMoney(p.price)}</td>
                  <td className="px-6 py-4 text-right font-black text-emerald-600">{formatMoney(p.stock * p.price)}</td>
                  <td className="px-6 py-4 text-center">
                    {p.stock <= 0 ? <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">Hết hàng</span> :
                     p.stock <= 5 ? <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">Sắp hết</span> :
                     <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">Còn hàng</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // P&L REPORT LOGIC
  const renderPnlReport = () => {
    const netRevenue=Number(pnlData.net_revenue ?? pnlData.revenue)||0;
    const costOfGoods=Number(pnlData.cost_of_goods)||0;
    const grossProfit=Number(pnlData.gross_profit)||(netRevenue-costOfGoods);
    const operatingExpense=Number(pnlData.operating_expense)||0;
    const otherIncome=Number(pnlData.other_income)||0;
    const netProfit=Number(pnlData.net_profit ?? pnlData.profit)||(grossProfit+otherIncome-operatingExpense);
    const grossMargin=Number(pnlData.gross_margin_percent)||0;
    const netMargin=Number(pnlData.net_margin_percent)||0;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {[
            ['Doanh thu thuần',netRevenue,'text-blue-600'],
            ['Giá vốn',costOfGoods,'text-amber-600'],
            ['Lợi nhuận gộp',grossProfit,grossProfit<0?'text-rose-600':'text-emerald-600'],
            ['Chi phí vận hành',operatingExpense,'text-rose-600'],
            ['Lãi / Lỗ ròng',netProfit,netProfit<0?'text-rose-600':'text-teal-600'],
          ].map(([label,value,tone])=>(
            <div key={label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs font-black text-slate-500 uppercase tracking-wider">{label}</div>
              <div className={`mt-2 text-2xl font-black ${tone}`}>{formatMoney(value)}</div>
            </div>
          ))}
        </div>
        <div className={`p-6 rounded-3xl border ${netProfit<0?'bg-rose-50 border-rose-200':'bg-emerald-50 border-emerald-200'}`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm font-black uppercase tracking-wider text-slate-600">Kết quả kinh doanh</div>
              <div className={`mt-2 text-4xl font-black ${netProfit<0?'text-rose-700':'text-emerald-700'}`}>
                {netProfit<0?'LỖ ':'LÃI '}{formatMoney(Math.abs(netProfit))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/80 px-4 py-3"><div className="text-slate-500">Biên lãi gộp</div><div className="font-black">{grossMargin.toFixed(1)}%</div></div>
              <div className="rounded-xl bg-white/80 px-4 py-3"><div className="text-slate-500">Biên lãi ròng</div><div className="font-black">{netMargin.toFixed(1)}%</div></div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-600">Doanh thu thuần - Giá vốn = Lợi nhuận gộp; Lợi nhuận gộp + Thu khác - Chi phí vận hành = Lãi/Lỗ ròng. Tiền nhập hàng không bị trừ lần hai.</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-sm">
          <div className="flex justify-between"><span>Doanh thu trước hàng trả</span><strong>{formatMoney(pnlData.gross_sales || netRevenue)}</strong></div>
          <div className="flex justify-between text-rose-600"><span>Hàng bán bị trả</span><strong>- {formatMoney(pnlData.sales_returns || 0)}</strong></div>
          <div className="flex justify-between border-t pt-3"><span>Doanh thu thuần</span><strong>{formatMoney(netRevenue)}</strong></div>
          <div className="flex justify-between text-amber-700"><span>Giá vốn hàng bán</span><strong>- {formatMoney(costOfGoods)}</strong></div>
          <div className="flex justify-between text-emerald-700"><span>Lợi nhuận gộp</span><strong>{formatMoney(grossProfit)}</strong></div>
          <div className="flex justify-between"><span>Thu khác</span><strong>+ {formatMoney(otherIncome)}</strong></div>
          <div className="flex justify-between text-rose-600"><span>Chi phí vận hành</span><strong>- {formatMoney(operatingExpense)}</strong></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      
      {/* Header */}
      <div className="p-8 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 z-10 relative">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
              <FileText className="w-6 h-6" />
            </div>
            Hệ Thống Báo Cáo Chuyên Sâu
          </h1>
          <p className="text-slate-500 mt-1.5 font-medium ml-14">Hệ thống phân tích, báo cáo bán hàng và dòng tiền Real-time.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('pnl')}
            className={`px-4 py-2.5 rounded-xl border font-black text-sm ${Number(pnlData.net_profit ?? pnlData.profit) < 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
          >
            Lãi/Lỗ: {formatMoney(pnlData.net_profit ?? pnlData.profit ?? 0)}
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-md shadow-emerald-600/20"
          >
            <Download className="w-4 h-4" /> Xuất Báo Cáo Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="px-4 sm:px-8 pt-6 bg-white border-b border-slate-200 shrink-0 flex gap-6 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('sales')}
          className={`pb-4 font-bold text-sm transition-colors relative ${activeTab === 'sales' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Báo Cáo Bán Hàng</div>
          {activeTab === 'sales' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('inventory')}
          className={`pb-4 font-bold text-sm transition-colors relative ${activeTab === 'inventory' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Box className="w-4 h-4"/> Báo Cáo Tồn Kho</div>
          {activeTab === 'inventory' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('pnl')}
          className={`pb-4 font-bold text-sm transition-colors relative ${activeTab === 'pnl' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Activity className="w-4 h-4"/> Báo Cáo Lãi Lỗ (P&L)</div>
          {activeTab === 'pnl' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 font-bold text-lg">Đang tổng hợp báo cáo...</div>
        ) : (
          <>
            {activeTab === 'sales' && renderSalesReport()}
            {activeTab === 'inventory' && renderInventoryReport()}
            {activeTab === 'pnl' && renderPnlReport()}
          </>
        )}
      </div>

    </div>
  );
}
