import React, { useState, useEffect } from 'react';
import { Target, Users, AlertTriangle, Moon, Crown, Search, Send, CheckCircle2 } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function AdvancedCRM() {
  const [data, setData] = useState({ stats: {}, customers: [] });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSegment, setFilterSegment] = useState('ALL');

  useEffect(() => {
    fetchRFM();
  }, []);

  const fetchRFM = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/customers/rfm`);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  const filteredCustomers = data.customers.filter(c => {
    const matchSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone?.includes(searchTerm);
    const matchSegment = filterSegment === 'ALL' || c.segment === filterSegment;
    return matchSearch && matchSegment;
  });

  const SegmentCard = ({ title, count, icon: Icon, colorClass, bgColor, onClick, active }) => (
    <div 
      onClick={onClick}
      className={`p-6 rounded-3xl cursor-pointer transition-all duration-300 border-2 ${active ? `border-${colorClass.split('-')[1]}-500 shadow-md transform -translate-y-1` : 'border-transparent bg-white shadow-sm hover:shadow-md'}`}
      style={active ? { backgroundColor: bgColor } : {}}
    >
      <div className="flex justify-between items-center mb-4">
        <div className={`p-3 rounded-2xl ${colorClass.replace('text-', 'bg-').replace('600', '100')} ${colorClass}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="text-3xl font-black text-slate-800">{count || 0}</div>
      </div>
      <h3 className="font-bold text-slate-700 text-lg">{title}</h3>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Target className="w-8 h-8 text-indigo-600" /> CRM Nâng Cao (RFM)
          </h1>
          <p className="text-slate-500 font-medium">Phân tích hành vi mua hàng và Phân loại khách hàng tự động</p>
        </div>
        <button
          type="button"
          disabled
          title="AutoTax chưa tích hợp dịch vụ gửi Zalo/SMS trong phiên bản hiện tại"
          className="bg-slate-100 text-slate-500 px-6 py-3 rounded-xl font-bold flex items-center gap-2 border border-slate-200 cursor-not-allowed"
        >
          <Send className="w-5 h-5"/> Chưa tích hợp Zalo/SMS
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <>
          {/* RFM Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <SegmentCard 
              title="Khách VIP" count={data.stats['VIP']} icon={Crown} 
              colorClass="text-amber-600" bgColor="#fffbeb"
              active={filterSegment === 'VIP'} onClick={() => setFilterSegment('VIP')}
            />
            <SegmentCard 
              title="Nguy Cơ Rời Bỏ" count={data.stats['At Risk']} icon={AlertTriangle} 
              colorClass="text-rose-600" bgColor="#fff1f2"
              active={filterSegment === 'At Risk'} onClick={() => setFilterSegment('At Risk')}
            />
            <SegmentCard 
              title="Ngủ Quên" count={data.stats['Sleeping']} icon={Moon} 
              colorClass="text-slate-600" bgColor="#f8fafc"
              active={filterSegment === 'Sleeping'} onClick={() => setFilterSegment('Sleeping')}
            />
            <SegmentCard 
              title="Khách Mới / 1 Lần" count={(data.stats['New'] || 0) + (data.stats['One-time'] || 0)} icon={Users} 
              colorClass="text-emerald-600" bgColor="#ecfdf5"
              active={filterSegment === 'New' || filterSegment === 'One-time'} onClick={() => setFilterSegment(filterSegment === 'New' ? 'ALL' : 'New')}
            />
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex gap-4 bg-slate-50">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm khách hàng..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>
              {filterSegment !== 'ALL' && (
                <button onClick={() => setFilterSegment('ALL')} className="px-6 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors">
                  Bỏ lọc
                </button>
              )}
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="py-4 px-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Khách hàng</th>
                  <th className="py-4 px-6 font-bold text-slate-500 uppercase tracking-wider text-xs text-center">Tần suất (F)</th>
                  <th className="py-4 px-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Chi tiêu (M)</th>
                  <th className="py-4 px-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Lần cuối mua (R)</th>
                  <th className="py-4 px-6 font-bold text-slate-500 uppercase tracking-wider text-xs">Phân loại AI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">{c.name}</div>
                      <div className="text-slate-500 text-xs font-medium">{c.phone}</div>
                    </td>
                    <td className="py-4 px-6 text-center font-black text-slate-700">{c.frequency || 0}</td>
                    <td className="py-4 px-6 font-bold text-indigo-600">{formatMoney(c.monetary)}</td>
                    <td className="py-4 px-6">
                      {c.recency === 999 ? (
                        <span className="text-slate-400">Chưa mua hàng</span>
                      ) : (
                        <span className="font-medium text-slate-600">{c.recency} ngày trước</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {c.segment === 'VIP' && <span className="bg-amber-100 text-amber-700 font-bold px-3 py-1 rounded-lg text-xs inline-flex items-center gap-1"><Crown className="w-3 h-3"/> VIP</span>}
                      {c.segment === 'At Risk' && <span className="bg-rose-100 text-rose-700 font-bold px-3 py-1 rounded-lg text-xs inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Nguy cơ</span>}
                      {c.segment === 'Sleeping' && <span className="bg-slate-200 text-slate-700 font-bold px-3 py-1 rounded-lg text-xs inline-flex items-center gap-1"><Moon className="w-3 h-3"/> Ngủ quên</span>}
                      {(c.segment === 'New' || c.segment === 'One-time') && <span className="bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded-lg text-xs inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Mới</span>}
                    </td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr><td colSpan="5" className="py-8 text-center text-slate-500 font-medium">Không tìm thấy khách hàng nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
