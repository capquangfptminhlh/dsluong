import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Star, ShieldAlert, AlertCircle, FileX, 
  CheckCircle2, BarChart3, FileText, Home, Check, ChevronRight
} from 'lucide-react';
import logo from '../assets/logo.png';

export default function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/app');
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#fafbfc] font-sans text-slate-800" style={{ fontFamily: '"Inter", sans-serif' }}>
      {/* Header */}
      <header className="flex justify-between items-center px-6 md:px-12 py-3 bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-slate-100 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-16 md:h-20 object-contain" />
          </div>
        </div>
        <nav className="hidden md:flex gap-8 text-[15px] font-semibold text-slate-600">
          <a href="#features" className="hover:text-emerald-600 transition">Tính năng Dược</a>
          <a href="/login" className="hover:text-emerald-600 transition">Bán thuốc (POS)</a>
          <a href="/login" className="hover:text-emerald-600 transition">Quản lý Lô &amp; Date</a>
        </nav>
        <div className="flex gap-4">
          <Link to="/login" className="text-slate-600 font-bold hover:text-slate-900 px-4 py-2">Đăng nhập</Link>
          <Link to="/register" className="bg-emerald-600 text-white font-bold px-6 py-2 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">Bắt đầu sử dụng</Link>
        </div>
      </header>

      <main>
        <article>
          {/* Hero */}
          <section className="pt-20 pb-16 px-6 md:px-12 max-w-[1400px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-full text-xs font-bold mb-6 border border-emerald-200">
            <span>🌿 Hệ thống Quản Lý &amp; Bán Thuốc Chuẩn GPP</span> <ArrowRight className="w-3 h-3"/>
          </div>
          <h1 className="text-5xl md:text-[56px] font-black leading-[1.15] mb-6 text-slate-900 tracking-tight">
            Nhà Thuốc Nhân Đức <br/>
            <span className="text-emerald-600">Phần mềm Quản lý &amp; Bán thuốc</span>
          </h1>
          <p className="text-[17px] text-slate-500 mb-8 max-w-lg leading-relaxed font-medium">
            Công cụ hoàn toàn miễn phí giúp bạn tự động tính thuế, theo dõi doanh thu và xuất tờ khai 01/CNKD nhanh chóng. Tiết kiệm thời gian, giảm thiểu sai sót.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <Link to="/register" className="bg-blue-600 text-white font-black text-lg px-8 py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 flex items-center gap-2">
            Đăng ký dùng thử miễn phí <ChevronRight className="w-5 h-5" />
          </Link>
            <button className="bg-white text-slate-700 px-8 py-3.5 rounded-xl font-bold text-[15px] border border-slate-200 hover:border-slate-300 transition shadow-sm">
              Xem demo
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm font-semibold text-slate-600 mb-8">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> Miễn phí 7 ngày</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> Không cần thẻ</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-blue-500"/> Hỗ trợ 24/7</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              <img loading="lazy" src="https://i.pravatar.cc/100?img=1" className="w-10 h-10 rounded-full border-2 border-white"/>
              <img loading="lazy" src="https://i.pravatar.cc/100?img=2" className="w-10 h-10 rounded-full border-2 border-white"/>
              <img loading="lazy" src="https://i.pravatar.cc/100?img=3" className="w-10 h-10 rounded-full border-2 border-white"/>
              <img loading="lazy" src="https://i.pravatar.cc/100?img=4" className="w-10 h-10 rounded-full border-2 border-white"/>
            </div>
            <div>
              <div className="flex gap-1 text-yellow-400"><Star className="w-4 h-4 fill-current"/><Star className="w-4 h-4 fill-current"/><Star className="w-4 h-4 fill-current"/><Star className="w-4 h-4 fill-current"/><Star className="w-4 h-4 fill-current"/></div>
              <div className="text-xs text-slate-500 font-semibold mt-1">10.000+ hộ kinh doanh tin dùng</div>
            </div>
          </div>
        </div>
        
        {/* Dashboard Mockup right side */}
        <div className="relative z-10 w-full h-[500px]">
          <div className="absolute inset-0 bg-blue-100/50 rounded-[3rem] blur-3xl -z-10 transform scale-90"></div>
          <div className="w-full h-full bg-white rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden flex flex-col md:flex-row">
            <div className="w-20 bg-blue-600 hidden md:flex flex-col items-center py-6 gap-6 text-white/50">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-black text-xl mb-4">A</div>
              <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-inner"><Home className="w-5 h-5"/></div>
              <BarChart3 className="w-6 h-6 hover:text-white transition cursor-pointer"/>
              <FileText className="w-6 h-6 hover:text-white transition cursor-pointer"/>
              <CheckCircle2 className="w-6 h-6 hover:text-white transition cursor-pointer"/>
            </div>
            <div className="flex-1 p-8 bg-slate-50/50 flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <h3 className="font-bold text-xl">Tổng quan</h3>
                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold text-slate-500 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-100">Kỳ tính thuế: Tháng 5/2026 ▾</div>
                  <img loading="lazy" src="https://i.pravatar.cc/100?img=8" className="w-8 h-8 rounded-full shadow-sm"/>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-5">
                <div className="col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="text-sm font-semibold text-slate-500 mb-2">Doanh thu bán ra</div>
                  <div className="text-3xl font-black text-slate-800">96.500.000đ</div>
                  <div className="text-xs font-bold text-blue-600 flex items-center gap-1 mt-2">↑ 23.5% <span className="text-slate-400 font-medium">so với tháng qua</span></div>
                  <div className="mt-6 h-32 w-full bg-gradient-to-t from-blue-50/50 to-transparent relative border-b-2 border-blue-600 flex items-end">
                    <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100"><path d="M0 100 L 0 50 Q 25 20 50 60 T 100 30 L 100 100 Z" fill="#eff6ff" stroke="#2563eb" strokeWidth="2" /></svg>
                  </div>
                </div>
                <div className="col-span-1 flex flex-col gap-5">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col">
                    <div className="text-sm font-semibold text-slate-500 mb-2">Thuế cần nộp</div>
                    <div className="text-2xl font-black text-slate-800">1.250.000đ</div>
                    <div className="text-[11px] font-semibold text-slate-400 mt-2">Kỳ tính thuế: 01/05 - 31/05</div>
                    <button className="mt-auto w-full py-2 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100 transition">Xem chi tiết</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* Pain points */}
      <section className="py-24 max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-black text-slate-900 mb-4">Bạn có đang đau đầu vì việc Thuế? Hãy thử phần mềm khai thuế miễn phí</h2>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 relative">
          <div className="flex flex-col gap-5 w-full md:w-1/3 relative z-10">
            {[
              {t: 'Không biết kê khai', d: 'Không rõ cách kê khai, sợ sai sót', i: <FileX/>},
              {t: 'Sự vượt doanh thu', d: 'Lo lắng vượt ngưỡng, bị phạt', i: <AlertCircle/>},
              {t: 'Lo lắng tính sai thuế', d: 'Tính toán thủ công dễ nhầm lẫn', i: <ShieldAlert/>},
            ].map((p, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-red-50 flex items-center gap-4 hover:shadow-md transition">
                <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center shrink-0">{p.i}</div>
                <div><h4 className="font-bold text-[15px] text-slate-800">{p.t}</h4><p className="text-[13px] text-slate-500 mt-0.5">{p.d}</p></div>
              </div>
            ))}
          </div>

          <div className="hidden md:flex flex-col items-center justify-center relative z-20 w-32">
            <div className="absolute top-1/2 left-[-100px] right-[-100px] h-[2px] bg-gradient-to-r from-red-100 via-blue-100 to-green-100 -z-10"></div>
            <div className="w-20 h-20 bg-blue-50 border-[6px] border-white shadow-xl rounded-full flex items-center justify-center text-blue-600">
              <span className="font-black text-3xl">A</span>
            </div>
            <div className="absolute -top-10 text-sm font-bold text-blue-600 bg-white px-4 py-1 rounded-full shadow-sm border border-blue-50">AutoTax giúp bạn</div>
          </div>

          <div className="flex flex-col gap-5 w-full md:w-1/3 relative z-10">
            {[
              {t: 'Công cụ tính thuế tự động', d: 'Tính đúng, tính đủ mức thuế cần đóng', i: <BarChart3/>},
              {t: 'Cảnh báo thông minh', d: 'Thông báo khi sắp vượt ngưỡng', i: <Home/>},
              {t: 'Xuất tờ khai 01/CNKD', d: 'Tự động tạo file tờ khai sẵn sàng nộp', i: <FileText/>},
            ].map((p, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-green-50 flex items-center gap-4 hover:shadow-md transition">
                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center shrink-0">{p.i}</div>
                <div><h4 className="font-bold text-[15px] text-slate-800">{p.t}</h4><p className="text-[13px] text-slate-500 mt-0.5">{p.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-slate-900 py-12 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 divide-x divide-slate-800">
          <div className="text-center px-4">
            <div className="text-3xl font-black text-white mb-2 flex justify-center items-center gap-2"><BarChart3 className="w-6 h-6 text-blue-500"/> 95B+</div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Doanh thu được xử lý</div>
          </div>
          <div className="text-center px-4">
            <div className="text-3xl font-black text-white mb-2 flex justify-center items-center gap-2"><Star className="w-6 h-6 text-yellow-500"/> 10.000+</div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Hộ kinh doanh tin dùng</div>
          </div>
          <div className="text-center px-4">
            <div className="text-3xl font-black text-white mb-2 flex justify-center items-center gap-2"><CheckCircle2 className="w-6 h-6 text-green-500"/> 99.9%</div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Độ chính xác dữ liệu</div>
          </div>
          <div className="text-center px-4">
            <div className="text-3xl font-black text-white mb-2 flex justify-center items-center gap-2"><Check className="w-6 h-6 text-purple-500"/> 24/7</div>
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Hỗ trợ tận tâm</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-black text-slate-900 mb-8 leading-[1.2]">Tất cả những gì bạn cần,<br/> đã có trong phần mềm bán hàng miễn phí AutoTax</h2>
            <div className="relative w-full h-[350px] bg-blue-50 rounded-[2rem] p-8 flex items-center justify-center overflow-hidden border border-blue-100">
               <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80')] bg-cover bg-center opacity-10 mix-blend-luminosity"></div>
               <div className="relative z-10 w-full max-w-sm bg-white p-6 rounded-2xl shadow-xl flex flex-col gap-4">
                 <div className="flex gap-4">
                   <div className="w-16 h-16 rounded-full bg-blue-500 shrink-0"></div>
                   <div className="flex-1 space-y-2">
                     <div className="h-4 bg-slate-200 rounded w-full"></div>
                     <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                   </div>
                 </div>
                 <div className="h-20 bg-gradient-to-r from-blue-100 to-indigo-50 rounded-xl mt-4"></div>
               </div>
            </div>
          </div>
          <div>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                {t: 'Dashboard thông minh', d: 'Tổng quan doanh thu, lợi nhuận, công nợ theo thời gian thực.'},
                {t: 'Công cụ tính thuế tự động', d: 'Hệ thống tự động tính toán số thuế cần nộp chính xác dựa trên doanh thu thực tế.'},
                {t: 'Cảnh báo ngưỡng doanh thu', d: 'Tính năng cảnh báo thông minh khi doanh thu của bạn chuẩn bị vượt ngưỡng yêu cầu.'},
                {t: 'Xuất tờ khai 01/CNKD', d: 'Chỉ với 1 click, hệ thống tự động điền và xuất file tờ khai 01/CNKD đúng chuẩn.'},
              ].map((f, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-lg transition cursor-default">
                  <h4 className="font-bold text-[15px] text-slate-800 mb-2">{f.t}</h4>
                  <p className="text-[13px] text-slate-500 leading-relaxed">{f.d}</p>
                </div>
              ))}
            </div>
            <button className="mt-8 bg-white border border-slate-200 text-slate-700 font-bold px-6 py-3 rounded-xl hover:bg-slate-50 transition text-sm flex items-center gap-2">
              Xem tất cả tính năng <ArrowRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-black text-center text-slate-900 mb-12">Họ nói gì về AutoTax?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {n: 'Nguyễn Minh H.', p: 'Chủ shop online', q: 'Từ ngày dùng AutoTax, tôi không còn đau đầu mỗi mùa quyết toán thuế nữa. Mọi thứ tự động và chính xác.', img: 1},
              {n: 'Trần Thị Lan', p: 'Hộ kinh doanh', q: 'Giao diện dễ dùng, báo cáo rõ ràng. Hỗ trợ nhanh chóng. Rất đáng tiền!', img: 5},
              {n: 'Lê Văn Tùng', p: 'Nhà bán hàng', q: 'Giao diện thân thiện, dễ dùng. Tôi có thể tự xuất tờ khai thuế mà không cần thuê kế toán.', img: 11},
            ].map((t, i) => (
              <div key={i} className="bg-[#fafbfc] p-8 rounded-[2rem] border border-slate-100 relative">
                <div className="flex gap-1 mb-6 text-yellow-400"><Star className="fill-current w-4 h-4"/><Star className="fill-current w-4 h-4"/><Star className="fill-current w-4 h-4"/><Star className="fill-current w-4 h-4"/><Star className="fill-current w-4 h-4"/></div>
                <p className="text-slate-600 text-[15px] italic mb-8 font-medium leading-relaxed">"{t.q}"</p>
                <div className="flex items-center gap-4">
                  <img src={`https://i.pravatar.cc/150?img=${t.img}`} className="w-12 h-12 rounded-full border-2 border-white shadow-sm"/>
                  <div><div className="font-bold text-sm text-slate-800">{t.n}</div><div className="text-xs text-slate-500 font-semibold">{t.p}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>



      {/* CTA */}
      <section className="py-12 max-w-6xl mx-auto px-6 mb-12">
        <div className="bg-blue-600 rounded-[3rem] p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="relative z-10 md:w-1/2 text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4 leading-tight">Cộng đồng Hộ kinh doanh <br/>đã sẵn sàng, còn bạn?</h2>
            <p className="text-blue-100 mb-8 font-semibold">Tất cả công cụ đều hoàn toàn miễn phí mãi mãi</p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link to="/login" className="bg-white text-blue-600 px-8 py-3.5 rounded-xl font-bold text-[15px] hover:bg-blue-50 transition shadow-lg w-full sm:w-auto text-center">
                Bắt đầu miễn phí
              </Link>
            </div>
            <div className="flex items-center gap-3 mt-8 justify-center md:justify-start">
              <div className="flex -space-x-3">
                <img loading="lazy" src="https://i.pravatar.cc/100?img=1" className="w-8 h-8 rounded-full border-2 border-blue-600"/>
                <img loading="lazy" src="https://i.pravatar.cc/100?img=2" className="w-8 h-8 rounded-full border-2 border-blue-600"/>
                <img loading="lazy" src="https://i.pravatar.cc/100?img=3" className="w-8 h-8 rounded-full border-2 border-blue-600"/>
              </div>
              <div className="text-xs text-blue-200 font-semibold">10.000+ người đã bắt đầu</div>
            </div>
          </div>
          <div className="relative z-10 md:w-1/2 flex justify-center">
            {/* Generic placeholder for laptop graphic */}
            <div className="w-[300px] h-[200px] bg-white/10 rounded-2xl border border-white/20 backdrop-blur-sm shadow-2xl flex items-center justify-center">
               <BarChart3 className="w-16 h-16 text-white/50"/>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-[#fafbfc]">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-black text-center text-slate-900 mb-12">Hỏi Đáp (FAQ) về AutoTax</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-lg text-slate-800 mb-2">AutoTax là gì?</h3>
              <p className="text-slate-600">AutoTax là phần mềm bán hàng miễn phí và phần mềm khai thuế miễn phí được thiết kế riêng cho Hộ kinh doanh tại Việt Nam. Nó giúp tự động hóa việc tính toán doanh thu, thuế cần nộp và xuất tờ khai 01/CNKD một cách nhanh chóng, chính xác.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-lg text-slate-800 mb-2">Tại sao AutoTax lại hoàn toàn miễn phí?</h3>
              <p className="text-slate-600">AutoTax là dự án vì cộng đồng, được xây dựng với mục tiêu hỗ trợ các Hộ kinh doanh vượt qua khó khăn về thủ tục hành chính, chuyển đổi số dễ dàng hơn. Chúng tôi cam kết duy trì phần mềm bán hàng miễn phí và khai thuế miễn phí trọn đời mà không có phí ẩn.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-lg text-slate-800 mb-2">Dữ liệu của tôi trên AutoTax có an toàn không?</h3>
              <p className="text-slate-600">Bảo mật dữ liệu là ưu tiên hàng đầu của chúng tôi. Hệ thống sử dụng công nghệ mã hóa tiên tiến và tuân thủ các tiêu chuẩn bảo mật nghiêm ngặt để đảm bảo thông tin kinh doanh và thuế của bạn luôn an toàn.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="font-bold text-lg text-slate-800 mb-2">Tôi không biết kế toán có dùng được không?</h3>
              <p className="text-slate-600">Hoàn toàn được! AutoTax được thiết kế với giao diện đơn giản, trực quan dành cho người không chuyên. Hệ thống cảnh báo thông minh và các công cụ tự động sẽ hướng dẫn bạn từng bước mà không cần kiến thức chuyên môn về kế toán.</p>
            </div>
          </div>
        </div>
      </section>

        </article>
      </main>

      {/* Footer */}
      <footer className="bg-[#0f172a] pt-16 pb-8 px-6 md:px-12 text-slate-400 font-medium">
        <div className="max-w-6xl mx-auto grid md:grid-cols-5 gap-10 mb-12">
          <div className="col-span-2">
            <div className="text-white font-extrabold text-2xl mb-6 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">A</div> AutoTax<span className="text-blue-500">.vn</span>
            </div>
            <p className="text-sm text-slate-400 mb-6 max-w-sm">Nền tảng kế toán & thuế tự động đáng tin cậy dành cho Hộ kinh doanh Việt Nam.</p>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-blue-600 transition cursor-pointer text-white">f</div>
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-red-600 transition cursor-pointer text-white">▶</div>
            </div>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Sản phẩm</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#features" className="hover:text-blue-400 transition">Tính năng</a></li>
              <li><a href="/blog/" className="hover:text-blue-400 transition">Hướng dẫn</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Công ty</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="/about" className="hover:text-blue-400 transition">Về chúng tôi</a></li>
              <li><a href="/blog/" className="hover:text-blue-400 transition">Blog</a></li>
              <li><a href="/contact" className="hover:text-blue-400 transition">Liên hệ</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-6">Hỗ trợ</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="/support" className="hover:text-blue-400 transition">Trung tâm trợ giúp</a></li>
              <li><a href="/privacy" className="hover:text-blue-400 transition">Chính sách bảo mật</a></li>
              <li><a href="/terms" className="hover:text-blue-400 transition">Điều khoản sử dụng</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto pt-8 border-t border-slate-800 text-center text-xs">
          <p className="mb-2">© 2026 AutoTax.vn - Dự án vì cộng đồng Hộ Kinh Doanh Việt Nam.</p>
          <p className="text-slate-500 max-w-4xl mx-auto leading-relaxed">Tuyên bố miễn trừ trách nhiệm: AutoTax là phần mềm hỗ trợ tính toán cộng đồng, không mang tính ràng buộc pháp lý. AutoTax không phải là đại lý thuế. Người sử dụng hoàn toàn chịu trách nhiệm trước pháp luật về tính chính xác của các số liệu trên tờ khai nộp cho cơ quan Thuế.</p>
        </div>
      </footer>
    </div>
  );
}
