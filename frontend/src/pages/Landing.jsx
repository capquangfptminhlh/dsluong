import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Heart, ShieldCheck, Pill, Stethoscope, Clock, Phone, MapPin, 
  CheckCircle2, Star, ArrowRight, Award, Sparkles, AlertCircle,
  HelpCircle, ChevronRight, UserCheck, Activity, PackageCheck,
  Truck, FileText, Search, Send, Check, Shield, Thermometer,
  Eye, Droplet, HeartPulse, Building2, ExternalLink
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
      title: 'Thuốc Kê Đơn Theo Toa Bác Sĩ', 
      desc: 'Kháng sinh, Tim mạch, Huyết áp, Tiểu đường, Thần kinh, Cơ xương khớp. Kiểm tra tương tác thuốc 100% trước khi cấp phát.',
      icon: <Stethoscope className="w-6 h-6 text-emerald-600" />,
      tag: 'Chuẩn Toa Bác Sĩ',
      sample: 'Amoxicillin, Amlodipine, Metformin, Losartan...'
    },
    { 
      id: 'otc', 
      title: 'Thuốc Không Kê Đơn (OTC)', 
      desc: 'Giảm đau hạ sốt, cảm cúm, viêm họng, ho có đờm, đau dạ dày, rối loạn tiêu hóa, dị ứng da liễu.',
      icon: <Pill className="w-6 h-6 text-emerald-600" />,
      tag: 'Tủ Thuốc Gia Đình',
      sample: 'Panadol Extra, Hapacol, Smecta, Loratadin...'
    },
    { 
      id: 'tpcn', 
      title: 'Thực Phẩm Bảo Vệ Sức Khỏe', 
      desc: 'Bổ tim mạch, bổ não, giải độc gan, bổ mắt, bổ sung Canxi & Vitamin tổng hợp chính hãng từ Úc, Mỹ, Nhật, Pháp.',
      icon: <Sparkles className="w-6 h-6 text-emerald-600" />,
      tag: 'Nhập Khẩu Chính Ngạch',
      sample: 'Blackmores, Nature Made, DHC, Ginkgo Biloba...'
    },
    { 
      id: 'duoc_my_pham', 
      title: 'Dược Mỹ Phẩm Trị Liệu & Da Liễu', 
      desc: 'Chăm sóc da mụn, phục hồi da nhạy cảm, kem chống nắng y khoa, dưỡng ẩm chuyên sâu từ các viện da liễu hàng đầu.',
      icon: <Heart className="w-6 h-6 text-emerald-600" />,
      tag: 'Khuyên Dùng Da Liễu',
      sample: 'La Roche-Posay, Cetaphil, Bioderma, Eucerin...'
    },
    { 
      id: 'thiet_bi', 
      title: 'Thiết Bị Y Tế & Chăm Sóc Gia Đình', 
      desc: 'Máy đo huyết áp bắp tay tự động, máy đo đường huyết cá nhân, nhiệt kế hồng ngoại, máy xông khí dung, máy đo oxy SpO2.',
      icon: <Activity className="w-6 h-6 text-emerald-600" />,
      tag: 'Bảo Hành Chính Hãng',
      sample: 'Omron Nhật Bản, Microlife Thụy Sĩ, Accu-Chek...'
    },
    { 
      id: 'me_be', 
      title: 'Sức Khỏe Mẹ Bầu & Em Bé', 
      desc: 'Vitamin tiền sản, canxi hữu cơ, men vi sinh tiêu hóa, sữa dinh dưỡng y học, tăng sức đề kháng cho bé sơ sinh.',
      icon: <PackageCheck className="w-6 h-6 text-emerald-600" />,
      tag: 'An Toàn Tuyệt Đối',
      sample: 'Elevit, BioGaia, Canxi Corbiere, LineaBon K2+D3...'
    },
  ];

  const commitments = [
    {
      title: '100% Thuốc Chính Hãng — Xuất Xứ Minh Bạch',
      desc: 'Thuốc và dược phẩm được nhập trực tiếp từ các tập đoàn dược phẩm uy tín: Dược Hậu Giang, Sanofi, AstraZeneca, Abbott, Traphaco. Đầy đủ hóa đơn chứng từ VAT và số đăng ký lưu hành của Cục Quản Lý Dược.',
      icon: <Award className="w-8 h-8 text-emerald-600" />,
      highlight: 'Nói KHÔNG với thuốc giả, thuốc trôi nổi'
    },
    {
      title: 'Bảo Quản Kho Lạnh Chuẩn GPP Bộ Y Tế',
      desc: 'Toàn bộ thuốc được bảo quản trong phòng máy lạnh nhiệt độ dưới 25°C, độ ẩm kiểm soát nghiêm ngặt 24/7. Thuốc nhạy cảm nhiệt độ như vaccine, men vi sinh được lưu trữ trong tủ chuyên dụng chuẩn GSP.',
      icon: <ShieldCheck className="w-8 h-8 text-emerald-600" />,
      highlight: 'Kiểm soát nhiệt độ & độ ẩm 24/24'
    },
    {
      title: 'Quản Lý Hạn Sử Dụng Thông Minh (FEFO)',
      desc: 'Hệ thống số hóa tự động giám sát số lô và hạn dùng (First Expired, First Out). Cảnh báo trước 6 tháng đối với các lô thuốc cận date, bảo đảm 100% thuốc xuất cho người bệnh luôn có date xa và chất lượng cao nhất.',
      icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
      highlight: 'Tuyệt đối không có thuốc cận date'
    },
    {
      title: 'Đội Ngũ Dược Sĩ Đại Học Tư Vấn Tận Tâm',
      desc: 'Được đào tạo chính quy, nắm vững dược lý và dược lâm sàng. Tư vấn đúng bệnh, đúng liều lượng, giải thích rõ cách uống và kiêng cữ. Tuyệt đối không chèo kéo, không ép mua thêm thực phẩm phụ không cần thiết.',
      icon: <UserCheck className="w-8 h-8 text-emerald-600" />,
      highlight: 'Tư vấn chuẩn Y Đức & vì bệnh nhân'
    },
    {
      title: 'Bình Ổn Giá Thuốc — Niêm Yết Công Khai',
      desc: 'Cam kết bán đúng giá niêm yết theo quy định của Bộ Y Tế. Mọi đơn thuốc đều được in hóa đơn chi tiết, rõ ràng từng viên thuốc và vỉ thuốc. Hỗ trợ xuất hóa đơn điện tử cho người bệnh có bảo hiểm.',
      icon: <FileText className="w-8 h-8 text-emerald-600" />,
      highlight: 'Minh bạch từng đồng, không phụ thu'
    },
    {
      title: 'Dịch Vụ Đo Khám Ban Đầu Hoàn Toàn Miễn Phí',
      desc: 'Bà con tại Cần Giuộc có thể ghé quầy thuốc bất kỳ lúc nào để được đo huyết áp, kiểm tra nồng độ oxy trong máu (SpO2) và kiểm tra chỉ số đường huyết định kỳ miễn phí 100%.',
      icon: <HeartPulse className="w-8 h-8 text-emerald-600" />,
      highlight: 'Đồng hành cùng sức khỏe cộng đồng'
    }
  ];

  const steps = [
    { 
      step: '01', 
      title: 'Tiếp Nhận Nhu Cầu & Đơn Thuốc', 
      desc: 'Lắng nghe kỹ lưỡng các triệu chứng khởi phát hoặc kiểm tra đơn thuốc chỉ định từ bác sĩ chuyên khoa.' 
    },
    { 
      step: '02', 
      title: 'Kiểm Tra Tiền Sử Bệnh & Dị Ứng', 
      desc: 'Khai thác tiền sử dị ứng thuốc, bệnh lý mạn tính (tiểu đường, dạ dày, huyết áp) và các loại thuốc đang dùng cùng lúc.' 
    },
    { 
      step: '03', 
      title: 'Thẩm Định Toa & Tương Tác Dược', 
      desc: 'Đối chiếu liều lượng phù hợp theo độ tuổi/cân nặng, loại bỏ nguy cơ tương tác thuốc nguy hiểm trước khi cấp phát.' 
    },
    { 
      step: '04', 
      title: 'Dán Nhãn & Dặn Dò Liều Dùng', 
      desc: 'Ghi rõ ràng liều uống Sáng - Trưa - Chiều - Tối, thời điểm uống (trước/sau ăn) và các thực phẩm cần kiêng khem.' 
    },
    { 
      step: '05', 
      title: 'Đồng Hành Theo Dõi Sau Điều Trị', 
      desc: 'Dược sĩ sẵn sàng giải đáp thắc mắc 24/7 qua hotline 0933.324.368, nhắc nhở tái khám khi bệnh nhân có diễn biến mới.' 
    },
  ];

  const featuredMedicines = [
    { name: 'Panadol Extra Đỏ (Hộp 180 viên)', act: 'Paracetamol 500mg, Caffeine 65mg', mfg: 'GSK (GlaxoSmithKline)', use: 'Giảm đau nhanh, hạ sốt, đau nửa đầu, đau răng', cat: 'otc' },
    { name: 'Augmentin 1g (Hộp 14 viên)', act: 'Amoxicillin 875mg, Clavulanic Acid 125mg', mfg: 'GSK - Nhập khẩu Pháp', use: 'Kháng sinh điều trị nhiễm khuẩn đường hô hấp, tai mũi họng', cat: 'ke_don' },
    { name: 'Amlor 5mg (Hộp 30 viên)', act: 'Amlodipine besylate 5mg', mfg: 'Pfizer (Mỹ)', use: 'Điều trị tăng huyết áp và đau thắt ngực ổn định', cat: 'ke_don' },
    { name: 'Blackmores Omega 3 Fish Oil 1000mg', act: 'EPA 180mg, DHA 120mg nguyên chất', mfg: 'Blackmores (Úc)', use: 'Bổ trợ tim mạch, sáng mắt, tăng cường trí nhớ não bộ', cat: 'tpcn' },
    { name: 'Nexium Mups 40mg (Hộp 28 viên)', act: 'Esomeprazole 40mg', mfg: 'AstraZeneca (Thụy Điển)', use: 'Điều trị trào ngược dạ dày thực quản (GERD), loét dạ dày', cat: 'ke_don' },
    { name: 'Kem Dưỡng Phục Hồi Da Cicaplast B5+', act: 'Madecassoside, Panthenol 5%, Tribioma', mfg: 'La Roche-Posay (Pháp)', use: 'Làm dịu da kích ứng, phục hồi hàng rào bảo vệ da sau tổn thương', cat: 'duoc_my_pham' },
    { name: 'Máy Đo Huyết Áp Bắp Tay Omron HEM-7156', act: 'Công nghệ IntelliSense, vòng bít 360°', mfg: 'Omron Healthcare (Nhật Bản)', use: 'Đo huyết áp và nhịp tim tại nhà chính xác chuẩn lâm sàng', cat: 'thiet_bi' },
    { name: 'Men Vi Sinh BioGaia Protectis Baby Drops', act: 'Lactobacillus reuteri DSM 17938', mfg: 'BioGaia (Thụy Điển)', use: 'Cải thiện tiêu hóa, giảm nôn trớ và đau bụng co thắt ở trẻ', cat: 'me_be' },
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
    <div className="min-h-screen bg-slate-50/50 font-sans text-slate-800" style={{ fontFamily: '"Inter", sans-serif' }}>
      
      {/* 1. TOP NOTICE & EMERGENCY MEDICAL BAR */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white text-xs py-2.5 px-4 md:px-8 border-b border-emerald-700/60 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            <span className="flex items-center gap-1.5 font-bold text-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Chuẩn GPP Bộ Y Tế: 868/GPP-SYT
            </span>
            <span className="hidden sm:inline text-emerald-600">•</span>
            <span className="flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-emerald-300" /> 172 Quốc Lộ 50, KP4, TT. Cần Giuộc, Long An
            </span>
            <span className="hidden lg:inline text-emerald-600">•</span>
            <span className="hidden lg:flex items-center gap-1.5 font-medium text-emerald-200">
              <Clock className="w-3.5 h-3.5 text-emerald-400" /> 07:00 - 22:00 (Mở cửa tất cả các ngày)
            </span>
          </div>

          <div className="flex items-center gap-4 font-bold">
            <span className="hidden md:inline-flex items-center gap-1 text-emerald-200">
              <Truck className="w-3.5 h-3.5 text-emerald-400" /> Giao thuốc hỏa tốc 2H tại Cần Giuộc
            </span>
            <a 
              href="tel:0933324368" 
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1 rounded-full font-black text-xs transition-colors shadow-xs"
            >
              <Phone className="w-3 h-3 text-slate-950" /> Hotline Dược Sĩ: 0933.324.368
            </a>
          </div>
        </div>
      </div>

      {/* 2. MAIN NAVBAR HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-4">
          {/* Logo Brand */}
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src={logo} alt="Nhà Thuốc Nhân Đức Cần Giuộc" className="h-14 md:h-16 object-contain" />
            <div className="hidden sm:block">
              <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md inline-block border border-emerald-200">
                Chuẩn GPP Bộ Y Tế
              </div>
              <div className="text-[11px] text-slate-500 font-medium">172 QL50, TT. Cần Giuộc, Long An</div>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold text-slate-700 uppercase tracking-wide">
            <a href="#about" className="hover:text-emerald-700 transition-colors">Về Nhân Đức</a>
            <a href="#commitments" className="hover:text-emerald-700 transition-colors">6 Tiêu Chuẩn Vàng</a>
            <a href="#medicines" className="hover:text-emerald-700 transition-colors">Tra Cứu Thuốc</a>
            <a href="#workflow" className="hover:text-emerald-700 transition-colors">Quy Trình Dược</a>
            <a href="#contact" className="hover:text-emerald-700 transition-colors">Hệ Thống Quầy</a>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowPrescriptionModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gửi Đơn Thuốc</span>
            </button>
            <Link 
              to="/login" 
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-600/30"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>Cổng Quầy Bán (POS)</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 3. HERO SECTION */}
      <section className="relative pt-10 pb-16 md:pt-16 md:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-hidden">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Hero Content */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-emerald-100/80 text-emerald-900 px-4 py-1.5 rounded-full text-xs font-extrabold border border-emerald-300 shadow-2xs">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>HỆ THỐNG NHÀ THUỐC ĐẠT CHUẨN GPP — BỘ Y TẾ CẤP PHÉP</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[54px] font-black text-slate-900 tracking-tight leading-[1.18]">
              Hệ Thống Nhà Thuốc <br/>
              <span className="text-emerald-600">Nhân Đức Cần Giuộc</span><br/>
              <span className="text-slate-800 text-2xl sm:text-3xl md:text-4xl font-bold">Chuẩn Y Đức — Vững Niềm Tin Sức Khỏe</span>
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-medium max-w-2xl">
              Tọa lạc tại trung tâm <strong>172 Quốc Lộ 50, Khu phố 4, TT. Cần Giuộc, Long An</strong>, Nhà Thuốc Nhân Đức 
              tự hào là điểm tựa sức khỏe uy tín của hàng ngàn gia đình. Chúng tôi cam kết <strong>100% thuốc chính hãng</strong>, 
              bảo quản kho lạnh đạt chuẩn GPP dưới 25°C, tiên phong ứng dụng công nghệ kiểm soát hạn sử dụng thông minh <strong>FEFO</strong>. 
              Đội ngũ Dược sĩ Đại học chuyên môn cao luôn sẵn sàng đồng hành tư vấn đúng bệnh, đúng liều lượng.
            </p>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a 
                href="tel:0933324368" 
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm px-7 py-3.5 rounded-2xl shadow-md shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-95"
              >
                <Phone className="w-4 h-4" /> Gọi Dược Sĩ: 0933.324.368
              </a>
              <button 
                onClick={() => setShowPrescriptionModal(true)}
                className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm px-6 py-3.5 rounded-2xl border border-slate-300 shadow-xs transition-all"
              >
                <FileText className="w-4 h-4 text-emerald-600" /> Tư Vấn Đơn Thuốc Bác Sĩ
              </button>
            </div>

            {/* 4 Trust Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-200">
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="text-2xl font-black text-emerald-700">100%</div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Thuốc Chính Hãng</div>
                <div className="text-[10px] text-slate-400">Đầy đủ hóa đơn VAT</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="text-2xl font-black text-emerald-700">&lt; 25°C</div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Kho Lạnh Chuẩn GPP</div>
                <div className="text-[10px] text-slate-400">Kiểm soát độ ẩm 24/7</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="text-2xl font-black text-emerald-700">FEFO</div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Quản Trị Hạn Dùng</div>
                <div className="text-[10px] text-slate-400">Date luôn mới nhất</div>
              </div>
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="text-2xl font-black text-emerald-700">2H</div>
                <div className="text-xs font-bold text-slate-700 mt-0.5">Giao Hỏa Tốc</div>
                <div className="text-[10px] text-slate-400">Nội ô Cần Giuộc & lân cận</div>
              </div>
            </div>
          </div>

          {/* Right Hero: Showcase Card */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-emerald-200/80 shadow-xl shadow-emerald-950/5 relative space-y-6">
              
              {/* Badge & Store Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-2xs">
                    <Heart className="w-6 h-6 fill-emerald-600 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Nhà Thuốc Nhân Đức</h3>
                    <p className="text-xs font-bold text-emerald-700">Trụ Sở Chính — Cần Giuộc, Long An</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Đang Mở Cửa
                  </span>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5">07:00 – 22:00</div>
                </div>
              </div>

              {/* Exact Location & Hotline Card */}
              <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 space-y-2 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900">Địa chỉ quầy thuốc:</strong>
                    <div className="text-slate-700 font-semibold mt-0.5 leading-relaxed">
                      172 Quốc Lộ 50, Khu phố 4, Thị trấn Cần Giuộc, Huyện Cần Giuộc, Tỉnh Long An
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 pt-1 border-t border-emerald-200/60">
                  <Phone className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <span className="text-slate-600">Đường dây nóng Dược sĩ: </span>
                    <a href="tel:0933324368" className="font-black text-emerald-800 hover:underline">0933.324.368</a>
                  </div>
                </div>
              </div>

              {/* 3 Core Services at counter */}
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <HeartPulse className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-900">Đo Huyết Áp & Khám Sàng Lọc Miễn Phí</div>
                    <div className="text-[11px] text-slate-500">Phục vụ bà con trực tiếp tại quầy 172 QL50</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <Pill className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-900">Bán Đúng Liều — Không Bán Thừa Thuốc</div>
                    <div className="text-[11px] text-slate-500">Tư vấn chuẩn phác đồ, đúng hoạt chất điều trị</div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-900">Giao Thuốc Tận Nhà Trong 2 Giờ</div>
                    <div className="text-[11px] text-slate-500">Đóng gói kín đáo, hướng dẫn sử dụng kèm toa</div>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Call */}
              <div className="pt-2">
                <a 
                  href="tel:0933324368" 
                  className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black shadow-md shadow-emerald-600/30 transition-all text-center"
                >
                  <Phone className="w-4 h-4" /> Gọi Dược Sĩ Trực Quầy Ngay (0933.324.368)
                </a>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 4. 6 TIÊU CHUẨN VÀNG TẠO NÊN ĐẲNG CẤP NHÀ THUỐC NHÂN ĐỨC */}
      <section id="commitments" className="py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3.5 py-1 rounded-full border border-emerald-200">
              Chất Lượng Vượt Trội
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              6 Tiêu Chuẩn Vàng Tại Nhà Thuốc Nhân Đức
            </h2>
            <p className="text-sm text-slate-600 font-medium leading-relaxed">
              Chúng tôi xây dựng hệ thống nhà thuốc không chỉ để phân phối dược phẩm, mà là để mang lại sự an tâm tuyệt đối 
              về nguồn gốc, chất lượng bảo quản và sự tận tụy trong từng lời khuyên dùng thuốc.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {commitments.map((c, idx) => (
              <div 
                key={idx} 
                className="bg-slate-50/70 p-7 rounded-3xl border border-slate-200 hover:border-emerald-300 hover:bg-white hover:shadow-xl transition-all group flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="p-3 bg-emerald-50 rounded-2xl w-fit border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-colors mb-4">
                    {c.icon}
                  </div>
                  <h3 className="text-base font-black text-slate-900 mb-2 leading-snug">{c.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-normal">{c.desc}</p>
                </div>
                <div className="pt-3 border-t border-slate-200/60">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    <Check className="w-3.5 h-3.5" /> {c.highlight}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. TRA CỨU DANH MỤC THUỐC & SẢN PHẨM NỔI BẬT */}
      <section id="medicines" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 space-y-3">
          <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3.5 py-1 rounded-full border border-emerald-200">
            Kho Dược Đa Dạng
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Danh Mục Thuốc & Dược Phẩm Chính Hãng
          </h2>
          <p className="text-sm text-slate-600 font-medium">
            Hơn 5.000 mặt hàng thuốc tân dược, thuốc kê đơn, TPCN nhập khẩu và thiết bị y tế luôn có sẵn tại quầy 172 QL50.
          </p>

          {/* Live Search Bar */}
          <div className="pt-4 max-w-xl mx-auto relative">
            <Search className="w-5 h-5 absolute left-4 top-4 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nhập tên thuốc, hoạt chất (VD: Panadol, Augmentin, Omron, Blackmores)..."
              className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-slate-200 rounded-2xl text-xs sm:text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 shadow-sm transition-all"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 overflow-x-auto pb-4 justify-start sm:justify-center no-scrollbar mb-8">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
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
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategory === cat.id 
                  ? 'bg-emerald-600 text-white shadow-sm' 
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>

        {/* Medicines Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredMedicines.map((item, idx) => (
            <div 
              key={idx} 
              className="bg-white p-5 rounded-3xl border border-slate-200 hover:border-emerald-300 hover:shadow-lg transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200">
                    Chính Hãng
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">GPP Verified</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 leading-snug pt-1">{item.name}</h4>
                <div className="text-[11px] text-emerald-700 font-semibold font-mono bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100">
                  {item.act}
                </div>
                <p className="text-xs text-slate-500 line-clamp-2">{item.use}</p>
                <div className="text-[11px] text-slate-400 font-medium">Hãng: {item.mfg}</div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
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

        {/* Banner Nhắc Nhở Đơn Thuốc */}
        <div className="mt-12 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-3xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-emerald-950/10">
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-lg sm:text-xl font-black">Bạn đang có toa thuốc của Bác Sĩ bệnh viện?</h3>
            <p className="text-xs sm:text-sm text-emerald-100">
              Gửi ảnh chụp toa thuốc, Dược sĩ Nhân Đức sẽ đối chiếu tương tác, kiểm tra thuốc sẵn kho và báo giá ngay trong 5 phút.
            </p>
          </div>
          <button
            onClick={() => setShowPrescriptionModal(true)}
            className="px-6 py-3 bg-white text-emerald-900 hover:bg-emerald-50 font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 shrink-0"
          >
            Tải Ảnh Toa Thuốc Lên Ngay
          </button>
        </div>
      </section>

      {/* 6. QUY TRÌNH 5 BƯỚC TƯ VẤN DÙNG THUỐC AN TOÀN */}
      <section id="workflow" className="py-20 bg-emerald-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-300 bg-emerald-900 px-3.5 py-1 rounded-full border border-emerald-700">
              Chuẩn Hóa Y Khoa
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Quy Trình 5 Bước Tư Vấn Dùng Thuốc An Toàn
            </h2>
            <p className="text-sm text-emerald-200 font-medium">
              Tại Nhân Đức, sự an toàn tính mạng của người bệnh là tuyệt đối. Mọi đơn thuốc đều tuân thủ nghiêm ngặt quy trình 5 bước.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {steps.map((s, idx) => (
              <div 
                key={idx} 
                className="bg-emerald-900/60 border border-emerald-800/80 p-6 rounded-3xl relative flex flex-col justify-between space-y-4 hover:border-emerald-500 transition-colors"
              >
                <div>
                  <div className="text-3xl font-black text-emerald-400 font-mono mb-2">{s.step}</div>
                  <h3 className="text-sm font-bold text-white mb-2 leading-snug">{s.title}</h3>
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

      {/* 7. THÔNG TIN QUẦY THUỐC & BẢN ĐỒ CẦN GIUỘC */}
      <section id="contact" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl border-2 border-emerald-200 p-6 sm:p-10 shadow-lg space-y-8">
          
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Info */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Trụ Sở Chính
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 tracking-tight">
                  Nhà Thuốc Nhân Đức — 172 Quốc Lộ 50, Cần Giuộc
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-2 font-medium">
                  Vị trí thuận tiện ngay mặt tiền Quốc Lộ 50, bãi đỗ xe máy và ô tô thông thoáng. Dược sĩ thường trực phục vụ bà con xuyên suốt từ 07:00 đến 22:00.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Địa chỉ chính xác</div>
                    <div className="text-sm font-black text-slate-900 mt-0.5 leading-snug">
                      172 Quốc Lộ 50, Khu phố 4, Thị trấn Cần Giuộc, Huyện Cần Giuộc, Tỉnh Long An
                    </div>
                    <div className="text-xs text-emerald-700 font-medium mt-1">
                      (Nằm trên trục đường chính QL50, gần trung tâm thị trấn Cần Giuộc)
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold uppercase">Hotline Dược sĩ</div>
                      <a href="tel:0933324368" className="text-sm font-black text-emerald-800 hover:underline">
                        0933.324.368
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-bold uppercase">Giờ mở cửa</div>
                      <div className="text-sm font-black text-slate-900">
                        07:00 – 22:00 (Hàng ngày)
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <a 
                  href="https://maps.google.com/?q=172+Quoc+Lo+50+Can+Giuoc+Long+An" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-xs transition-all"
                >
                  <MapPin className="w-4 h-4" /> Chỉ Đường Google Maps <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <a 
                  href="https://zalo.me/0933324368" 
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-xs transition-all"
                >
                  <Send className="w-4 h-4" /> Nhắn Tin Zalo Dược Sĩ
                </a>
              </div>
            </div>

            {/* Right Cổng Quầy Bán POS */}
            <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-emerald-950 text-white p-7 rounded-3xl space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-700">
                <div className="p-2.5 bg-emerald-600/30 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">Cổng Quản Trị Quầy Thuốc</h3>
                  <p className="text-xs text-slate-400">Dành riêng cho Dược sĩ & Nhân viên nhà thuốc</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-normal">
                Hệ thống phần mềm bán lẻ thuốc chuẩn GPP, kết nối quản trị kho thuốc FEFO, theo dõi số lô & hạn dùng, 
                và quản trị chuỗi chi nhánh phụ độc lập.
              </p>

              <div className="space-y-3 pt-2">
                <Link 
                  to="/login" 
                  className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-4 rounded-xl text-xs shadow-md transition-all text-center"
                >
                  Đăng Nhập Quầy Bán Thuốc (POS) <ArrowRight className="w-4 h-4" />
                </Link>
                <div className="text-[11px] text-center text-slate-400">
                  Hệ thống bảo mật nội bộ Nhà Thuốc Nhân Đức
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 8. FOOTER CHUẨN PHÁP LÝ BỘ Y TẾ */}
      <footer className="bg-slate-900 text-slate-400 py-16 px-4 sm:px-6 lg:px-8 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          
          {/* Col 1: Brand Info */}
          <div className="space-y-4">
            <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-16 object-contain brightness-0 invert" />
            <p className="leading-relaxed text-slate-300 font-medium">
              <strong>HỆ THỐNG NHÀ THUỐC NHÂN ĐỨC (CHUẨN GPP)</strong><br />
              Chuẩn Y Đức — Vững Niềm Tin Sức Khỏe Gia Đình Bạn.
            </p>
            <div className="text-[11px] space-y-1 text-slate-400">
              <div>Số GCN ĐĐKKDD: <strong>41/ĐKKDD-LA</strong> (Sở Y Tế Long An)</div>
              <div>GCN Thực hành tốt nhà thuốc: <strong>868/GPP-SYT</strong></div>
              <div>Dược sĩ phụ trách chuyên môn: <strong>DS. CKI Lê Huỳnh Minh</strong></div>
            </div>
          </div>

          {/* Col 2: Danh mục */}
          <div>
            <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider">Danh Mục Dược Phẩm</h4>
            <ul className="space-y-2.5">
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thuốc Kê Đơn Theo Toa Bác Sĩ</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thuốc Không Kê Đơn (OTC)</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thực Phẩm Bảo Vệ Sức Khỏe</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Dược Mỹ Phẩm Trị Liệu Da Liễu</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Thiết Bị Y Tế & Chăm Sóc Gia Đình</a></li>
              <li><a href="#medicines" className="hover:text-emerald-400 transition-colors">Sản Phẩm Dinh Dưỡng Mẹ & Bé</a></li>
            </ul>
          </div>

          {/* Col 3: Cam kết */}
          <div>
            <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider">Chính Sách & Cam Kết</h4>
            <ul className="space-y-2.5">
              <li><a href="#commitments" className="hover:text-emerald-400 transition-colors">Cam Kết 100% Thuốc Chính Hãng</a></li>
              <li><a href="#commitments" className="hover:text-emerald-400 transition-colors">Quy Chuẩn Bảo Quản Lạnh GPP</a></li>
              <li><a href="#commitments" className="hover:text-emerald-400 transition-colors">Quản Lý Số Lô & Date FEFO</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Chính Sách Đổi Trả Trong 48 Giờ</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Bảo Mật Thông Tin Bệnh Án</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Giao Thuốc Hỏa Tốc Tại Cần Giuộc</a></li>
            </ul>
          </div>

          {/* Col 4: Liên hệ quầy */}
          <div>
            <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider">Thông Tin Liên Hệ</h4>
            <div className="space-y-3 leading-relaxed">
              <div>
                <div className="text-slate-400">Trụ sở quầy thuốc:</div>
                <strong className="text-white">172 Quốc Lộ 50, KP4, TT. Cần Giuộc, H. Cần Giuộc, Long An</strong>
              </div>
              <div>
                <div className="text-slate-400">Đường dây nóng Dược sĩ:</div>
                <a href="tel:0933324368" className="text-base font-black text-emerald-400 hover:underline block">
                  0933.324.368
                </a>
              </div>
              <div>
                <div className="text-slate-400">Thời gian làm việc:</div>
                <span className="text-white font-medium">07:00 – 22:00 tất cả các ngày trong tuần</span>
              </div>
            </div>
          </div>

        </div>

        <div className="max-w-7xl mx-auto pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <div>
            © {new Date().getFullYear()} Nhà Thuốc Nhân Đức. Tất cả quyền được bảo lưu. Đạt chuẩn GPP Bộ Y Tế.
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Địa chỉ: 172 QL50, Cần Giuộc, Long An</span>
            <span>•</span>
            <span>Hotline: 0933.324.368</span>
          </div>
        </div>
      </footer>

      {/* 9. MODAL GỬI TOA THUỐC ONLINE */}
      {showPrescriptionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPrescriptionModal(false)}>
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-200">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Gửi Toa Thuốc Bác Sĩ</h3>
                <p className="text-xs text-slate-500">Dược sĩ Nhân Đức (172 QL50, Cần Giuộc) sẽ gọi lại tư vấn & báo giá</p>
              </div>
            </div>

            <form onSubmit={handleSendPrescription} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên của bạn</label>
                <input 
                  type="text"
                  value={prescriptionForm.name}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, name: e.target.value })}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50"
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
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên thuốc hoặc ghi chú triệu chứng</label>
                <textarea 
                  rows={3}
                  value={prescriptionForm.note}
                  onChange={(e) => setPrescriptionForm({ ...prescriptionForm, note: e.target.value })}
                  placeholder="Nhập tên các loại thuốc trong đơn hoặc ghi chú về tình trạng bệnh..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50"
                />
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 space-y-1">
                <div>✓ Dược sĩ sẽ liên hệ lại trong vòng 5 phút.</div>
                <div>✓ Tư vấn đúng toa, đúng liều lượng và hỗ trợ giao thuốc tận nhà.</div>
                <div>✓ Địa chỉ quầy: 172 QL50, KP4, TT. Cần Giuộc, Long An.</div>
              </div>

              <div className="flex gap-2 pt-2">
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
