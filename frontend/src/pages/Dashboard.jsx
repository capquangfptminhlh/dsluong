import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, FileSpreadsheet, Activity, RefreshCcw, AlertTriangle, Calculator, Download, Calendar, Clock, Sparkles, Send, BrainCircuit, HeartPulse, ShieldCheck, Pill } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import API_BASE, { downloadAuthFile } from '../config/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    reportCount: 0,
    lastUpdate: null,
    dailyRevenue: 0,
    monthlyRevenue: 0,
    ordersToday: 0,
    newCustomers: 0,
    lowStock: 0,
    debt: 0,
    totalTax: 0,
    mappedProductsCount: 0,
    totalBankTransfer: 0
  });
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Xin chào Dược sĩ! Tôi là trợ lý AI Nhà Thuốc Nhân Đức. Tôi có thể hỗ trợ tra cứu hạn dùng, dự báo tồn kho hoặc phân tích doanh thu bán lẻ thuốc hôm nay.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [insights, setInsights] = useState({
    insight: 'Tỷ trọng đơn thuốc cảm cúm và hạ sốt tăng 18% so với tuần trước. Tồn kho hoạt chất Paracetamol và Amoxicillin còn an toàn.',
    recommendation: 'Ưu tiên xuất bán các lô thuốc có hạn dùng dưới 6 tháng theo chuẩn FEFO.'
  });
  const chatEndRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Dược sĩ' };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [reportsRes, mappingsRes, txRes, posRes] = await Promise.all([
        axios.get(`${API_BASE}/api/reports`),
        axios.get(`${API_BASE}/api/mappings`),
        axios.get(`${API_BASE}/api/transactions?user_id=${user.phone}`),
        axios.get(`${API_BASE}/api/pos/orders`)
      ]);
      
      const transactions = txRes.data || [];
      const posOrders = posRes.data || [];
      const now = new Date();
      
      let dailyRev = 0;
      let monthlyRev = 0;
      let ordersTodayCount = 0;
      let totalRev = 0;
      let totalTax = 0;
      let totalBankTransfer = 0;

      posOrders.forEach(o => {
        if (o.payment_method === 'bank' || o.payment_method === 'transfer' || o.payment_method === 'vietqr' || o.payment_method === 'qr' || o.payment_method === 'Chuyển khoản') {
          totalBankTransfer += o.total_amount;
        }
      });

      transactions.forEach(t => {
        totalRev += t.amount;
        if (t.category.includes('Phân phối') || t.category.includes('Thuốc')) totalTax += t.amount * 0.015;
        else if (t.category.includes('Dịch vụ')) totalTax += t.amount * 0.07;
        else totalTax += t.amount * 0.015;

        const d = new Date(t.date);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          monthlyRev += t.amount;
        }
        if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          dailyRev += t.amount;
          ordersTodayCount++;
        }
      });
      
      setStats({
        reportsCount: reportsRes.data?.length || 0,
        mappedProductsCount: mappingsRes.data?.length || 0,
        totalRevenue: totalRev,
        totalTax: totalTax,
        dailyRevenue: dailyRev,
        monthlyRevenue: monthlyRev,
        ordersToday: ordersTodayCount,
        newCustomers: Math.ceil(ordersTodayCount * 0.6),
        lowStock: 0,
        debt: 0,
        totalBankTransfer
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatInput('');
    
    try {
      const res = await axios.post(`${API_BASE}/api/ai/assistant`, { query: userMsg });
      setChatMessages(prev => [...prev, { sender: 'bot', text: res.data.reply }]);
    } catch (err) {
      console.error(err);
      setChatMessages(prev => [...prev, { sender: 'bot', text: 'Không thể kết nối đến máy chủ AI Dược khoa. Vui lòng kiểm tra lại kết nối mạng.' }]);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user.phone]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const formatCurrency = (val) => {
    if (val >= 1000000000) return (val / 1000000000).toFixed(1) + ' Tỷ';
    if (val >= 1000000) return (val / 1000000).toFixed(1) + ' Tr';
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  const THRESHOLD = 1500000000;
  const progressPercent = Math.min((stats.totalRevenue / THRESHOLD) * 100, 100);
  const isOver1B = stats.totalRevenue > 1000000000;
  const progressColor = isOver1B ? "bg-rose-600 animate-pulse" : "bg-emerald-500";

  const calculateNextDeadline = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentDay = now.getDate();
    let deadline;
    let quarterName;
    
    if (currentMonth < 3 || (currentMonth === 3 && currentDay <= 30)) {
      deadline = new Date(now.getFullYear(), 3, 30);
      quarterName = "Quý 1";
    } else if (currentMonth < 6 || (currentMonth === 6 && currentDay <= 31)) {
      deadline = new Date(now.getFullYear(), 6, 31);
      quarterName = "Quý 2";
    } else if (currentMonth < 9 || (currentMonth === 9 && currentDay <= 31)) {
      deadline = new Date(now.getFullYear(), 9, 31);
      quarterName = "Quý 3";
    } else {
      deadline = new Date(now.getFullYear() + 1, 0, 31);
      quarterName = "Quý 4";
    }
    
    const diffTime = deadline - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      quarterName,
      dateString: deadline.toLocaleDateString('vi-VN'),
      daysLeft: diffDays
    };
  };
  
  const taxDeadline = calculateNextDeadline();
  const isDeadlineUrgent = taxDeadline.daysLeft <= 15;

  return (
    <div className="h-full flex flex-col overflow-auto pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Tổng Quan Nhà Thuốc Nhân Đức</h2>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">Chuẩn GPP</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Xin chào {user.name || 'Dược sĩ'}. Báo cáo bán thuốc và giám sát kho dược thời gian thực.</p>
          </div>
        </div>
        <button 
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 rounded-xl transition-all text-xs font-bold disabled:opacity-50"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Làm mới dữ liệu
        </button>
      </div>

      {/* AI INSIGHTS BOX */}
      {insights.insight && (
        <div className="bg-white border border-emerald-200/80 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-4 items-center">
          <div className="w-12 h-12 bg-emerald-100/70 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-black text-slate-900">Trợ Lý Dược AI Nhân Đức phân tích:</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">FEFO Alert</span>
            </div>
            <p className="text-xs text-slate-600 mb-2">{insights.insight}</p>
            <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100 text-xs">
              <span className="font-bold text-emerald-800">Đề xuất hành động dược khoa: </span>
              <span className="text-slate-700">{insights.recommendation}</span>
            </div>
          </div>
        </div>
      )}

      {/* BANNER 100% PHARMACY COMMUNITY */}
      <a href="https://zalo.me/g/nhom_nhathuoc_demo" target="_blank" rel="noreferrer" className="block bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white text-emerald-600 rounded-xl border border-emerald-200 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                Cộng Đồng Dược Sĩ & Nhà Thuốc Chuẩn GPP Việt Nam
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">Kết nối nguồn thuốc sỉ chính hãng từ Dược Hậu Giang, Sanofi, Traphaco & cập nhật thông tư Bộ Y Tế mới nhất.</p>
            </div>
          </div>
          <span className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl whitespace-nowrap shadow-sm shadow-emerald-600/30 transition-all">Tham gia nhóm</span>
        </div>
      </a>

      {/* Lịch Thuế & Giám Sát Doanh Thu */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lịch Nộp Thuế */}
        <div className={`col-span-1 p-5 rounded-2xl shadow-sm border flex flex-col justify-between transition-colors bg-white ${isDeadlineUrgent ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200/80'}`}>
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2.5 rounded-xl ${isDeadlineUrgent ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hạn nộp thuế {taxDeadline.quarterName}</h3>
                <div className={`text-2xl font-black ${isDeadlineUrgent ? 'text-rose-700' : 'text-slate-900'}`}>{taxDeadline.dateString}</div>
              </div>
            </div>
          </div>
          
          <div className={`mt-3 p-3 rounded-xl flex items-center justify-between border ${isDeadlineUrgent ? 'bg-rose-100/70 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className={`flex items-center gap-1.5 text-xs font-bold ${isDeadlineUrgent ? 'text-rose-700' : 'text-slate-700'}`}>
              <Clock className={`w-4 h-4 ${isDeadlineUrgent ? 'animate-bounce text-rose-600' : 'text-emerald-600'}`} />
              <span>Thời gian còn lại</span>
            </div>
            <span className={`text-base font-black ${isDeadlineUrgent ? 'text-rose-600 animate-pulse' : 'text-emerald-700'}`}>{taxDeadline.daysLeft} ngày</span>
          </div>
        </div>

        {/* Giám Sát Ngưỡng Doanh Thu */}
        <div className="col-span-1 lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-3 gap-2">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${isOver1B ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Giám Sát Doanh Thu Bán Lẻ Thuốc</h3>
                <p className="text-xs text-slate-500">Mốc 1 Tỷ: Bắt buộc xuất Hóa đơn điện tử máy tính tiền cho nhà thuốc</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-slate-900">{new Intl.NumberFormat('vi-VN').format(stats.totalRevenue)} <span className="text-xs text-slate-500 font-medium">VNĐ</span></div>
            </div>
          </div>

          <div className="relative my-4">
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full ${progressColor} transition-all duration-1000 ease-out`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="absolute top-0 left-[66.66%] w-0.5 h-full bg-slate-400"></div>
            <div className="absolute top-4 left-[66.66%] -translate-x-1/2 text-[10px] font-bold text-slate-500">Mốc 1 Tỷ / Năm</div>
          </div>
          
          <div className="mt-6">
            {isOver1B ? (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs border border-rose-200 flex gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Đã vượt mốc 1 Tỷ VNĐ / năm</p>
                  <p className="mt-0.5">Nhà thuốc cần xuất Hóa đơn điện tử khởi tạo từ máy tính tiền kết nối cơ quan thuế.</p>
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200">
                ✓ Doanh thu an toàn dưới 1 Tỷ đồng/năm. Thuế khoán tính 1.5% trên doanh thu bán lẻ dược phẩm.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3 Thẻ thống kê */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-200">
                <Calculator className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-600 uppercase">Thuế Dược Phẩm (1.5%)</h3>
            </div>
            <div className="text-2xl font-black text-slate-900 mb-1">{formatCurrency(stats.totalTax)}</div>
            <p className="text-xs text-slate-500 mb-3">Tính trên doanh thu bán lẻ thuốc và TPCN</p>
          </div>
          <button 
            onClick={() => downloadAuthFile('/api/transactions/export-01cnkd', 'To-Khai-01-CNKD.xlsx').catch(() => alert('Không tải được file. Vui lòng đăng nhập lại.'))}
            className="inline-flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-2 rounded-xl border border-emerald-200 transition-colors text-xs"
          >
            <Download className="w-3.5 h-3.5" /> Xuất Tờ Khai 01/CNKD
          </button>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-200">
                <FileSpreadsheet className="w-4 h-4"/>
              </div>
              <h3 className="text-xs font-bold text-slate-600 uppercase">Sổ Bán Thuốc (S2-HKD)</h3>
            </div>
            <div className="text-2xl font-black text-slate-900 mb-1">{stats.reportsCount} <span className="text-xs text-slate-500 font-medium">Bản ghi</span></div>
            <p className="text-xs text-slate-500 mb-3">Hồ sơ kế toán và lưu vết đơn thuốc</p>
          </div>
          <Link to="/app/sales" className="text-emerald-700 text-xs font-bold hover:underline">Quản lý sổ sách dược →</Link>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center border border-teal-200">
                <Pill className="w-4 h-4"/>
              </div>
              <h3 className="text-xs font-bold text-slate-600 uppercase">Danh Mục Thuốc GPP</h3>
            </div>
            <div className="text-2xl font-black text-slate-900 mb-1">{stats.mappedProductsCount} <span className="text-xs text-slate-500 font-medium">Mặt hàng</span></div>
            <p className="text-xs text-slate-500 mb-3">Thuốc kê đơn, OTC và TPCN đã chuẩn hóa</p>
          </div>
          <Link to="/app/mapped" className="text-teal-700 text-xs font-bold hover:underline">Quản lý danh mục thuốc →</Link>
        </div>
      </div>

      {/* AI CHATBOT INTERFACE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col h-[380px]">
        <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-200">
            <BrainCircuit className="w-4 h-4"/>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Trợ Lý Dược Nhân Đức AI</h2>
            <p className="text-[11px] text-slate-500">Tư vấn tra cứu hoạt chất, tương tác thuốc và doanh số quầy</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-3 space-y-3 pr-2">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                msg.sender === 'user' 
                  ? 'bg-emerald-600 text-white rounded-br-none' 
                  : 'bg-slate-50 border border-slate-200/80 text-slate-800 rounded-bl-none font-medium'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        
        <form onSubmit={handleChat} className="relative">
          <input 
            type="text" 
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Hỏi AI Dược: Doanh thu thuốc hôm nay bao nhiêu? Lô Paracetamol nào cận date?..." 
            className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-50 text-xs transition-all"
          />
          <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-sm">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
