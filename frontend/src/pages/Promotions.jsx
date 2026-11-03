import React, { useState, useEffect } from 'react';
import { Gift, Plus, Tag, Trash2, Ticket, Percent, Zap, Calendar, X, AlertCircle } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Promotions() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    min_order_value: '',
    discount_percent: '',
    discount_amount: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/promo`);
      setPromos(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/promo`, {
        ...form,
        min_order_value: Number(form.min_order_value) || 0,
        discount_percent: Number(form.discount_percent) || 0,
        discount_amount: Number(form.discount_amount) || 0
      });
      setShowModal(false);
      setForm({ name: '', min_order_value: '', discount_percent: '', discount_amount: '' });
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Lỗi tạo khuyến mãi');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Hủy chương trình khuyến mãi này?')) return;
    try {
      await axios.delete(`${API_BASE}/api/promo/${id}`);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Không thể xóa khuyến mãi. Dữ liệu vẫn được giữ nguyên.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
      
      {/* Header */}
      <div className="p-8 border-b border-slate-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Gift className="w-8 h-8 text-fuchsia-600" /> Quản lý Khuyến Mãi
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Thiết lập quy tắc giảm giá tự động, voucher và chương trình thành viên.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-fuchsia-600/20 transition-all hover:-translate-y-0.5"
        >
          <Plus className="w-5 h-5" /> Tạo Chương Trình
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-8">
        
        {/* Active Promos Banner */}
        <div className="bg-gradient-to-r from-fuchsia-600 to-purple-600 rounded-2xl p-6 text-white mb-8 shadow-lg shadow-fuchsia-600/20 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Zap className="w-8 h-8 text-white fill-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">Khuyến mãi tự động trên POS</h2>
              <p className="text-fuchsia-100 mt-1 text-sm">Khi tổng bill hoặc điều kiện khách hàng thỏa mãn, hệ thống POS sẽ tự gợi ý giảm giá.</p>
            </div>
          </div>
          <div className="bg-white/10 px-6 py-3 rounded-xl backdrop-blur-md border border-white/20 text-center shrink-0">
            <div className="text-3xl font-black">{promos.length}</div>
            <div className="text-xs uppercase tracking-wider font-bold text-fuchsia-200">Chương trình</div>
          </div>
        </div>

        {/* Promos Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-500 font-medium">Đang tải dữ liệu...</div>
          ) : promos.length === 0 ? (
            <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300 flex flex-col items-center">
              <Ticket className="w-16 h-16 opacity-20 mb-4" />
              <p className="text-lg font-bold text-slate-600">Chưa có khuyến mãi nào</p>
              <p className="mt-1">Bấm "Tạo Chương Trình" để bắt đầu thu hút khách hàng.</p>
            </div>
          ) : (
            promos.map(promo => {
              const hasPercent = promo.discount_percent > 0;
              const hasAmount = promo.discount_amount > 0;
              
              return (
                <div key={promo.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  {/* Decorative Elements */}
                  <div className="absolute -top-12 -right-12 w-32 h-32 bg-fuchsia-50 rounded-full transition-transform group-hover:scale-150 duration-500"></div>
                  <div className="absolute top-4 right-4 w-12 h-12 bg-fuchsia-100 rounded-full flex items-center justify-center text-fuchsia-600 z-10">
                    <Ticket className="w-6 h-6" />
                  </div>

                  <div className="relative z-10">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 uppercase mb-4 tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Hoạt động
                    </div>
                    
                    <h3 className="font-black text-xl text-slate-800 mb-2 pr-10 leading-snug">{promo.name}</h3>
                    
                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium flex items-center gap-2"><Tag className="w-4 h-4" /> Điều kiện Bill</span>
                        <span className="font-bold text-slate-800">&gt; {new Intl.NumberFormat('vi-VN').format(promo.min_order_value)} ₫</span>
                      </div>
                      
                      <div className="w-full h-px bg-slate-100"></div>
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500 font-medium flex items-center gap-2"><Percent className="w-4 h-4" /> Mức Giảm</span>
                        <div className="text-right">
                          {hasPercent && <div className="font-black text-fuchsia-600 text-lg">{promo.discount_percent}%</div>}
                          {hasAmount && <div className="font-black text-fuchsia-600 text-lg">-{new Intl.NumberFormat('vi-VN').format(promo.discount_amount)} ₫</div>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 flex justify-between items-center pt-4 border-t border-slate-100">
                      <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> Tự động áp dụng
                      </div>
                      <button onClick={() => handleDelete(promo.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                        <Trash2 className="w-5 h-5"/>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Gift className="w-6 h-6 text-fuchsia-600" /> Tạo Chương Trình
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-red-500 bg-slate-100 hover:bg-red-50 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-slate-50">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-800">
                <AlertCircle className="w-5 h-5 shrink-0 text-blue-600" />
                <p>Khuyến mãi này sẽ tự động xuất hiện trên màn hình thanh toán POS nếu giỏ hàng của khách thỏa mãn điều kiện.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Tên chương trình (Nhãn) <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 font-medium transition-all" required placeholder="VD: Khai trương giảm 10%" />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Áp dụng cho Hóa đơn từ (VNĐ) <span className="text-red-500">*</span></label>
                <input type="number" min="0" value={form.min_order_value} onChange={e => setForm({...form, min_order_value: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 font-black text-fuchsia-700 transition-all" required placeholder="0 ₫" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Giảm theo %</label>
                  <div className="relative">
                    <input type="number" min="0" max="100" value={form.discount_percent} onChange={e => setForm({...form, discount_percent: e.target.value})} className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 font-bold transition-all" placeholder="0" />
                    <Percent className="w-4 h-4 absolute right-4 top-3.5 text-slate-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Giảm trừ số tiền (VNĐ)</label>
                  <input type="number" min="0" value={form.discount_amount} onChange={e => setForm({...form, discount_amount: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-fuchsia-500/20 focus:border-fuchsia-500 font-bold transition-all" placeholder="0 ₫" />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-6 py-3 rounded-xl text-slate-600 bg-white border border-slate-200 font-bold hover:bg-slate-100 transition-colors">Hủy Bỏ</button>
                <button type="submit" className="flex-1 px-6 py-3 bg-fuchsia-600 text-white rounded-xl font-black hover:bg-fuchsia-700 shadow-lg shadow-fuchsia-600/30 transition-all hover:-translate-y-0.5">
                  Lưu Khuyến Mãi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
