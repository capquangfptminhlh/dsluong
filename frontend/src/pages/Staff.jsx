import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { UserCircle, UserPlus, Phone, ShieldCheck, Trophy, Lock, Mail, Search, X, Briefcase, TrendingUp } from 'lucide-react';
import API_BASE from '../config/api';

export default function Staff() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', role: 'Thu ngân' });

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/staff`);
      setStaffList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/staff`, form);
      setShowModal(false);
      setForm({ name: '', phone: '', role: 'Thu ngân' });
      fetchStaff();
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi thêm nhân viên!');
    }
  };

  const filteredStaff = staffList.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone && s.phone.includes(search)));

  // KPI Calculations
  const totalStaff = staffList.length;
  const topSeller = staffList.reduce((max, s) => (s.sales_total > max.sales_total ? s : max), {sales_total: -1});

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      
      {/* Header */}
      <div className="p-8 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Briefcase className="w-8 h-8 text-indigo-600" /> Quản lý Nhân Sự (HRM)
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Theo dõi năng suất nhân viên, phân quyền truy cập và tính hoa hồng.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5"
        >
          <UserPlus className="w-5 h-5" /> Thêm Nhân Viên
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8 space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-indigo-600/20 flex items-center justify-between">
            <div>
              <div className="text-indigo-100 font-bold uppercase tracking-wider text-xs mb-1">Tổng Số Nhân Viên</div>
              <div className="text-4xl font-black">{totalStaff} <span className="text-sm font-semibold text-indigo-200">người</span></div>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <UserCircle className="w-8 h-8 text-white" />
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl p-6 text-white shadow-lg shadow-orange-500/20 flex items-center justify-between">
            <div>
              <div className="text-amber-100 font-bold uppercase tracking-wider text-xs mb-1">Nhân viên xuất sắc nhất</div>
              <div className="text-xl font-black mb-1">{topSeller.sales_total > 0 ? topSeller.name : 'Chưa có dữ liệu'}</div>
              <div className="text-sm font-semibold text-amber-100 flex items-center gap-1">
                <TrendingUp className="w-4 h-4"/> Doanh số: {topSeller.sales_total > 0 ? new Intl.NumberFormat('vi-VN').format(topSeller.sales_total) + ' ₫' : '0 ₫'}
              </div>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Trophy className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex gap-4 items-center">
            <div className="relative w-full max-w-md">
              <Search className="w-5 h-5 absolute left-3.5 top-2.5 text-slate-400" />
              <input 
                type="text" 
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Tìm nhân viên..." 
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all font-medium text-slate-700"
              />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-black">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-200">Hồ sơ Nhân viên</th>
                  <th className="px-6 py-4 border-b border-slate-200">Thông tin liên hệ</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-center">Quyền truy cập</th>
                  <th className="px-6 py-4 border-b border-slate-200 text-right">Doanh số (KPI)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="4" className="text-center py-12 text-slate-500 font-medium">Đang tải danh sách nhân sự...</td></tr>
                ) : filteredStaff.length === 0 ? (
                  <tr><td colSpan="4" className="text-center py-12 text-slate-500">Chưa có nhân viên nào.</td></tr>
                ) : (
                  filteredStaff.map(s => (
                    <tr key={s.id} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 font-black flex items-center justify-center text-xl shadow-sm">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-base group-hover:text-indigo-700 transition-colors">{s.name}</div>
                            <div className="text-[11px] text-slate-400 font-medium mt-0.5">Ngày vào: {new Date(s.createdAt).toLocaleDateString('vi-VN')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                            <Phone className="w-4 h-4 text-slate-400" /> {s.phone || 'Chưa cập nhật'}
                          </div>
                          <div className="flex items-center gap-2 text-slate-400 text-sm italic">
                            <Mail className="w-4 h-4 text-slate-300" /> Không có email
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm ${
                          s.role === 'Quản lý' ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {s.role === 'Quản lý' ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          {s.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="font-black text-slate-700 text-lg flex items-center justify-end gap-1.5">
                          {new Intl.NumberFormat('vi-VN').format(s.sales_total)} ₫
                          {s.sales_total > 0 && <Trophy className={`w-5 h-5 ${s.id === topSeller.id ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <UserPlus className="w-6 h-6 text-indigo-600" /> Thêm Nhân Sự
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Họ & Tên <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} type="text" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition-all" placeholder="VD: Nguyễn Văn A" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Số điện thoại liên hệ</label>
                <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} type="text" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition-all" placeholder="09xx..." />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Phân quyền Hệ thống <span className="text-red-500">*</span></label>
                <div className="space-y-3">
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${form.role === 'Thu ngân' ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="role" value="Thu ngân" checked={form.role === 'Thu ngân'} onChange={e => setForm({...form, role: e.target.value})} className="w-5 h-5 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <div className="font-black text-slate-800">Nhân viên Thu Ngân</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Chỉ được truy cập màn hình POS bán hàng.</div>
                    </div>
                  </label>
                  
                  <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${form.role === 'Quản lý' ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <input type="radio" name="role" value="Quản lý" checked={form.role === 'Quản lý'} onChange={e => setForm({...form, role: e.target.value})} className="w-5 h-5 text-indigo-600 focus:ring-indigo-500" />
                    <div>
                      <div className="font-black text-slate-800">Quản lý Cửa Hàng</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Toàn quyền truy cập Dashboard, Báo cáo, Kho.</div>
                    </div>
                  </label>
                </div>
              </div>
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-colors">Hủy Bỏ</button>
                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all hover:-translate-y-0.5">Cấp Tài Khoản</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
