import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, ClipboardCheck, FileSpreadsheet, Package, RefreshCcw, ShoppingCart, Users, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import API_BASE from '../config/api';

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} ₫`;
const localDateKey = (date = new Date()) => {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const orderDate = (order) => String(order.createdAt || order.created_at || '').slice(0, 10);
const isPaid = (order) => ['paid', 'completed', 'complete', 'done'].includes(String(order.status || '').toLowerCase());

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [data, setData] = useState({ profile: {}, orders: [], customers: [], products: [], reports: [], mappings: [], pnl: null });
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const load = useCallback(async () => {
    setLoading(true);
    const today = localDateKey();
    const monthStart = `${today.slice(0, 7)}-01`;
    const sources = [['profile', `${API_BASE}/api/auth/profile`, {}], ['orders', `${API_BASE}/api/pos`, []], ['customers', `${API_BASE}/api/customers`, []], ['products', `${API_BASE}/api/products`, []], ['reports', `${API_BASE}/api/reports`, []], ['mappings', `${API_BASE}/api/mappings`, []], ['pnl', `${API_BASE}/api/finance/pnl?from=${monthStart}&to=${today}`, null]];
    const results = await Promise.allSettled(sources.map(([, url]) => axios.get(url)));
    const next = {}; const failed = [];
    results.forEach((result, index) => { const [key, , fallback] = sources[index]; if (result.status === 'fulfilled') next[key] = result.value.data ?? fallback; else { next[key] = fallback; failed.push(key); } });
    setData(next); setErrors(failed); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => {
    const today = localDateKey(); const month = today.slice(0, 7); const paidOrders = data.orders.filter(isPaid);
    const todayOrders = data.orders.filter((order) => orderDate(order) === today && String(order.status).toLowerCase() !== 'cancelled');
    const todayRevenue = paidOrders.filter((order) => orderDate(order) === today).reduce((sum, order) => sum + Number(order.total_amount || order.total || 0), 0);
    const monthRevenue = paidOrders.filter((order) => orderDate(order).startsWith(month)).reduce((sum, order) => sum + Number(order.total_amount || order.total || 0), 0);
    const lowStock = data.products.filter((product) => Number(product.stock) >= 0 && Number(product.stock) <= 5).length;
    return { todayRevenue, monthRevenue, todayOrders: todayOrders.length, customers: data.customers.length, products: data.products.length, lowStock };
  }, [data]);

  const readiness = useMemo(() => {
    const checks = [
      { label: 'Hồ sơ có mã số thuế', ok: Boolean(data.profile?.taxCode) },
      { label: 'Địa chỉ kinh doanh đã khai báo', ok: Boolean(data.profile?.address || data.profile?.province) },
      { label: 'Có dữ liệu phân loại sản phẩm', ok: data.mappings.length > 0 },
      { label: 'Có dữ liệu/báo cáo đã lưu', ok: data.reports.length > 0 || data.orders.length > 0 },
    ];
    return { checks, score: Math.round((checks.filter((item) => item.ok).length / checks.length) * 100) };
  }, [data]);

  const last7Days = useMemo(() => {
    const rows = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(); date.setDate(date.getDate() - offset); const key = localDateKey(date);
      const revenue = data.orders.filter((order) => isPaid(order) && orderDate(order) === key).reduce((sum, order) => sum + Number(order.total_amount || order.total || 0), 0);
      rows.push({ key, label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`, revenue });
    }
    const max = Math.max(...rows.map((row) => row.revenue), 1);
    return rows.map((row) => ({ ...row, height: Math.max((row.revenue / max) * 100, row.revenue > 0 ? 8 : 2) }));
  }, [data.orders]);

  const cards = [
    { label: 'Doanh thu hôm nay', value: money(metrics.todayRevenue), icon: CircleDollarSign, note: 'Từ đơn đã thanh toán', tone: 'text-blue-600 bg-white/75' },
    { label: 'Đơn hôm nay', value: metrics.todayOrders, icon: ShoppingCart, note: 'Không gồm đơn đã hủy', tone: 'text-violet-600 bg-white/75' },
    { label: 'Khách hàng', value: metrics.customers, icon: Users, note: 'Tổng hồ sơ hiện có', tone: 'text-emerald-600 bg-white/75' },
    { label: 'Sắp / hết tồn', value: metrics.lowStock, icon: Warehouse, note: `Trên ${metrics.products} sản phẩm`, tone: 'text-amber-600 bg-white/75' },
  ];

  return (
    <div className="pb-8">
      <div className="page-header">
        <div><h2 className="page-title">Tổng quan hôm nay</h2><p className="page-subtitle">Theo dõi vận hành của {user.name || 'cửa hàng'} từ dữ liệu thực tế trong hệ thống.</p></div>
        <button type="button" className="btn-secondary" onClick={load} disabled={loading}><RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Làm mới</button>
      </div>

      {errors.length > 0 && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><div className="text-sm font-bold">Một số nguồn dữ liệu chưa phản hồi</div><div className="mt-1 text-xs text-amber-700">{errors.join(', ')}. Các thẻ còn lại vẫn hiển thị bằng dữ liệu đã tải thành công.</div></div></div>}

      <div className="dashboard-metrics grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, note, tone }) => <div key={label} className="metric-card"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="metric-label">{label}</div><div className="metric-value">{loading ? '—' : value}</div></div><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ${tone}`}><Icon className="h-5 w-5" /></div></div><div className="dashboard-metric-note mt-4 text-xs">{note}</div></div>)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[
          ['Doanh thu thuần tháng', data.pnl?.net_revenue, 'Sau giảm giá và hàng trả'],
          ['Giá vốn tháng', data.pnl?.cost_of_goods, 'Giá vốn của hàng đã bán'],
          ['Lợi nhuận gộp tháng', data.pnl?.gross_profit, 'Doanh thu thuần - giá vốn'],
          ['Lãi/Lỗ ròng tháng', data.pnl?.net_profit, 'Sau chi phí vận hành'],
        ].map(([label, value, note]) => (
          <div key={label} className="metric-card">
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${label.includes('Lãi/Lỗ') && Number(value) < 0 ? 'text-rose-600' : label.includes('Lợi nhuận') || label.includes('Lãi/Lỗ') ? 'text-emerald-600' : ''}`}>
              {loading || !data.pnl ? '—' : money(value)}
            </div>
            <div className="dashboard-metric-note mt-4 text-xs">{note}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        <section className="surface p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="metric-label">Doanh thu 7 ngày gần nhất</div><div className="mt-1 text-xl font-extrabold text-slate-950">{money(metrics.monthRevenue)} <span className="text-xs font-semibold text-slate-400">trong tháng hiện tại</span></div></div><Link to="/app/reports" className="text-xs font-bold text-blue-600">Xem báo cáo</Link></div>
          <div className="mt-6 flex h-48 items-end gap-2 sm:gap-3">
            {last7Days.map((row) => <div key={row.key} className="flex h-full min-w-0 flex-1 flex-col justify-end"><div title={money(row.revenue)} className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400 transition-all" style={{ height: `${row.height}%` }} /><div className="mt-2 text-center text-[10px] font-semibold text-slate-400">{row.label}</div></div>)}
          </div>
        </section>

        <section className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><div className="metric-label">Mức sẵn sàng dữ liệu</div><div className="mt-1 text-3xl font-extrabold text-slate-950">{readiness.score}%</div></div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><ClipboardCheck className="h-6 w-6" /></div></div>
          <div className="mt-5 space-y-3">{readiness.checks.map((item) => <div key={item.label} className="flex items-center gap-2 text-sm"><CheckCircle2 className={`h-4 w-4 ${item.ok ? 'text-emerald-500' : 'text-slate-300'}`} /><span className={item.ok ? 'text-slate-700' : 'text-slate-400'}>{item.label}</span></div>)}</div>
          <p className="mt-5 rounded-xl bg-blue-50 p-3 text-[11px] leading-5 text-blue-700">Chỉ phản ánh độ đầy đủ dữ liệu đầu vào, không phải kết luận tuân thủ hay nghĩa vụ thuế.</p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><div className="text-sm font-bold text-slate-900">Đơn gần đây</div><div className="text-xs text-slate-400">Hoạt động POS mới nhất</div></div><Link to="/app/pos/orders" className="text-xs font-bold text-blue-600 hover:text-blue-700">Xem tất cả</Link></div>
          <div className="divide-y divide-slate-100">{data.orders.slice(0, 6).map((order, index) => <div key={order.id || order.order_code || index} className="flex items-center gap-3 px-5 py-3.5"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ShoppingCart className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-800">{order.order_code || `Đơn #${order.id || index + 1}`}</div><div className="truncate text-[11px] text-slate-400">{order.customer_name || 'Khách lẻ'} · {order.createdAt || order.created_at || 'Chưa có thời gian'}</div></div><div className="text-right"><div className="text-sm font-bold text-slate-800">{money(order.total_amount || order.total)}</div><div className="text-[10px] uppercase text-slate-400">{order.status || '—'}</div></div></div>)}{!loading && data.orders.length === 0 && <div className="px-5 py-10 text-center text-sm text-slate-400">Chưa có đơn hàng.</div>}</div>
        </section>

        <section className="surface p-5"><div className="text-sm font-bold text-slate-900">Thao tác nhanh</div><div className="mt-1 text-xs text-slate-400">Các luồng dùng nhiều nhất.</div><div className="mt-4 grid gap-2">{[[ '/app/pos', 'Tạo đơn bán', ShoppingCart], ['/app/purchase', 'Nhập hàng', Package], ['/app/inventory', 'Kiểm tra tồn', Warehouse], ['/app/report', 'Khai thuế', FileSpreadsheet]].map(([to, label, Icon]) => <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-blue-200 hover:bg-blue-50/40"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Icon className="h-4 w-4" /></div><span className="flex-1 text-sm font-bold text-slate-700">{label}</span><ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500" /></Link>)}</div></section>
      </div>
    </div>
  );
}
