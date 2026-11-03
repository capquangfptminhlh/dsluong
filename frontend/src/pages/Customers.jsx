import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Users, Search, UserPlus, Phone, MapPin, Star, X, ChevronRight, ShoppingBag, TrendingUp, Calendar, WalletCards, Pencil } from 'lucide-react';
import API_BASE from '../config/api';

const money = (value) => new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', tags: '' });
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/customers`);
      setCustomers(res.data);
      if (selectedCustomer) {
        const fresh = res.data.find((item) => item.id === selectedCustomer.id);
        if (fresh) setSelectedCustomer(fresh);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể tải danh sách khách hàng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    axios.get(`${API_BASE}/api/customers`)
      .then((res) => { if (active) setCustomers(res.data); })
      .catch((err) => { if (active) alert(err.response?.data?.error || 'Không thể tải danh sách khách hàng.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setOrders([]);
      return;
    }
    let active = true;
    setOrdersLoading(true);
    axios.get(`${API_BASE}/api/customers/${selectedCustomer.id}/orders`)
      .then((res) => { if (active) setOrders(res.data); })
      .catch((err) => { if (active) alert(err.response?.data?.error || 'Không thể tải lịch sử giao dịch.'); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [selectedCustomer?.id]);

  const tiers = useMemo(() => [...new Set(customers.map((c) => c.tier_name).filter(Boolean))], [customers]);
  const filteredCustomers = useMemo(() => customers.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch = String(c.name || '').toLowerCase().includes(q)
      || String(c.phone || '').includes(search)
      || String(c.address || '').toLowerCase().includes(q);
    const matchesTier = tierFilter === 'all' || c.tier_name === tierFilter;
    return matchesSearch && matchesTier;
  }), [customers, search, tierFilter]);

  const addCustomer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/api/customers`, form);
      setShowAdd(false);
      setForm({ name: '', phone: '', address: '', tags: '' });
      await fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể thêm khách hàng.');
    } finally {
      setSaving(false);
    }
  };

  const openEditCustomer = (customer) => {
    if (!customer) return;
    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      address: customer.address || '',
      tags: customer.tags || '',
    });
    setShowEdit(true);
  };

  const updateCustomer = async (e) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    setEditSaving(true);
    try {
      await axios.put(`${API_BASE}/api/customers/${selectedCustomer.id}`, editForm);
      setShowEdit(false);
      await fetchCustomers();
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể cập nhật khách hàng.');
    } finally {
      setEditSaving(false);
    }
  };

  const openPos = (customer) => {
    sessionStorage.setItem('autotax_pos_customer', JSON.stringify({ name: customer.name, phone: customer.phone, address: customer.address || '' }));
    navigate('/app/pos');
  };

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col bg-slate-50 relative overflow-hidden">
      <div className="p-5 sm:p-8 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 flex items-center gap-2"><Users className="w-8 h-8 text-blue-600" /> Quản lý CRM & Khách Hàng</h1>
          <p className="text-slate-500 mt-1 font-medium">Khách hàng, hạng Loyalty và lịch sử mua hàng lấy trực tiếp từ dữ liệu cửa hàng.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 w-full sm:w-auto">
          <UserPlus className="w-5 h-5" /> Thêm Khách Hàng
        </button>
      </div>

      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
        <div className={`flex-1 min-h-0 min-w-0 flex flex-col transition-all ${selectedCustomer ? 'lg:mr-[420px]' : ''}`}>
          <div className="p-3 sm:p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row gap-3 items-stretch sm:items-center min-w-0">
            <div className="relative flex-1 min-w-0 w-full max-w-full sm:max-w-md">
              <Search className="w-5 h-5 absolute left-3.5 top-2.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, số điện thoại..." className="w-full min-w-0 pl-11 pr-4 py-2.5 bg-slate-100 rounded-xl outline-none focus:ring-4 focus:ring-blue-500/20" />
            </div>
            <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} className="w-full sm:w-auto max-w-full min-w-0 border border-slate-200 rounded-xl px-4 py-2.5 font-bold text-slate-600 bg-white">
              <option value="all">Tất cả hạng Loyalty</option>
              {tiers.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
            </select>
          </div>

          {/* Mobile: operational customer cards avoid the 700px desktop table. */}
          <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-3 space-y-2 bg-slate-50">
            {loading ? <div className="text-center py-14 text-slate-500">Đang tải dữ liệu CRM...</div>
              : filteredCustomers.length === 0 ? <div className="text-center py-14 text-slate-500">Không có khách hàng phù hợp.</div>
              : filteredCustomers.map((c) => (
                <button key={c.id} type="button" onClick={() => setSelectedCustomer(c)} className={`w-full min-w-0 rounded-2xl border p-4 text-left transition-colors ${selectedCustomer?.id === c.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-black text-slate-800">{c.name}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-500"><Phone className="h-3.5 w-3.5 shrink-0" />{c.phone}</div>
                    </div>
                    <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="min-w-0">
                      <span className="inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-black" style={{ borderColor: c.tier_color, color: c.tier_color }}>{c.tier_name}</span>
                      <div className="mt-1 truncate text-xs text-slate-400">{c.tags || 'Chưa gắn thẻ'}</div>
                    </div>
                    <div className="shrink-0 text-right"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tổng chi tiêu</div><div className="mt-0.5 font-black text-slate-800">{money(c.total_spend)} ₫</div></div>
                  </div>
                </button>
              ))}
          </div>

          {/* Desktop/tablet: preserve the information-dense table. */}
          <div className="hidden md:block flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-black sticky top-0 z-10">
                <tr><th className="px-6 py-4">Khách hàng</th><th className="px-6 py-4">Liên hệ</th><th className="px-6 py-4 text-center">Hạng Loyalty</th><th className="px-6 py-4 text-right">Tổng chi tiêu</th><th className="w-16" /></tr>
              </thead>
              <tbody className="bg-white text-sm">
                {loading ? <tr><td colSpan="5" className="text-center py-14 text-slate-500">Đang tải dữ liệu CRM...</td></tr>
                  : filteredCustomers.length === 0 ? <tr><td colSpan="5" className="text-center py-14 text-slate-500">Không có khách hàng phù hợp.</td></tr>
                  : filteredCustomers.map((c) => (
                    <tr key={c.id} onClick={() => setSelectedCustomer(c)} className={`border-b border-slate-100 cursor-pointer ${selectedCustomer?.id === c.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4"><div className="font-black text-slate-800">{c.name}</div><div className="text-xs text-slate-400">{c.tags || 'Chưa gắn thẻ'}</div></td>
                      <td className="px-6 py-4"><div className="flex items-center gap-2 text-slate-600 font-bold"><Phone className="w-4 h-4" />{c.phone}</div></td>
                      <td className="px-6 py-4 text-center"><span className="inline-flex px-3 py-1.5 rounded-full text-xs font-black border" style={{ borderColor: c.tier_color, color: c.tier_color }}>{c.tier_name}</span></td>
                      <td className="px-6 py-4 text-right font-black text-slate-700">{money(c.total_spend)} ₫</td>
                      <td className="px-4"><ChevronRight className="w-5 h-5 text-slate-300" /></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`absolute top-0 bottom-0 right-0 w-full lg:w-[420px] bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col pb-24 lg:pb-0 transition-transform ${selectedCustomer ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedCustomer && <>
            <div className="p-5 sm:p-6 bg-slate-800 text-white relative">
              <button onClick={() => setSelectedCustomer(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10"><X className="w-5 h-5" /></button>
              <h2 className="text-2xl font-black pr-12">{selectedCustomer.name}</h2>
              <div className="text-sm text-slate-300 mt-1">{selectedCustomer.phone}</div>
              <div className="mt-1 flex items-start gap-1.5 text-sm text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{selectedCustomer.address || 'Chưa cập nhật địa chỉ'}</span>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => openPos(selectedCustomer)} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm flex items-center justify-center gap-2"><ShoppingBag className="w-4 h-4" /> Tạo Đơn</button>
                <button onClick={() => openEditCustomer(selectedCustomer)} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm flex items-center justify-center gap-2" title="Chỉnh sửa khách hàng"><Pencil className="w-4 h-4" /> Sửa</button>
                <button onClick={() => navigate('/app/finance/debt')} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl" title="Mở công nợ"><WalletCards className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-5 border-b border-slate-100">
              <div className="bg-slate-50 p-4 rounded-xl"><div className="text-xs text-slate-500 font-bold flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Tổng mua</div><div className="font-black mt-1">{money(selectedCustomer.total_spend)} ₫</div></div>
              <div className="bg-slate-50 p-4 rounded-xl"><div className="text-xs text-slate-500 font-bold flex items-center gap-1"><Star className="w-3 h-3" /> Điểm</div><div className="font-black text-blue-600 mt-1">{money(selectedCustomer.points)} Pts</div></div>
            </div>

            <div className="flex-1 overflow-auto p-5 bg-slate-50">
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider mb-4 flex items-center gap-2"><Calendar className="w-4 h-4" /> Giao dịch gần đây</h3>
              {ordersLoading ? <div className="text-sm text-slate-500 py-8 text-center">Đang tải lịch sử...</div>
                : orders.length === 0 ? <div className="text-sm text-slate-500 py-8 text-center">Khách hàng chưa có đơn POS.</div>
                : <div className="space-y-3">{orders.map((order) => (
                  <div key={order.id} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex justify-between gap-3"><div><div className="font-black text-slate-800">{order.order_code}</div><div className="text-xs text-slate-400 mt-1">{order.createdAt ? new Date(order.createdAt).toLocaleString('vi-VN') : ''}</div></div><div className="font-black text-blue-600">{money(order.total_amount)} ₫</div></div>
                    <div className="mt-2 text-xs text-slate-500">{order.status || '—'} · {order.payment_method || '—'}{Number(order.debt_amount) > 0 ? ` · Còn nợ ${money(order.debt_amount)} ₫` : ''}</div>
                  </div>
                ))}</div>}
            </div>
          </>}
        </div>
      </div>

      {showAdd && <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5"><h3 className="text-xl font-black">Thêm khách hàng</h3><button onClick={() => setShowAdd(false)}><X className="w-5 h-5" /></button></div>
          <form onSubmit={addCustomer} className="space-y-4">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên khách hàng" className="w-full px-4 py-3 border rounded-xl" />
            <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Số điện thoại" className="w-full px-4 py-3 border rounded-xl" />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Địa chỉ (tuỳ chọn)" className="w-full px-4 py-3 border rounded-xl" />
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Thẻ ghi chú (tuỳ chọn)" className="w-full px-4 py-3 border rounded-xl" />
            <button disabled={saving} className="w-full py-3 bg-blue-600 text-white rounded-xl font-black disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu khách hàng'}</button>
          </form>
        </div>
      </div>}

      {showEdit && selectedCustomer && <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={() => !editSaving && setShowEdit(false)}>
        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-xl font-black text-slate-900">Chỉnh sửa khách hàng</h3>
              <p className="text-sm text-slate-500 mt-1">Cập nhật thông tin và lưu lại ngay trong CRM.</p>
            </div>
            <button type="button" disabled={editSaving} onClick={() => setShowEdit(false)} className="p-1 rounded-lg hover:bg-slate-100 disabled:opacity-50"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={updateCustomer} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Tên khách hàng</label>
              <input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Tên khách hàng" className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Số điện thoại</label>
              <input required value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Số điện thoại" className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
              <p className="text-xs text-slate-500 mt-1.5">Nếu khách đã có đơn, bảo hành hoặc lịch sử điểm, hệ thống sẽ giữ nguyên SĐT để bảo toàn liên kết giao dịch.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Địa chỉ</label>
              <textarea rows="2" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} placeholder="Địa chỉ khách hàng" className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Ghi chú / thẻ khách hàng</label>
              <textarea rows="3" value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} placeholder="Ghi chú về khách hàng" className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none resize-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10" />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" disabled={editSaving} onClick={() => setShowEdit(false)} className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-black hover:bg-slate-50 disabled:opacity-50">Hủy</button>
              <button disabled={editSaving} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black disabled:opacity-50">{editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
            </div>
          </form>
        </div>
      </div>}
    </div>
  );
}