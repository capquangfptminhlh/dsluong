import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, FileSpreadsheet, Activity, RefreshCcw, AlertTriangle, Calculator, Download, Calendar, Clock, Sparkles, Send, BrainCircuit, Bot } from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import HelpButton from '../components/HelpButton';
import API_BASE, { downloadAuthFile } from '../config/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    reportCount: 0,
    lastUpdate: null,
    // Real ERP Stats (computed from transactions)
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
  const [chatMessages, setChatMessages] = useState([{ sender: 'bot', text: 'Chào bạn! Tôi có thể giúp gì cho việc phân tích tài chính hôm nay?' }]);
  const [chatInput, setChatInput] = useState('');
  const [insights, setInsights] = useState({ insight: 'Doanh thu tháng này tăng trưởng 15% so với tháng trước.', recommendation: 'Tiếp tục duy trì các chiến dịch quảng cáo hiện tại.' });
  const chatEndRef = useRef(null);

  // Lấy sector từ localStorage
  const user = JSON.parse(localStorage.getItem('user')) || { name: 'Người dùng' };
  const sector = user.sector || 'retail';

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
        
        // Tính thuế (ước lượng)
        if (t.category.includes('Phân phối')) totalTax += t.amount * 0.015;
        else if (t.category.includes('Dịch vụ, xây dựng')) totalTax += t.amount * 0.07;
        else if (t.category.includes('Sản xuất')) totalTax += t.amount * 0.045;
        else if (t.category.includes('Khác')) totalTax += t.amount * 0.03;

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
        reportsCount: reportsRes.data.length,
        mappedProductsCount: mappingsRes.data.length,
        totalRevenue: totalRev,
        totalTax: totalTax,
        dailyRevenue: dailyRev,
        monthlyRevenue: monthlyRev,
        ordersToday: ordersTodayCount,
        newCustomers: Math.ceil(ordersTodayCount * 0.6), // Ước tính từ đơn hàng
        lowStock: 0, // Tính năng mở rộng sau
        debt: 0, // Tính năng mở rộng sau
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
      setChatMessages(prev => [...prev, { sender: 'bot', text: 'Không thể kết nối đến máy chủ AI. Vui lòng kiểm tra cấu hình API Key trong mục Cài đặt.' }]);
    }
  };

  useEffect(() => {
    if(user.phone) fetchStats();
  }, [user.phone]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const formatCurrency = (val) => {
    if (val >= 1000000000) return (val / 1000000000).toFixed(1) + ' Tỷ';
    if (val >= 1000000) return (val / 1000000).toFixed(1) + ' Tr';
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  const THRESHOLD = 1500000000; // 1.5 Tỷ VND (Max scale)
  const progressPercent = Math.min((stats.totalRevenue / THRESHOLD) * 100, 100);
  
  // Các mốc cảnh báo (Năm 2026 - Theo Infographic)
  const isOver1B = stats.totalRevenue > 1000000000;

  let progressColor = "bg-green-500";
  if (isOver1B) progressColor = "bg-red-600 animate-pulse";

  // Tính lịch nộp thuế (Nộp theo quý - Pháp luật Việt Nam)
  const calculateNextDeadline = () => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentDay = now.getDate();
    let deadline;
    let quarterName;
    
    // Quý 1: Hạn nộp 30/4
    // Quý 2: Hạn nộp 31/7
    // Quý 3: Hạn nộp 31/10
    // Quý 4: Hạn nộp 31/1 (Năm sau)
    
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
    <div className="h-full flex flex-col overflow-auto pb-8">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-2xl font-bold text-[var(--fg)]">Tổng quan Nhà Thuốc Nhân Đức</h2>
          <p className="text-[var(--muted)] mt-1">Xin chào {user.name}. Đây là tình hình bán thuốc &amp; cảnh báo kho dược của bạn.</p>
        </div>
        <button 
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--surface-warm)] rounded-[var(--radius-md)] transition-colors font-semibold shadow-[var(--elev-ring)] disabled:opacity-50"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* AI INSIGHTS BOX */}
      {insights.insight && (
        <div className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-6 shadow-[var(--elev-ring)] flex flex-col md:flex-row gap-6 items-center">
          <div className="w-16 h-16 bg-[var(--accent)]/10 rounded-[var(--radius-lg)] flex items-center justify-center shrink-0">
            <Sparkles className="w-8 h-8 text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-[var(--fg)] mb-1">AI Insight phát hiện:</h2>
            <p className="text-[var(--fg-2)] mb-3">{insights.insight}</p>
            <div className="bg-[var(--accent)]/10/50 rounded-[var(--radius-md)] p-4 border border-[var(--border)]">
              <span className="font-bold text-indigo-700">Đề xuất hành động: </span>
              <span className="text-[var(--fg)]">{insights.recommendation}</span>
            </div>
          </div>
        </div>
      )}

      {/* ZALO COMMUNITY FUNNEL */}
      {sector === 'spa' && (
        <a href="https://zalo.me/g/nhom_spa_demo" target="_blank" rel="noreferrer" className="block mb-8 bg-[var(--surface)] border border-pink-100 rounded-[var(--radius-lg)] p-6 shadow-[var(--elev-ring)] hover:shadow-[var(--elev-raised)] transition-shadow">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--fg)] flex items-center gap-2">🔥 Cộng Đồng Chủ Spa & Salon Việt Nam</h3>
              <p className="text-[var(--muted)] mt-1">Tham gia nhóm Zalo để trao đổi máy móc, mỹ phẩm giá sỉ và kinh nghiệm với 5000+ chủ Spa khác!</p>
            </div>
            <span className="px-6 py-2 bg-pink-50 text-pink-600 font-bold rounded-[var(--radius-md)] border border-pink-100 whitespace-nowrap">Tham gia ngay</span>
          </div>
        </a>
      )}
      {sector === 'fnb' && (
        <a href="https://zalo.me/g/nhom_fnb_demo" target="_blank" rel="noreferrer" className="block mb-8 bg-[var(--surface)] border border-orange-100 rounded-[var(--radius-lg)] p-6 shadow-[var(--elev-ring)] hover:shadow-[var(--elev-raised)] transition-shadow">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--fg)] flex items-center gap-2">🔥 Cộng Đồng Quán Ăn & Cafe Việt Nam</h3>
              <p className="text-[var(--muted)] mt-1">Nguồn sỉ nguyên liệu Pha chế, Thực phẩm và san nhượng mặt bằng giá tốt!</p>
            </div>
            <span className="px-6 py-2 bg-orange-50 text-orange-600 font-bold rounded-[var(--radius-md)] border border-orange-100 whitespace-nowrap">Tham gia ngay</span>
          </div>
        </a>
      )}
      {sector === 'fashion' && (
        <a href="https://zalo.me/g/nhom_fashion_demo" target="_blank" rel="noreferrer" className="block mb-8 bg-[var(--surface)] border border-purple-100 rounded-[var(--radius-lg)] p-6 shadow-[var(--elev-ring)] hover:shadow-[var(--elev-raised)] transition-shadow">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--fg)] flex items-center gap-2">🔥 Chợ Sỉ Thời Trang & Mỹ Phẩm</h3>
              <p className="text-[var(--muted)] mt-1">Tổng kho sỉ Quần áo, Túi xách Quảng Châu và VNXK. Tuyển sỉ và CTV toàn quốc!</p>
            </div>
            <span className="px-6 py-2 bg-purple-50 text-purple-600 font-bold rounded-[var(--radius-md)] border border-purple-100 whitespace-nowrap">Tham gia ngay</span>
          </div>
        </a>
      )}
      {(sector === 'retail' || !sector) && (
        <a href="https://zalo.me/g/nhom_retail_demo" target="_blank" rel="noreferrer" className="block mb-8 bg-[var(--surface)] border border-blue-100 rounded-[var(--radius-lg)] p-6 shadow-[var(--elev-ring)] hover:shadow-[var(--elev-raised)] transition-shadow">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--fg)] flex items-center gap-2">🔥 Hiệp Hội Chủ Tạp Hóa & Siêu Thị Mini</h3>
              <p className="text-[var(--muted)] mt-1">Kết nối các nhà phân phối hàng tiêu dùng giá gốc, xả kho cắt lỗ hàng tháng!</p>
            </div>
            <span className="px-6 py-2 bg-blue-50 text-blue-600 font-bold rounded-[var(--radius-md)] border border-blue-100 whitespace-nowrap">Tham gia ngay</span>
          </div>
        </a>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6">
        {/* Lịch Nộp Thuế Widget */}
        <div className={`col-span-1 p-4 lg:p-6 rounded-[var(--radius-lg)] shadow-[var(--elev-ring)] border flex flex-col justify-between transition-colors ${isDeadlineUrgent ? 'bg-red-50 border-red-200' : 'bg-[var(--surface)] border-[var(--border-soft)]'}`}>
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-3 rounded-[var(--radius-md)] ${isDeadlineUrgent ? 'bg-red-100 text-red-600' : 'bg-[var(--accent)]/10 text-[var(--accent)]'}`}>
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isDeadlineUrgent ? 'text-red-800' : 'text-[var(--fg)]'}`}>Lịch Nộp Thuế</h3>
                <p className={`text-sm ${isDeadlineUrgent ? 'text-red-600 font-medium' : 'text-[var(--muted)]'}`}>Hạn nộp Tờ khai {taxDeadline.quarterName}</p>
              </div>
            </div>
            <div className={`text-3xl font-black mb-1 ${isDeadlineUrgent ? 'text-red-700' : 'text-[var(--fg)]'}`}>{taxDeadline.dateString}</div>
          </div>
          
          <div className={`mt-4 p-3 rounded-lg flex items-center justify-between border ${isDeadlineUrgent ? 'bg-red-100 border-red-200' : 'bg-orange-50 border-orange-100'}`}>
            <div className={`flex items-center gap-2 font-semibold ${isDeadlineUrgent ? 'text-red-700' : 'text-orange-700'}`}>
              <Clock className={`w-5 h-5 ${isDeadlineUrgent ? 'animate-bounce' : 'animate-pulse'}`} />
              <span>Còn lại</span>
            </div>
            <span className={`text-xl font-black ${isDeadlineUrgent ? 'text-red-600 animate-pulse' : 'text-orange-600'}`}>{taxDeadline.daysLeft} ngày</span>
          </div>
          
          {isDeadlineUrgent && (
            <div className="mt-3 text-xs font-bold text-red-600 text-center uppercase tracking-wide">
              ⚠️ Sắp đến hạn nộp phạt, hãy nộp ngay!
            </div>
          )}
        </div>

        {/* TÍNH NĂNG MỚI: CẢNH BÁO CÁC NGƯỠNG DOANH THU */}
        <div className="col-span-1 lg:col-span-2 bg-[var(--surface)] p-4 lg:p-8 rounded-[var(--radius-lg)] shadow-[var(--elev-ring)] border border-[var(--border-soft)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-[var(--radius-md)] ${isOver1B ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'}`}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--fg)]">Giám sát Ngưỡng Doanh thu (Áp dụng 01/01/2026)</h3>
              <p className="text-sm text-[var(--muted)]">Mốc 1 Tỷ: Bắt đầu chịu Thuế & Bắt buộc Hóa đơn điện tử.</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-[var(--fg)]">{new Intl.NumberFormat('vi-VN').format(stats.totalRevenue)} <span className="text-lg text-[var(--muted)] font-medium">VNĐ</span></div>
          </div>
        </div>

        <div className="relative mt-8 mb-2">
          <div className="h-4 w-full bg-[var(--surface-warm)] rounded-full overflow-hidden shadow-inner">
            <div 
              className={`h-full ${progressColor} transition-all duration-1000 ease-out`}
              style={{ width: `${progressPercent}%` }}
            >
            </div>
          </div>
          
          {/* Markers */}
          <div className="absolute top-0 left-[66.66%] w-0.5 h-full bg-slate-300"></div>
          
          <div className="absolute top-6 left-[66.66%] -translate-x-1/2 text-xs font-bold text-[var(--muted)]">1 Tỷ Đồng/Năm</div>
        </div>
        
        <div className="mt-8 space-y-2">
          {isOver1B ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-[var(--radius-md)] text-sm border border-red-100 flex gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-base mb-1">🚨 QUÁ NGƯỠNG 1 TỶ: BẠN ĐÃ VƯỢT MỨC MIỄN THUẾ!</p>
                <p>Theo quy định, bạn bắt buộc phải chuyển sang hình thức Nộp thuế và Xuất Hóa đơn điện tử. <strong>Khuyến nghị bạn nên liên hệ mua dịch vụ Hóa đơn điện tử</strong> từ các nhà cung cấp uy tín (như MISA, Viettel, VNPT) để đáp ứng đúng quy định của pháp luật.</p>
              </div>
            </div>
          ) : (
             <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm font-semibold border border-green-100">
              ✨ KHÔNG PHẢI NỘP THUẾ: Doanh thu ≤ 1 Tỷ đồng/năm. Không phải kê khai thuế theo quý (trừ khi có yêu cầu).
            </div>
          )}
          {stats.totalBankTransfer > 0 && (
            <div className={`p-4 rounded-[var(--radius-md)] text-sm border flex gap-3 ${
              stats.totalBankTransfer > 400000000 
                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                : 'bg-[var(--accent)]/10/50 text-indigo-900 border-[var(--border)]'
            }`}>
              <BrainCircuit className="w-6 h-6 flex-shrink-0 mt-0.5 text-[var(--accent)]" />
              <div>
                <p className="font-bold text-sm mb-0.5">🔍 Giám sát Giao dịch Ngân hàng (VietQR / CK):</p>
                <p className="text-xs">
                  Tổng nhận qua tài khoản cá nhân: <strong>{new Intl.NumberFormat('vi-VN').format(stats.totalBankTransfer)} VNĐ</strong>.
                  {stats.totalBankTransfer > 400000000 ? (
                    <span> ⚠️ <strong>Cảnh báo:</strong> Doanh thu chuyển khoản đã vượt ngưỡng 400 triệu. Hãy chuẩn bị sao kê chi tiết và chứng từ bán hàng phòng trường hợp cơ quan thuế yêu cầu đối chiếu tài khoản thanh toán không dùng tiền mặt.</span>
                  ) : (
                    <span> Tình trạng giao dịch tài khoản ngân hàng của bạn hiện tại an toàn. Hệ thống tự động theo dõi để tránh vượt hạn mức kiểm tra.</span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
        {/* TÍNH NĂNG MỚI: MÁY TÍNH THUẾ */}
        <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] shadow-[var(--elev-ring)] border border-[var(--border-soft)] flex flex-col justify-between relative overflow-hidden col-span-1">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 bg-[var(--accent)]/10 text-[var(--accent)] rounded-[var(--radius-md)] flex items-center justify-center">
                <Calculator className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-[var(--fg-2)]">Thuế GTGT & TNCN dự kiến</h3>
            </div>
            <div className="text-3xl font-black text-[var(--fg)] mb-2">{formatCurrency(stats.totalTax)}</div>
            <p className="text-[var(--muted)] text-sm mb-4">Hệ thống bóc tách tỷ lệ % theo ngành nghề từ Sổ Bán Hàng.</p>
            <button 
              onClick={() => downloadAuthFile('/api/transactions/export-01cnkd', 'To-Khai-01-CNKD.xlsx').catch(() => alert('Không tải được file. Vui lòng đăng nhập lại.'))}
              className="inline-flex items-center gap-2 bg-[var(--accent)]/10 text-indigo-700 font-bold px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors border border-[var(--border)] shadow-[var(--elev-ring)] text-sm"
            >
              <Download className="w-4 h-4" /> Xuất Tờ Khai 01/CNKD
            </button>
          </div>
        </div>

        <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] shadow-[var(--elev-ring)] border border-[var(--border-soft)] flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-[var(--radius-md)] flex items-center justify-center"><FileSpreadsheet className="w-5 h-5"/></div>
            <h3 className="font-semibold text-[var(--fg-2)]">Sổ Bán Hàng (S2-HKD)</h3>
          </div>
          <div className="text-3xl font-bold text-[var(--fg)]">{stats.reportsCount} <span className="text-sm text-[var(--muted)] font-medium">Bản ghi</span></div>
          <Link to="/app/sales" className="text-primary text-sm font-bold mt-4 hover:underline">Quản lý sổ sách →</Link>
        </div>

        <div className="bg-[var(--surface)] p-6 rounded-[var(--radius-lg)] shadow-[var(--elev-ring)] border border-[var(--border-soft)] flex flex-col justify-center">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-[var(--radius-md)] flex items-center justify-center"><Activity className="w-5 h-5"/></div>
            <h3 className="font-semibold text-[var(--fg-2)]">Danh mục Hàng hóa</h3>
          </div>
          <div className="text-3xl font-bold text-[var(--fg)]">{stats.mappedProductsCount} <span className="text-sm text-[var(--muted)] font-medium">Mặt hàng</span></div>
          <Link to="/app/mapped" className="text-orange-500 text-sm font-bold mt-4 hover:underline">Phân loại tự động →</Link>
        </div>
      </div>

      {/* AI CHATBOT INTERFACE */}
      <div className="bg-[var(--surface)] rounded-[var(--radius-lg)] shadow-[var(--elev-ring)] border border-[var(--border-soft)] p-6 flex flex-col h-[400px] mb-8">
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-[var(--border-soft)]">
          <div className="w-10 h-10 bg-indigo-100 text-[var(--accent)] rounded-[var(--radius-md)] flex items-center justify-center"><BrainCircuit className="w-5 h-5"/></div>
          <div>
            <h2 className="font-bold text-[var(--fg)]">Trợ lý AI (Business Intelligence)</h2>
            <p className="text-xs text-[var(--muted)]">Hỏi đáp số liệu, tự động phân tích thị trường</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
          {chatMessages.map((msg, i) => (
            <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-[var(--radius-lg)] p-4 text-sm ${msg.sender === 'user' ? 'bg-[var(--accent)] text-white rounded-br-none' : 'bg-[var(--surface-warm)] text-[var(--fg)] rounded-bl-none font-medium leading-relaxed'}`}>
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
            placeholder="Hỏi AI: Lợi nhuận gộp hôm nay là bao nhiêu?..." 
            className="w-full pl-6 pr-14 py-4 bg-[var(--surface-warm)] border border-[var(--border)] rounded-[var(--radius-lg)] outline-none focus:border-indigo-500 focus:bg-[var(--surface)] focus:ring-4 focus:ring-indigo-50 transition-all font-medium"
          />
          <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[var(--radius-md)] flex items-center justify-center transition-transform hover:scale-105 active:scale-95 shadow-[var(--elev-raised)]">
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

    </div>
  );
}

