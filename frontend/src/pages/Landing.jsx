import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Heart, ShieldCheck, Pill, Stethoscope, Clock, Phone, MapPin, 
  CheckCircle2, Star, ArrowRight, Award, Sparkles, AlertCircle,
  HelpCircle, ChevronRight, UserCheck, Activity, PackageCheck,
  Truck, FileText, Search, Send, Check, Shield, Thermometer,
  HeartPulse, Building2, ExternalLink, MessageCircle, Navigation,
  Calendar, X, RefreshCw
} from 'lucide-react';
import logo from '../assets/logo.png';

export default function Landing() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [prescriptionForm, setPrescriptionForm] = useState({ name: '', phone: '', note: '' });

  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/app');
    }
  }, [navigate]);

  const categories = [
    { 
      id: 'ke_don', 
      title: 'Thuốc Kê Đơn Bác Sĩ', 
      desc: 'Kháng sinh, Tim mạch, Huyết áp, Tiểu đường, Cơ xương khớp. Kiểm tra tương tác thuốc 100% trước khi cấp phát.',
      icon: <Stethoscope className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
      tag: 'Chuẩn Toa',
      sample: 'Amoxicillin, Amlodipine, Metformin, Losartan...'
    },
    { 
      id: 'otc', 
      title: 'Thuốc Không Kê Đơn (OTC)', 
      desc: 'Hạ sốt, giảm đau, cảm cúm, viêm họng, đau dạ dày, tiêu hóa, dị ứng da liễu.',
      icon: <Pill className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
      tag: 'Tủ Thuốc Gia Đình',
      sample: 'Panadol Extra, Hapacol, Smecta, Loratadin...'
    },
    { 
      id: 'tpcn', 
      title: 'Thực Phẩm Bảo Vệ Sức Khỏe', 
      desc: 'Bổ tim mạch, não bộ, giải độc gan, mắt, bổ sung Canxi & Vitamin chính ngạch từ Úc, Mỹ, Nhật Bản.',
      icon: <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
      tag: 'Chính Hãng',
      sample: 'Blackmores, Nature Made, DHC, Ginkgo Biloba...'
    },
    { 
      id: 'duoc_my_pham', 
      title: 'Dược Mỹ Phẩm Trị Liệu', 
      desc: 'Chăm sóc da mụn, phục hồi da nhạy cảm, kem chống nắng y khoa từ các viện da liễu hàng đầu.',
      icon: <Heart className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
      tag: 'Chuẩn Da Liễu',
      sample: 'La Roche-Posay, Cetaphil, Bioderma, Eucerin...'
    },
    { 
      id: 'thiet_bi', 
      title: 'Thiết Bị Y Tế Gia Đình', 
      desc: 'Máy đo huyết áp tự động, máy đo đường huyết cá nhân, nhiệt kế hồng ngoại, máy xông khí dung, SpO2.',
      icon: <Activity className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
      tag: 'Bảo Hành 1 Đổi 1',
      sample: 'Omron Nhật Bản, Microlife Thụy Sĩ, Accu-Chek...'
    },
    { 
      id: 'me_be', 
      title: 'Mẹ Bầu & Em Bé', 
      desc: 'Vitamin tiền sản, canxi hữu cơ, men vi sinh tiêu hóa, sữa dinh dưỡng y học cho trẻ sơ sinh.',
      icon: <PackageCheck className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
      tag: 'An Toàn Cho Bé',
      sample: 'Elevit, BioGaia, Canxi Corbiere, LineaBon K2+D3...'
    },
  ];

  const commitments = [
    {
      title: '100% Thuốc Chính Hãng — Xuất Xứ Rõ Ràng',
      desc: 'Nhập trực tiếp từ các hãng dược phẩm hàng đầu: Dược Hậu Giang, Sanofi, AstraZeneca, Abbott, Traphaco. Đầy đủ hóa đơn VAT và số đăng ký Cục Quản Lý Dược.',
      icon: <Award className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />,
      highlight: 'Nói KHÔNG với hàng trôi nổi'
    },
    {
      title: 'Kho Lạnh Chuẩn GPP Bộ Y Tế',
      desc: 'Bảo quản nhiệt độ dưới 25°C và độ ẩm kiểm soát 24/7. Thuốc men vi sinh và kháng sinh được giữ trọn vẹn hoạt tính sinh học.',
      icon: <ShieldCheck className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />,
      highlight: 'Nhiệt ẩm chuẩn 24/24'
    },
    {
      title: 'Kiểm Soát Hạn Dùng Thông Minh (FEFO)',
      desc: 'Quy trình xuất thuốc ưu tiên lô cận hạn trước, tuyệt đối không xuất thuốc cận date hoặc hết hạn cho người bệnh.',
      icon: <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />,
      highlight: 'Hạn dùng luôn mới nhất'
    },
    {
      title: 'Dược Sĩ Đại Học Tư Vấn Tận Tâm',
      desc: 'Tư vấn đúng bệnh, đúng liều lượng, dặn dò thời điểm uống cặn kẽ. Tuyệt đối không chèo kéo, không bán thừa thuốc.',
      icon: <UserCheck className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />,
      highlight: 'Vì sức khỏe bệnh nhân'
    },
    {
      title: 'Bình Ổn Giá — Xuất Hóa Đơn VAT',
      desc: 'Niêm yết giá công khai theo quy định Bộ Y Tế. Xuất hóa đơn chi tiết từng viên thuốc, hỗ trợ người bệnh thanh toán bảo hiểm.',
      icon: <FileText className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />,
      highlight: 'Giá cả minh bạch 100%'
    },
    {
      title: 'Đo Huyết Áp & Sàng Lọc Miễn Phí',
      desc: 'Bà con Cần Giuộc có thể ghé quầy 172 QL50 bất kỳ lúc nào để đo huyết áp, kiểm tra đường huyết và SpO2 hoàn toàn miễn phí.',
      icon: <HeartPulse className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />,
      highlight: 'Miễn phí cho cộng đồng'
    }
  ];

  const steps = [
    { step: '01', title: 'Tiếp Nhận Nhu Cầu & Đơn Thuốc', desc: 'Lắng nghe triệu chứng khởi phát hoặc kiểm tra đơn thuốc chỉ định từ bác sĩ.' },
    { step: '02', title: 'Kiểm Tra Tiền Sử & Dị Ứng', desc: 'Khai thác tiền sử dị ứng, bệnh lý mạn tính (tiểu đường, dạ dày) và các thuốc đang dùng.' },
    { step: '03', title: 'Thẩm Định Toa & Tương Tác', desc: 'Đối chiếu liều lượng theo cân nặng, loại bỏ nguy cơ tương tác thuốc nguy hiểm.' },
    { step: '04', title: 'Dán Nhãn & Dặn Dò Liều Dùng', desc: 'Ghi rõ liều Sáng - Trưa - Chiều - Tối, thời điểm uống trước/sau ăn và kiêng cữ.' },
    { step: '05', title: 'Đồng Hành Sau Điều Trị', desc: 'Sẵn sàng giải đáp 24/7 qua hotline 0933.324.368, nhắc nhở tái khám khi cần thiết.' },
  ];

  const featuredMedicines = [
    { name: 'Panadol Extra Đỏ (Hộp 180 viên)', act: 'Paracetamol 500mg, Caffeine 65mg', mfg: 'GSK', use: 'Giảm đau nhanh, hạ sốt, đau nửa đầu, đau răng', cat: 'otc' },
    { name: 'Augmentin 1g (Hộp 14 viên)', act: 'Amoxicillin 875mg, Clavulanic 125mg', mfg: 'GSK - Nhập Pháp', use: 'Kháng sinh điều trị nhiễm khuẩn hô hấp, tai mũi họng', cat: 'ke_don' },
    { name: 'Amlor 5mg (Hộp 30 viên)', act: 'Amlodipine besylate 5mg', mfg: 'Pfizer (Mỹ)', use: 'Điều trị tăng huyết áp và đau thắt ngực ổn định', cat: 'ke_don' },
    { name: 'Blackmores Omega 3 Fish Oil 1000mg', act: 'EPA 180mg, DHA 120mg nguyên chất', mfg: 'Blackmores (Úc)', use: 'Bổ trợ tim mạch, sáng mắt, tăng cường trí nhớ', cat: 'tpcn' },
    { name: 'Nexium Mups 40mg (Hộp 28 viên)', act: 'Esomeprazole 40mg', mfg: 'AstraZeneca (Thụy Điển)', use: 'Trào ngược dạ dày thực quản (GERD), viêm loét dạ dày', cat: 'ke_don' },
    { name: 'Kem Dưỡng Cicaplast B5+ Phục Hồi', act: 'Madecassoside, Panthenol 5%', mfg: 'La Roche-Posay (Pháp)', use: 'Làm dịu da kích ứng, phục hồi da sau tổn thương', cat: 'duoc_my_pham' },
    { name: 'Máy Đo Huyết Áp Omron HEM-7156', act: 'IntelliSense, vòng bít 360°', mfg: 'Omron (Nhật Bản)', use: 'Đo huyết áp và nhịp tim tại nhà chuẩn lâm sàng', cat: 'thiet_bi' },
    { name: 'Men Vi Sinh BioGaia Protectis Baby', act: 'Lactobacillus reuteri DSM 17938', mfg: 'BioGaia (Thụy Điển)', use: 'Cải thiện tiêu hóa, giảm nôn trớ ở trẻ nhỏ', cat: 'me_be' },
  ];

  const filteredMedicines = featuredMedicines.filter(m => {
    const matchCat = activeCategory === 'all' || m.cat === activeCategory;
    const matchSearch = !searchTerm || m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.act.toLowerCase().includes(searchTerm.toLowerCase()) || m.use.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSendPrescription = (e) => {
    e.preventDefault();
    if (!prescriptionForm.phone.trim()) return alert('Vui lòng nhập số điện thoại để Dược sĩ liên hệ!');
    alert(`Cảm ơn bạn! Đơn thuốc đã được chuyển đến Dược sĩ Nhân Đức (Trụ sở 172 QL50, Cần Giuộc). Dược sĩ sẽ gọi lại cho số ${prescriptionForm.phone} trong vòng 5 phút.`);
    setShowPrescriptionModal(false);
    setPrescriptionForm({ name: '', phone: '', note: '' });
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans text-slate-800 pb-28 md:pb-12" style={{ fontFamily: '"Inter", sans-serif' }}>
      
      {/* 1. TOP ANNOUNCEMENT BAR (Tối ưu gọn trên Mobile) */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-950 text-white text-[11px] sm:text-xs py-2 px-3 sm:px-6 border-b border-emerald-800/60 shadow-xs">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-2">
          <div className="flex items-center gap-2 sm:gap-4 truncate">
            <span className="flex items-center gap-1 font-bold text-emerald-300 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Chuẩn GPP Bộ Y Tế
            </span>
            <span className="hidden sm:inline text-emerald-700">•</span>
            <span className="truncate text-slate-200">
              172 QL50, KP4, TT. Cần Giuộc, Long An
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1 text-emerald-200">
              <Clock className="w-3 h-3 text-emerald-400" /> 07:00 - 22:00
            </span>
            <a 
              href="tel:0933324368" 
              className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full font-black text-[11px] sm:text-xs transition-colors"
            >
              <Phone className="w-3 h-3 text-slate-950" /> 0933.324.368
            </a>
          </div>
        </div>
      </div>

      {/* 2. NAVBAR HEADER (Thân thiện màn hình nhỏ) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex justify-between items-center gap-3">
          {/* Logo & Subtitle */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0">
            <img src={logo} alt="Nhà Thuốc Nhân Đức Cần Giuộc" className="h-11 sm:h-14 md:h-16 object-contain" />
            <div className="hidden sm:block">
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block border border-emerald-200">
                Chuẩn GPP Bộ Y Tế
              </div>
              <div className="text-[11px] text-slate-500 font-medium">172 QL50, TT. Cần Giuộc, Long An</div>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs font-bold text-slate-700 uppercase tracking-wide">
            <a href="#about" className="hover:text-emerald-700 transition-colors">Về Nhân Đức</a>
            <a href="#commitments" className="hover:text-emerald-700 transition-colors">6 Tiêu Chuẩn GPP</a>
            <a href="#medicines" className="hover:text-emerald-700 transition-colors">Tra Cứu Thuốc</a>
            <a href="#workflow" className="hover:text-emerald-700 transition-colors">Quy Trình Dược</a>
            <a href="#contact" className="hover:text-emerald-700 transition-colors">Hệ Thống Quầy</a>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrescriptionModal(true)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Gửi Đơn Thuốc</span>
              <span className="sm:hidden">Gửi Toa</span>
            </button>
            <Link 
              to="/login" 
              className="inline-flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-600/30 shrink-0"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cổng Quầy POS</span>
              <span className="sm:hidden">POS</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION (Tối ưu giao diện điện thoại) */}
      <section className="relative pt-6 sm:pt-10 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-1.5 sm:gap-2 bg-emerald-100/90 text-emerald-950 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-black border border-emerald-300 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="truncate">HỆ THỐNG NHÀ THUỐC ĐẠT CHUẨN GPP — BỘ Y TẾ CẤP PHÉP</span>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-[50px] font-black text-slate-900 tracking-tight leading-tight sm:leading-[1.18]">
              Hệ Thống Nhà Thuốc <br/>
              <span className="text-emerald-600">Nhân Đức Cần Giuộc</span><br/>
              <span className="text-slate-800 text-lg sm:text-2xl md:text-3xl font-bold">Chuẩn Y Đức — Vững Niềm Tin Sức Khỏe</span>
            </h1>

            <p className="text-xs sm:text-sm md:text-base text-slate-600 leading-relaxed font-medium">
              Tọa lạc tại trung tâm <strong>172 Quốc Lộ 50, KP4, TT. Cần Giuộc, Long An</strong>, Nhà Thuốc Nhân Đức 
              cam kết <strong>100% thuốc chính hãng</strong>, bảo quản kho lạnh đạt chuẩn GPP dưới 25°C và quản lý hạn dùng 
              thông minh <strong>FEFO</strong>. Đội ngũ Dược sĩ Đại học luôn túc trực tư vấn đúng bệnh, đúng liều lượng.
            </p>

            {/* Quick Action Buttons (Full width on Mobile) */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <a 
                href="tel:0933324368" 
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm px-6 py-3.5 rounded-2xl shadow-md shadow-emerald-600/30 transition-all text-center"
              >
                <Phone className="w-4 h-4 shrink-0" /> Gọi Dược Sĩ: 0933.324.368
              </a>
              <button 
                onClick={() => setShowPrescriptionModal(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl border border-slate-300 shadow-xs transition-all text-center"
              >
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" /> Chụp Ảnh Đơn Thuốc
              </button>
            </div>

            {/* 4 Trust Metrics (2x2 on Mobile) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 pt-4 sm:pt-6 border-t border-slate-200">
              <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">100%</div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-800 mt-0.5">Thuốc Chính Hãng</div>
                <div className="text-[10px] text-slate-400">Đầy đủ hóa đơn VAT</div>
              </div>
              <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">&lt; 25°C</div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-800 mt-0.5">Kho Lạnh GPP</div>
                <div className="text-[10px] text-slate-400">Độ ẩm kiểm soát 24/7</div>
              </div>
              <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">FEFO</div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-800 mt-0.5">Quản Trị Date</div>
                <div className="text-[10px] text-slate-400">Hạn dùng luôn mới</div>
              </div>
              <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">2H</div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-800 mt-0.5">Giao Hỏa Tốc</div>
                <div className="text-[10px] text-slate-400">Khu vực Cần Giuộc</div>
              </div>
            </div>
          </div>

          {/* Right Hero: Showcase Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-5 sm:p-7 border-2 border-emerald-200 shadow-xl space-y-4 sm:space-y-5">
              
              {/* Header Card */}
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs shrink-0">
                    <Heart className="w-5 h-5 sm:w-6 sm:h-6 fill-emerald-600 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm sm:text-base leading-tight">Nhà Thuốc Nhân Đức</h3>
                    <p className="text-[11px] sm:text-xs font-bold text-emerald-700">Trụ Sở Chính — Cần Giuộc, Long An</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] sm:text-[11px] font-black rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span> Mở Cửa
                  </span>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium mt-0.5">07:00 – 22:00</div>
                </div>
              </div>

              {/* Exact Location Box */}
              <div className="bg-emerald-50/80 p-3.5 sm:p-4 rounded-2xl border border-emerald-200 space-y-2 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900 text-[11px] sm:text-xs">Địa chỉ quầy thuốc:</strong>
                    <div className="text-slate-800 font-bold mt-0.5 leading-snug text-xs sm:text-[13px]">
                      172 Quốc Lộ 50, KP4, TT. Cần Giuộc, H. Cần Giuộc, Tỉnh Long An
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-emerald-200/70">
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <a href="tel:0933324368" className="font-black text-emerald-900 hover:underline">0933.324.368</a>
                  </div>
                  <a 
                    href="https://maps.google.com/?q=172+Quoc+Lo+50+Can+Giuoc+Long+An" 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-white px-2 py-1 rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <Navigation className="w-3 h-3" /> Chỉ đường
                  </a>
                </div>
              </div>

              {/* 3 Core Services */}
              <div className="space-y-2.5">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">Đo Huyết Áp & Sàng Lọc Miễn Phí</div>
                    <div className="text-[11px] text-slate-500 truncate">Phục vụ bà con trực tiếp tại quầy 172 QL50</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                    <Pill className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">Bán Đúng Liều — Không Bán Thừa Thuốc</div>
                    <div className="text-[11px] text-slate-500 truncate">Tư vấn chuẩn phác đồ, đúng hoạt chất</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">Giao Thuốc Tận Nhà Trong 2 Giờ</div>
                    <div className="text-[11px] text-slate-500 truncate">Đóng gói kín đáo, hướng dẫn kèm toa</div>
                  </div>
                </div>
              </div>

              {/* Quick Call Action */}
              <a 
                href="tel:0933324368" 
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs sm:text-sm font-black shadow-md shadow-emerald-600/30 transition-all text-center"
              >
                <Phone className="w-4 h-4 shrink-0" /> Gọi Dược Sĩ: 0933.324.368
              </a>
            </div>
          </div>

        </div>
      </section>

      {/* 4. 6 TIÊU CHUẨN VÀNG GPP */}
      <section id="commitments" className="py-12 sm:py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-2 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              Chất Lượng Vượt Trội
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              6 Tiêu Chuẩn Vàng Tại Nhà Thuốc Nhân Đức
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              Cam kết mang lại sự an tâm tuyệt đối về chất lượng thuốc và quy chuẩn Y Đức hàng đầu.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {commitments.map((c, idx) => (
              <div 
                key={idx} 
                className="bg-slate-50/70 p-5 sm:p-7 rounded-3xl border border-slate-200 hover:border-emerald-300 hover:bg-white hover:shadow-lg transition-all flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="p-2.5 sm:p-3 bg-emerald-50 rounded-2xl w-fit border border-emerald-100 text-emerald-600 mb-3">
                    {c.icon}
                  </div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 mb-1.5 leading-snug">{c.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-normal">{c.desc}</p>
                </div>
                <div className="pt-2.5 border-t border-slate-200/60">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> {c.highlight}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. TRA CỨU DANH MỤC THUỐC & SẢN PHẨM NỔI BẬT */}
      <section id="medicines" className="py-12 sm:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 space-y-2 sm:space-y-3">
          <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            Kho Dược Đa Dạng
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            Danh Mục Thuốc & Dược Phẩm Chính Hãng
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            Hơn 5.000 mặt hàng thuốc tân dược, thuốc kê đơn, TPCN nhập khẩu và thiết bị y tế luôn có sẵn tại 172 QL50.
          </p>

          {/* Search Bar */}
          <div className="pt-3 max-w-xl mx-auto relative">
            <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3.5 sm:left-4 top-3.5 sm:top-4 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm thuốc, hoạt chất (Panadol, Augmentin, Omron)..."
              className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-xs sm:text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 shadow-sm transition-all"
            />
          </div>
        </div>

        {/* Category Pills (Cuộn ngang mượt mà trên Mobile) */}
        <div className="flex gap-2 overflow-x-auto pb-3 px-1 no-scrollbar mb-6 -mx-4 px-4 sm:mx-0 sm:justify-center">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
              activeCategory === 'all' 
                ? 'bg-emerald-600 text-white shadow-sm' 
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Tất Cả Danh Mục
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                activeCategory === cat.id 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>

        {/* Medicines Grid (1 cột mobile, 2 cột tablet, 4 cột desktop) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredMedicines.map((item, idx) => (
            <div 
              key={idx} 
              className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200">
                    Chính Hãng
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">GPP Verified</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 leading-snug">{item.name}</h4>
                <div className="text-[11px] text-emerald-800 font-semibold font-mono bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-100">
                  {item.act}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{item.use}</p>
                <div className="text-[11px] text-slate-400 font-medium">Hãng: {item.mfg}</div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-black text-emerald-800">Giá Niêm Yết</span>
                <a 
                  href={`tel:0933324368`} 
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 transition-all flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" /> Tư Vấn
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile Callout: Đơn thuốc */}
        <div className="mt-8 sm:mt-12 bg-gradient-to-r from-emerald-700 to-teal-800 rounded-3xl p-5 sm:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-5 shadow-lg">
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-base sm:text-xl font-black">Bạn đang có toa thuốc Bác Sĩ bệnh viện?</h3>
            <p className="text-xs sm:text-sm text-emerald-100">
              Gửi ảnh chụp toa thuốc, Dược sĩ Nhân Đức sẽ đối chiếu tương tác và báo giá ngay trong 5 phút.
            </p>
          </div>
          <button
            onClick={() => setShowPrescriptionModal(true)}
            className="w-full md:w-auto px-6 py-3 bg-white text-emerald-950 font-black text-xs sm:text-sm rounded-2xl shadow-md transition-transform hover:scale-105 active:scale-95 text-center"
          >
            Tải Ảnh Toa Thuốc Lên Ngay
          </button>
        </div>
      </section>

      {/* 6. QUY TRÌNH 5 BƯỚC TƯ VẤN DÙNG THUỐC */}
      <section id="workflow" className="py-12 sm:py-20 bg-emerald-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-2 sm:space-y-3">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-300 bg-emerald-900 px-3.5 py-1 rounded-full border border-emerald-700">
              Chuẩn Hóa Y Khoa
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              Quy Trình 5 Bước Tư Vấn Dùng Thuốc An Toàn
            </h2>
            <p className="text-xs sm:text-sm text-emerald-200 font-medium">
              Tuân thủ nghiêm ngặt theo quy chuẩn Thực hành tốt nhà thuốc GPP của Bộ Y Tế.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-5">
            {steps.map((s, idx) => (
              <div 
                key={idx} 
                className="bg-emerald-900/60 border border-emerald-800/80 p-5 rounded-3xl relative flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono mb-1 sm:mb-2">{s.step}</div>
                  <h3 className="text-sm font-bold text-white mb-1.5 leading-snug">{s.title}</h3>
                  <p className="text-xs text-emerald-200/80 leading-relaxed font-normal">{s.desc}</p>
                </div>
                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider pt-2 border-t border-emerald-800">
                  Chuẩn GPP Bộ Y Tế
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. ĐỊA CHỈ & LIÊN HỆ */}
      <section id="contact" className="py-12 sm:py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl border-2 border-emerald-200 p-5 sm:p-10 shadow-lg space-y-6">
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Info */}
            <div className="lg:col-span-7 space-y-5">
              <div>
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Trụ Sở Chính
                </span>
                <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 mt-2 tracking-tight">
                  Nhà Thuốc Nhân Đức — 172 Quốc Lộ 50, Cần Giuộc
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1.5 font-medium leading-relaxed">
                  Ngay mặt tiền Quốc Lộ 50, bãi đỗ xe thông thoáng, Dược sĩ thường trực phục vụ xuyên suốt từ 07:00 đến 22:00.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400 font-bold uppercase">Địa chỉ quầy thuốc</div>
                    <div className="text-xs sm:text-sm font-black text-slate-900 mt-0.5 leading-snug">
                      172 Quốc Lộ 50, KP4, Thị trấn Cần Giuộc, Huyện Cần Giuộc, Tỉnh Long An
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-bold uppercase">Hotline Dược sĩ</div>
                      <a href="tel:0933324368" className="text-xs sm:text-sm font-black text-emerald-800 hover:underline">
                        0933.324.368
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-bold uppercase">Giờ mở cửa</div>
                      <div className="text-xs sm:text-sm font-black text-slate-900">
                        07:00 – 22:00 (Hàng ngày)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <a 
                  href="https://maps.google.com/?q=172+Quoc+Lo+50+Can+Giuoc+Long+An" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all text-center"
                >
                  <MapPin className="w-3.5 h-3.5" /> Chỉ Đường Google Maps <ExternalLink className="w-3 h-3" />
                </a>
                <a 
                  href="https://zalo.me/0933324368" 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-all text-center"
                >
                  <Send className="w-3.5 h-3.5" /> Nhắn Tin Zalo
                </a>
              </div>
            </div>

            {/* Right Cổng Quầy POS */}
            <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-emerald-950 text-white p-6 sm:p-7 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-700">
                <div className="p-2 bg-emerald-600/30 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
                  <Stethoscope className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-white">Cổng Quản Trị Quầy Thuốc</h3>
                  <p className="text-[11px] text-slate-400">Dành riêng cho Dược sĩ & Nhân viên</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Hệ thống bán lẻ thuốc chuẩn GPP, quản trị kho thuốc FEFO, theo dõi số lô & hạn dùng độc lập theo từng chi nhánh.
              </p>

              <div className="pt-1">
                <Link 
                  to="/login" 
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-4 rounded-xl text-xs shadow-md transition-all text-center"
                >
                  Đăng Nhập Quầy Bán Thuốc (POS) <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6 lg:px-8 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          <div className="space-y-3">
            <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-12 sm:h-14 object-contain brightness-0 invert" />
            <p className="leading-relaxed text-slate-300 font-medium">
              <strong>HỆ THỐNG NHÀ THUỐC NHÂN ĐỨC (CHUẨN GPP)</strong><br />
              Chuẩn Y Đức — Vững Niềm Tin Sức Khỏe Gia Đình Bạn.
            </p>
            <div className="text-[11px] space-y-1 text-slate-400">
              <div>Số GCN ĐĐKKDD: <strong>41/ĐKKDD-LA</strong> (Sở Y Tế Long An)</div>
              <div>GCN Thực hành tốt nhà thuốc: <strong>868/GPP-SYT</strong></div>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-white text-xs sm:text-sm mb-3 uppercase tracking-wider">Danh Mục Thuốc</h4>
            <ul className="space-y-2 text-[11px] sm:text-xs">
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thuốc Kê Đơn Bác Sĩ</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thuốc Không Kê Đơn (OTC)</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thực Phẩm Bảo Vệ Sức Khỏe</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Dược Mỹ Phẩm Trị Liệu</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thiết Bị Y Tế Gia Đình</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white text-xs sm:text-sm mb-3 uppercase tracking-wider">Tiêu Chuẩn & Cam Kết</h4>
            <ul className="space-y-2 text-[11px] sm:text-xs">
              <li><a href="#commitments" className="hover:text-emerald-400 transition-colors">100% Thuốc Chính Hãng</a></li>
              <li><a href="#commitments" className="hover:text-emerald-400 transition-colors">Kho Lạnh GPP Dưới 25°C</a></li>
              <li><a href="#commitments" className="hover:text-emerald-400 transition-colors">Quản Trị Hạn Dùng FEFO</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Đổi Trả Thuốc Trong 48H</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Giao Hỏa Tốc Cần Giuộc</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white text-xs sm:text-sm mb-3 uppercase tracking-wider">Thông Tin Liên Hệ</h4>
            <div className="space-y-2 text-[11px] sm:text-xs leading-relaxed">
              <div>
                <div className="text-slate-400">Trụ sở quầy:</div>
                <strong className="text-white">172 QL50, KP4, TT. Cần Giuộc, Long An</strong>
              </div>
              <div>
                <div className="text-slate-400">Hotline Dược sĩ:</div>
                <a href="tel:0933324368" className="text-sm font-black text-emerald-400 hover:underline">
                  0933.324.368
                </a>
              </div>
              <div>
                <div className="text-slate-400">Giờ làm việc:</div>
                <span className="text-white font-medium">07:00 – 22:00 tất cả các ngày</span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-800 text-center text-slate-500 text-[11px]">
          © {new Date().getFullYear()} Nhà Thuốc Nhân Đức. Tất cả quyền được bảo lưu. Chuẩn GPP Bộ Y Tế.
        </div>
      </footer>

      {/* 9. FIXED MOBILE BOTTOM ACTION BAR (Thanh hành động nhanh gắn đáy màn hình trên Mobile) */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 py-2 px-3 flex md:hidden items-center justify-around shadow-2xl">
        <a 
          href="tel:0933324368" 
          className="flex flex-col items-center gap-1 text-emerald-700 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30">
            <Phone className="w-5 h-5 animate-pulse" />
          </div>
          <span className="text-[10px] font-black">Gọi Dược Sĩ</span>
        </a>

        <a 
          href="https://zalo.me/0933324368" 
          target="_blank" 
          rel="noreferrer"
          className="flex flex-col items-center gap-1 text-blue-600 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
            <Send className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-black">Nhắn Zalo</span>
        </a>

        <button 
          onClick={() => setShowPrescriptionModal(true)}
          className="flex flex-col items-center gap-1 text-slate-800 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md">
            <FileText className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-black">Gửi Toa</span>
        </button>

        <a 
          href="https://maps.google.com/?q=172+Quoc+Lo+50+Can+Giuoc+Long+An" 
          target="_blank" 
          rel="noreferrer"
          className="flex flex-col items-center gap-1 text-teal-700 active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/30">
            <Navigation className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-black">Chỉ Đường</span>
        </a>
      </div>

      {/* 10. MODAL GỬI TOA THUỐC ONLINE */}
      {showPrescriptionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowPrescriptionModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 w-full max-w-lg shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">Gửi Toa Thuốc Bác Sĩ</h3>
                  <p className="text-[11px] text-slate-500">Dược sĩ Nhân Đức sẽ gọi lại tư vấn & báo giá trong 5 phút</p>
                </div>
              </div>
              <button onClick={() => setShowPrescriptionModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendPrescription} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên của bạn</label>
                <input 
                  type="text"
                  value={prescriptionForm.name}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, name: e.target.value })}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại liên hệ *</label>
                <input 
                  type="tel"
                  required
                  value={prescriptionForm.phone}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, phone: e.target.value })}
                  placeholder="VD: 0933xxxxxx"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên thuốc hoặc ghi chú triệu chứng</label>
                <textarea 
                  rows={3}
                  value={prescriptionForm.note}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, note: e.target.value })}
                  placeholder="Nhập tên các loại thuốc trong đơn hoặc mô tả triệu chứng..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50"
                />
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 space-y-1">
                <div>✓ Dược sĩ đại học gọi lại trong vòng 5 phút.</div>
                <div>✓ Tư vấn chuẩn phác đồ, đúng liều lượng, giao thuốc tận nhà.</div>
                <div>✓ Quầy thuốc: 172 QL50, KP4, TT. Cần Giuộc, Long An.</div>
              </div>

              <div className="flex gap-2 pt-1">
                <button 
                  type="button" 
                  onClick={() => setShowPrescriptionModal(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Đóng
                </button>
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-emerald-600/30 transition-all"
                >
                  Gửi Cho Dược Sĩ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
