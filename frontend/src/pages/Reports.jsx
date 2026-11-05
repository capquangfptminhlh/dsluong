import React, { useState, useEffect } from 'react';
import { FileText, TrendingUp, TrendingDown, DollarSign, Package, Users, Activity, Download, Calendar, BarChart3, Receipt, Box, Star, AlertTriangle, ArrowUpRight, ArrowDownRight, PieChart as PieChartIcon } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import * as XLSX from 'xlsx';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Reports() {
  const [activeTab, setActiveTab] = useState('sales');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(true);

  // Data states
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [pnlData, setPnlData] = useState({ revenue: 0, expense: 0, profit: 0 });
  const [cashFlows, setCashFlows] = useState([]);
  const [profitByProduct, setProfitByProduct] = useState([]);
  const [inventoryValuation, setInventoryValuation] = useState({ summary: {}, items: [] });
  const [topSlowSelling, setTopSlowSelling] = useState({ topSelling: [], slowSelling: [] });
  
  // Dashboard state
  const [dashboard, setDashboard] = useState({
    overview: { totalRevenue: 0, totalOrders: 0 },
    chartData: [],
    topProducts: []
  });

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const query = dateRange.start && dateRange.end ? `?startDate=${dateRange.start}&endDate=${dateRange.end}` : '';
      const [ordersRes, productsRes, pnlRes, cashFlowRes, dashboardRes, profitRes, valRes, topSlowRes] = await Promise.all([
        axios.get(`${API_BASE}/api/pos`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/products`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/finance/pnl${query}`).catch(() => ({ data: { revenue: 0, expense: 0, profit: 0 } })),
        axios.get(`${API_BASE}/api/finance/cash-flows`).catch(() => ({ data: [] })),
        axios.get(`${API_BASE}/api/reports/dashboard${query}`).catch(() => ({ data: null })),
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

  
  const handleExportPDF = async () => {
    const reportElement = document.getElementById('report-content');
    if (!reportElement) return;
    try {
      const canvas = await html2canvas(reportElement, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Bao_Cao_Nha_Thuoc_Nhan_Duc_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Lỗi xuất PDF: ' + err.message);
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

      XLSX.writeFile(wb, `Bao_Cao_Nha_Thuoc_Nhan_Duc_${new Date().toISOString().slice(0,10)}.xlsx`);
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
          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] flex items-center gap-4">
            <div className="w-14 h-14 rounded-[var(--radius-md)] bg-blue-50 text-blue-600 flex items-center justify-center"><DollarSign className="w-7 h-7"/></div>
            <div>
              <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider">Tổng Doanh Thu</div>
              <div className="text-3xl font-black text-[var(--fg)]">{formatMoney(overview.totalRevenue)}</div>
            </div>
          </div>
          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] flex items-center gap-4">
            <div className="w-14 h-14 rounded-[var(--radius-md)] bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Receipt className="w-7 h-7"/></div>
            <div>
              <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider">Tổng Đơn Hàng Thành Công</div>
              <div className="text-3xl font-black text-[var(--fg)]">{overview.totalOrders} <span className="text-sm text-[var(--muted)] font-medium lowercase">đơn</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)]">
            <h3 className="font-black text-[var(--fg)] mb-6">Biểu đồ doanh số (7 ngày gần nhất)</h3>
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
                <div className="w-full h-full flex items-center justify-center text-[var(--muted)] font-medium">Chưa có dữ liệu bán hàng.</div>
              )}
            </div>
          </div>

          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)]">
            <h3 className="font-black text-[var(--fg)] mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-amber-500 fill-amber-500" /> Top 5 Bán Chạy</h3>
            <div className="space-y-4">
              {topProducts.length === 0 ? (
                <div className="text-center py-10 text-[var(--muted)] text-sm">Chưa có sản phẩm nào được bán</div>
              ) : (
                topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-[var(--fg-2)]' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-[var(--surface-warm)] text-[var(--muted)]'}`}>
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[var(--fg)] text-sm truncate">{p.name}</div>
                      <div className="text-[11px] text-[var(--muted)] font-medium">Đã bán: <span className="text-[var(--fg)]">{p.sold}</span></div>
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
          <div className="bg-[var(--surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)]">
            <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-1">Tổng Tồn Kho</div>
            <div className="text-2xl font-black text-[var(--fg)]">{totalItems} <span className="text-xs text-[var(--muted)] font-medium">sản phẩm</span></div>
          </div>
          <div className="bg-[var(--surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)]">
            <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-1">Tổng Giá Trị Vốn</div>
            <div className="text-2xl font-black text-emerald-600">{formatMoney(totalValue)}</div>
          </div>
          <div className="bg-[var(--surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)]">
            <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-1">Sắp Hết Hàng</div>
            <div className="text-2xl font-black text-amber-500">{lowStock} <span className="text-xs text-[var(--muted)] font-medium">SKU</span></div>
          </div>
          <div className="bg-[var(--surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)]">
            <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-1">Hết Hàng</div>
            <div className="text-2xl font-black text-rose-600">{outOfStock} <span className="text-xs text-[var(--muted)] font-medium">SKU</span></div>
          </div>
        </div>

        <div className="bg-[var(--surface)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] overflow-hidden">
          <div className="p-5 border-b border-[var(--border-soft)] bg-[var(--surface-warm)]"><h3 className="font-black text-[var(--fg)]">Chi tiết tồn kho</h3></div>
          <table className="w-full text-left">
            <thead className="bg-[var(--surface)] text-[var(--muted)] text-[11px] uppercase font-black border-b border-[var(--border-soft)]">
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
                <tr><td colSpan="5" className="text-center py-10 text-[var(--muted)]">Không có sản phẩm nào.</td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="hover:bg-[var(--surface-warm)]/50">
                  <td className="px-6 py-4 font-bold text-[var(--fg)]">{p.name}</td>
                  <td className="px-6 py-4 text-center font-black text-[var(--fg)]">{p.stock}</td>
                  <td className="px-6 py-4 text-right font-medium text-[var(--muted)]">{formatMoney(p.price)}</td>
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
    // Merge CashFlows with POS Orders for full picture if backend hasn't synced
    let posRev = 0;
    orders.forEach(o => { if (o.status === 'paid') posRev += o.total_amount; });
    
    // Fallback logic in case backend pnl route isn't fully robust
    const displayRev = pnlData.revenue > 0 ? pnlData.revenue : posRev;
    const displayExp = pnlData.expense || 0;
    const displayProfit = displayRev - displayExp;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-[var(--radius-lg)] shadow-lg shadow-emerald-500/30 text-white relative overflow-hidden">
            <TrendingUp className="absolute -right-4 -bottom-4 w-32 h-32 opacity-20"/>
            <div className="text-sm font-bold text-emerald-100 uppercase tracking-wider mb-2 relative z-10">Lợi Nhuận Ròng (Net Profit)</div>
            <div className="text-4xl font-black relative z-10">{formatMoney(displayProfit)}</div>
            <div className="mt-4 text-xs bg-black/20 w-fit px-3 py-1 rounded-full backdrop-blur-md relative z-10">Lãi/Lỗ thực tế sau trừ phí</div>
          </div>
          
          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] flex flex-col justify-center">
            <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-2">Tổng Doanh Thu Phân Bổ</div>
            <div className="text-3xl font-black text-blue-600">{formatMoney(displayRev)}</div>
          </div>

          <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] flex flex-col justify-center">
            <div className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-2">Tổng Chi Phí Hoạt Động</div>
            <div className="text-3xl font-black text-rose-600">{formatMoney(displayExp)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[var(--surface)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] overflow-hidden">
            <div className="p-5 border-b border-[var(--border-soft)] bg-emerald-50 text-emerald-800 font-black">Các Khoản Thu (Dòng Tiền Vào)</div>
            <div className="p-5">
              <div className="flex justify-between items-center py-3 border-b border-[var(--border-soft)]">
                <span className="font-bold text-[var(--fg)]">Doanh thu bán hàng hóa (POS)</span>
                <span className="font-black text-emerald-600">{formatMoney(posRev)}</span>
              </div>
              {cashFlows.filter(c => c.transaction_type === 'in').map((c, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-[var(--border-soft)]">
                  <span className="font-bold text-[var(--fg)]">{c.notes || 'Thu khác'}</span>
                  <span className="font-black text-emerald-600">{formatMoney(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--surface)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--elev-ring)] overflow-hidden">
            <div className="p-5 border-b border-[var(--border-soft)] bg-rose-50 text-rose-800 font-black">Các Khoản Chi (Dòng Tiền Ra)</div>
            <div className="p-5">
              {cashFlows.filter(c => c.transaction_type === 'out').length === 0 ? (
                <div className="text-center py-10 text-[var(--muted)] font-medium">Chưa phát sinh chi phí</div>
              ) : (
                cashFlows.filter(c => c.transaction_type === 'out').map((c, i) => (
                  <div key={i} className="flex justify-between items-center py-3 border-b border-[var(--border-soft)]">
                    <span className="font-bold text-[var(--fg)]">{c.notes || 'Chi khác'}</span>
                    <span className="font-black text-rose-600">{formatMoney(c.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--surface-warm)] relative overflow-hidden">
      
      {/* Header */}
      <div className="p-8 border-b border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 z-10 relative">
        <div>
          <h1 className="text-3xl font-black text-[var(--fg)] flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-[var(--radius-md)] flex items-center justify-center text-indigo-600">
              <FileText className="w-6 h-6" />
            </div>
            Hệ Thống Báo Cáo Chuyên Sâu
          </h1>
          <p className="text-[var(--muted)] mt-1.5 font-medium ml-14">Hệ thống phân tích, báo cáo bán hàng và dòng tiền Real-time.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-[var(--radius-md)] font-bold transition-all shadow-md shadow-emerald-600/20"
          >
            <Download className="w-4 h-4" /> Xuất Báo Cáo Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="px-8 pt-6 bg-[var(--surface)] border-b border-[var(--border)] shrink-0 flex gap-6">
        <button 
          onClick={() => setActiveTab('sales')}
          className={`pb-4 font-bold text-sm transition-colors relative ${activeTab === 'sales' ? 'text-indigo-600' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`}
        >
          <div className="flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Báo Cáo Bán Hàng</div>
          {activeTab === 'sales' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('inventory')}
          className={`pb-4 font-bold text-sm transition-colors relative ${activeTab === 'inventory' ? 'text-indigo-600' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`}
        >
          <div className="flex items-center gap-2"><Box className="w-4 h-4"/> Báo Cáo Tồn Kho</div>
          {activeTab === 'inventory' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('pnl')}
          className={`pb-4 font-bold text-sm transition-colors relative ${activeTab === 'pnl' ? 'text-indigo-600' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`}
        >
          <div className="flex items-center gap-2"><Activity className="w-4 h-4"/> Báo Cáo Lãi Lỗ (P&L)</div>
          {activeTab === 'pnl' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full"></div>}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="h-full flex items-center justify-center text-[var(--muted)] font-bold text-lg">Đang tổng hợp báo cáo...</div>
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
