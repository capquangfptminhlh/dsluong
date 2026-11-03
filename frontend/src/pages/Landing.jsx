import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Heart, ShieldCheck, Pill, Stethoscope, Clock, Phone, MapPin, 
  CheckCircle2, Star, ArrowRight, Award, Sparkles, AlertCircle,
  HelpCircle, ChevronRight, UserCheck, Activity, PackageCheck
} from 'lucide-react';
import logo from '../assets/logo.png';

export default function Landing() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/app');
    }
  }, [navigate]);

  const categories = [
    { id: 'ke_don', title: 'Thuốc Kê Đơn', desc: 'Bán đúng theo đơn chỉ định của Bác sĩ điều trị', icon: <Stethoscope className="w-6 h-6 text-emerald-600" /> },
    { id: 'otc', title: 'Thuốc Không Kê Đơn (OTC)', desc: 'Hạ sốt, giảm đau, cảm cúm, ho sốt, tiêu hóa', icon: <Pill className="w-6 h-6 text-emerald-600" /> },
    { id: 'tpcn', title: 'Thực Phẩm Chức Năng', desc: 'Bổ trợ tim mạch, gan, mắt, xương khớp & miễn dịch', icon: <Sparkles className="w-6 h-6 text-emerald-600" /> },
    { id: 'duoc_my_pham', title: 'Dược Mỹ Phẩm', desc: 'Chăm sóc da liễu, kem bôi da, da nhạy cảm chính hãng', icon: <Heart className="w-6 h-6 text-emerald-600" /> },
    { id: 'thiet_bi', title: 'Thiết Bị Y Tế Gia Đình', desc: 'Máy đo huyết áp, máy đo đường huyết, nhiệt kế', icon: <Activity className="w-6 h-6 text-emerald-600" /> },
    { id: 'me_be', title: 'Mẹ & Bé', desc: 'Sữa dinh dưỡng, men vi sinh, vitamin tăng đề kháng', icon: <PackageCheck className="w-6 h-6 text-emerald-600" /> },
  ];

  const commitments = [
    {
      title: '100% Thuốc Chính Hãng',
      desc: 'Nhập trực tiếp từ các tập đoàn dược phẩm uy tín: Dược Hậu Giang, Sanofi, Traphaco, AstraZeneca. Hóa đơn chứng từ xuất xứ rõ ràng.',
      icon: <Award className="w-8 h-8 text-emerald-600" />
    },
    {
      title: 'Đạt Chuẩn GPP Bộ Y Tế',
      desc: 'Toàn bộ thuốc được bảo quản trong phòng máy lạnh nhiệt độ dưới 25°C, độ ẩm kiểm soát và quản lý hạn dùng thông minh theo chuẩn FEFO.',
      icon: <ShieldCheck className="w-8 h-8 text-emerald-600" />
    },
    {
      title: 'Dược Sĩ Tư Vấn Tận Tâm',
      desc: 'Tư vấn đúng bệnh, đúng thuốc, đúng liều lượng. Tuyệt đối không bán thừa thuốc, không tư vấn tràn lan, dặn dò tương tác thuốc kỹ lưỡng.',
      icon: <UserCheck className="w-8 h-8 text-emerald-600" />
    },
    {
      title: 'Giá Bình Ổn - Niêm Yết Rõ',
      desc: 'Bán đúng giá niêm yết theo quy định ngành y tế, xuất hóa đơn hợp pháp cho mọi đơn thuốc. Bình ổn giá phục vụ bà con cộng đồng.',
      icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />
    }
  ];

  const steps = [
    { step: '01', title: 'Tiếp Nhận Nhu Cầu', desc: 'Lắng nghe kỹ lưỡng các triệu chứng hoặc kiểm tra đơn thuốc chỉ định từ bác sĩ.' },
    { step: '02', title: 'Kiểm Tra Tiền Sử', desc: 'Hỏi rõ tiền sử dị ứng thuốc, bệnh lý nền và các loại thuốc bệnh nhân đang dùng.' },
    { step: '03', title: 'Tư Vấn Liều Lượng', desc: 'Chọn đúng hoạt chất, giải thích công dụng và dặn dò cặn kẽ thời điểm uống trong ngày.' },
    { step: '04', title: 'Lưu Ý & Tương Tác', desc: 'Hướng dẫn chế độ dinh dưỡng, nhắc nhở bảo quản thuốc và phản ứng cần lưu ý.' },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-slate-800" style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* Top Banner Thông Báo */}
      <div className="bg-emerald-900 text-white text-xs py-2 px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-emerald-400" /> Giờ phục vụ: 07:00 - 22:00 (Hàng ngày)
            </span>
            <span className="hidden sm:inline text-emerald-600">•</span>
            <span className="hidden sm:flex items-center gap-1.5 font-medium">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Quầy thuốc chuẩn Thực hành tốt GPP
            </span>
          </div>
          <div className="flex items-center gap-3 font-semibold">
            <a href="tel:0909000000" className="flex items-center gap-1 text-emerald-200 hover:text-white transition-colors">
              <Phone className="w-3.5 h-3.5 text-emerald-400" /> Hotline Dược Sĩ: 0909.000.000
            </a>
          </div>
        </div>
      </div>

      {/* Navbar Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-14 md:h-16 object-contain" />
          </Link>
          
          <nav className="hidden lg:flex items-center gap-8 text-sm font-bold text-slate-600">
            <a href="#about" className="hover:text-emerald-700 transition-colors">Về Nhân Đức</a>
            <a href="#gpp" className="hover:text-emerald-700 transition-colors">Chuẩn GPP</a>
            <a href="#products" className="hover:text-emerald-700 transition-colors">Danh Mục Thuốc</a>
            <a href="#pharmacists" className="hover:text-emerald-700 transition-colors">Đội Ngũ Dược Sĩ</a>
            <a href="#contact" className="hover:text-emerald-700 transition-colors">Liên Hệ Quầy</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link 
              to="/login" 
              className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all"
            >
              Đăng Nhập Quầy Thuốc
            </Link>
            <a 
              href="tel:0909000000" 
              className="hidden sm:inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm shadow-emerald-600/30 transition-all"
            >
              <Phone className="w-3.5 h-3.5" /> Tư Vấn Ngay
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-12 pb-20 px-6 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 px-4 py-1.5 rounded-full text-xs font-bold border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Nhà Thuốc Đạt Chuẩn Thực Hành Tốt (GPP) — Bộ Y Tế</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[1.15]">
              Nhà Thuốc <span className="text-emerald-600">Nhân Đức</span><br />
              <span className="text-slate-800 text-3xl md:text-4xl font-extrabold">Tận Tâm Vì Sức Khỏe Gia Đình</span>
            </h1>

            <p className="text-base text-slate-600 leading-relaxed max-w-2xl font-medium">
              Chào mừng bạn đến với <strong>Nhà Thuốc Nhân Đức</strong>. Chúng tôi cam kết 100% dược phẩm chính hãng, 
              bảo quản đúng tiêu chuẩn GPP với quy trình kiểm soát số lô và hạn dùng nghiêm ngặt. Đội ngũ Dược sĩ Đại học 
              tận tụy đồng hành, tư vấn đúng bệnh, đúng liều lượng, vì sức khỏe dài lâu của bạn và gia đình.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <a 
                href="#contact" 
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-7 py-3.5 rounded-xl shadow-md shadow-emerald-600/30 transition-all"
              >
                Nhận Tư Vấn Dược Sĩ Miễn Phí <ArrowRight className="w-4 h-4" />
              </a>
              <Link 
                to="/login" 
                className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-sm px-6 py-3.5 rounded-xl border border-slate-200 transition-all"
              >
                Hệ Thống Quản Trị Quầy Thuốc
              </Link>
            </div>

            {/* Điểm nổi bật */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-100">
              <div>
                <div className="text-2xl font-black text-emerald-700">100%</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">Thuốc chính hãng</div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-700">Chuẩn GPP</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">Bộ Y Tế cấp phép</div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-700">FEFO</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">Kiểm soát hạn dùng</div>
              </div>
              <div>
                <div className="text-2xl font-black text-emerald-700">07:00 - 22:00</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">Phục vụ hàng ngày</div>
              </div>
            </div>
          </div>

          {/* Right Card Showcase */}
          <div className="lg:col-span-5">
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white rounded-3xl p-7 border border-emerald-100 shadow-xl shadow-emerald-950/5 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
                    <Heart className="w-6 h-6 fill-emerald-600 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-base">Nhà Thuốc Nhân Đức</h3>
                    <p className="text-xs text-emerald-700 font-bold">Quầy Thuốc Đạt Chuẩn GPP</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
                  Đang Mở Cửa
                </span>
              </div>

              {/* Dịch vụ nổi bật */}
              <div className="space-y-3.5">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-start gap-3 shadow-xs">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Pill className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Bán Đúng Liều — Đúng Đơn Thuốc</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Thuốc được phân phối đúng chỉ định điều trị, minh bạch hướng dẫn sử dụng.</p>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-start gap-3 shadow-xs">
                  <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Lưu Vết Số Lô & Date An Toàn</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Tuyệt đối không có hàng cận date, hàng kém phẩm chất lưu hành tại quầy.</p>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-start gap-3 shadow-xs">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Dược Sĩ Trực Quầy 100% Giờ Hoạt Động</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">Luôn có Dược sĩ chuyên môn tư vấn trực tiếp cho người bệnh.</p>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-600 text-white p-4 rounded-2xl text-center space-y-1">
                <p className="text-xs font-medium text-emerald-100">Cần tư vấn dùng thuốc khẩn cấp?</p>
                <div className="text-lg font-black tracking-wide">0909.000.000</div>
                <p className="text-[10px] text-emerald-200">Dược sĩ Nhân Đức luôn lắng nghe bạn</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Cam Kết Vàng */}
      <section id="gpp" className="py-16 bg-slate-50/70 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider bg-emerald-100 px-3 py-1 rounded-full">
              Uy Tín & Trách Nhiệm
            </span>
            <h2 className="text-3xl font-black text-slate-900 mt-3 tracking-tight">
              4 Cam Kết Vàng Tại Nhà Thuốc Nhân Đức
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Chúng tôi luôn đặt y đức lên hàng đầu, coi sự an toàn và sức khỏe của bệnh nhân là tôn chỉ hoạt động cao nhất.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {commitments.map((c, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
                <div className="p-3 bg-emerald-50 rounded-2xl w-fit mb-4 border border-emerald-100">
                  {c.icon}
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-2">{c.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Danh Mục Dược Phẩm */}
      <section id="products" className="py-20 max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider bg-emerald-100 px-3 py-1 rounded-full">
            Kho Dược Phong Phú
          </span>
          <h2 className="text-3xl font-black text-slate-900 mt-3 tracking-tight">
            Danh Mục Thuốc & Sản Phẩm Y Tế Đa Dạng
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Hơn 3.000 danh mục thuốc tân dược, thuốc kê đơn, thực phẩm chức năng và vật tư y tế luôn sẵn sàng phục vụ.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white p-6 rounded-2xl border border-slate-200/80 hover:border-emerald-300 hover:shadow-lg transition-all group">
              <div className="p-3 bg-emerald-50 rounded-2xl w-fit mb-4 group-hover:bg-emerald-600 transition-colors">
                <div className="group-hover:text-white group-hover:brightness-0 group-hover:invert transition-all">
                  {cat.icon}
                </div>
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">{cat.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{cat.desc}</p>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-emerald-700">
                <span>Tư vấn theo đơn</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quy Trình Tư Vấn Chuẩn GPP */}
      <section id="pharmacists" className="py-16 bg-emerald-950 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider bg-emerald-900 px-3 py-1 rounded-full border border-emerald-700">
              Quy Trình Chuyên Nghiệp
            </span>
            <h2 className="text-3xl font-black text-white mt-3 tracking-tight">
              Quy Trình Tư Vấn Dùng Thuốc An Toàn Chuẩn GPP
            </h2>
            <p className="text-sm text-emerald-200 mt-2">
              Mỗi đơn thuốc đều được các Dược sĩ thẩm định cẩn thận nhằm đảm bảo hiệu quả điều trị tối ưu và hạn chế tối đa tác dụng phụ.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, idx) => (
              <div key={idx} className="bg-emerald-900/50 border border-emerald-800 p-6 rounded-2xl relative">
                <div className="text-3xl font-black text-emerald-400/40 mb-3 font-mono">{s.step}</div>
                <h3 className="text-base font-bold text-white mb-2">{s.title}</h3>
                <p className="text-xs text-emerald-200/90 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Thông Tin Quầy Thuốc & Liên Hệ */}
      <section id="contact" className="py-20 max-w-7xl mx-auto px-6">
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white rounded-3xl border border-emerald-200 p-8 md:p-12 shadow-sm">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider bg-white px-3 py-1 rounded-full border border-emerald-200">
                Liên Hệ Quầy Thuốc
              </span>
              <h2 className="text-3xl font-black text-slate-900 mt-3 tracking-tight">
                Ghé Thăm Hoặc Nhận Tư Vấn Trực Tuyến
              </h2>
              <p className="text-sm text-slate-600 mt-2 max-w-lg leading-relaxed">
                Quý khách có thể đến trực tiếp quầy thuốc để được kiểm tra huyết áp miễn phí và tư vấn đơn thuốc, 
                hoặc gọi đến đường dây nóng để được Dược sĩ hỗ trợ ngay lập tức.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Hotline Dược Sĩ</div>
                    <div className="text-base font-black text-slate-900">0909.000.000 (Tư vấn 24/7)</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Thời Gian Làm Việc</div>
                    <div className="text-base font-bold text-slate-900">07:00 - 22:00 (Mở cửa tất cả các ngày trong tuần)</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Địa Chỉ Quầy Thuốc</div>
                    <div className="text-base font-bold text-slate-900">Hệ Thống Nhà Thuốc Nhân Đức — Chuẩn GPP</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Khung Dành cho Cán bộ Quầy thuốc */}
            <div className="bg-white p-7 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Pill className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Cổng Quản Trị Quầy Thuốc</h3>
                  <p className="text-xs text-slate-500">Dành cho Dược sĩ phụ trách chuyên môn & Nhân viên bán lẻ</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Đăng nhập hệ thống để thực hiện bán lẻ tại quầy (POS), kiểm kê thuốc theo số lô & hạn dùng (FEFO), 
                quản lý giá vốn và tra cứu tương tác dược lâm sàng.
              </p>

              <div className="space-y-3 pt-2">
                <Link 
                  to="/login" 
                  className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-xs shadow-sm shadow-emerald-600/30 transition-all"
                >
                  Đăng Nhập Quầy Bán Thuốc (POS) <ArrowRight className="w-4 h-4" />
                </Link>
                <Link 
                  to="/register" 
                  className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs border border-slate-200 transition-all"
                >
                  Đăng Ký Tài Khoản Quầy Thuốc Mới
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          <div className="space-y-4">
            <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-14 object-contain brightness-0 invert" />
            <p className="leading-relaxed text-slate-400">
              Nhà Thuốc Nhân Đức — Hệ thống nhà thuốc đạt chuẩn GPP Bộ Y Tế. Cam kết thuốc chuẩn, giá chuẩn, tận tâm vì sức khỏe người bệnh.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white text-sm mb-4">Danh Mục Thuốc</h4>
            <ul className="space-y-2.5">
              <li><a href="#products" className="hover:text-emerald-400 transition-colors">Thuốc Kê Đơn Theo Chỉ Định</a></li>
              <li><a href="#products" className="hover:text-emerald-400 transition-colors">Thuốc OTC Không Kê Đơn</a></li>
              <li><a href="#products" className="hover:text-emerald-400 transition-colors">Thực Phẩm Bảo Vệ Sức Khỏe</a></li>
              <li><a href="#products" className="hover:text-emerald-400 transition-colors">Thiết Bị Y Tế & Chăm Sóc Gia Đình</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white text-sm mb-4">Tiêu Chuẩn & Chính Sách</h4>
            <ul className="space-y-2.5">
              <li><a href="#gpp" className="hover:text-emerald-400 transition-colors">Tiêu Chuẩn GPP Bộ Y Tế</a></li>
              <li><a href="#gpp" className="hover:text-emerald-400 transition-colors">Quản Lý Hạn Dùng FEFO</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Chính Sách Đổi Trả Thuốc 48H</a></li>
              <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Bảo Mật Thông Tin Bệnh Án</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white text-sm mb-4">Hệ Thống Quầy Thuốc</h4>
            <p className="leading-relaxed mb-3">
              Mở cửa liên tục từ 07:00 đến 22:00 tất cả các ngày trong tuần (kể cả Thứ Bảy, Chủ Nhật và ngày lễ).
            </p>
            <div className="font-bold text-white text-sm">Hotline: 0909.000.000</div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-800 text-center text-slate-500">
          © {new Date().getFullYear()} Nhà Thuốc Nhân Đức. Tất cả quyền được bảo lưu. Giấy chứng nhận đủ điều kiện kinh doanh dược & Chuẩn GPP.
        </div>
      </footer>
    </div>
  );
}
