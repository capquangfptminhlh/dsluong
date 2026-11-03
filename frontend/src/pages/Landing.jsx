import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Database,
  HandCoins,
  History,
  Lock,
  Menu,
  PackageCheck,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import '../landing.css';

const INDUSTRIES = [
  {
    id: 'retail',
    label: 'Bán lẻ',
    intro: 'Bán tại quầy, quản lý sản phẩm, tồn kho, khách hàng, thu chi và công nợ trong cùng một luồng.',
    stageNotes: ['Tạo đơn và nhận tiền tại quầy', 'Theo dõi tồn theo sản phẩm và chi nhánh', 'Ghi nhận dòng tiền phát sinh', 'Theo dõi khoản khách còn nợ', 'Rà soát dữ liệu trước bước xử lý thuế'],
  },
  {
    id: 'spa',
    label: 'Spa & dịch vụ',
    intro: 'Kết nối lịch hẹn, dịch vụ, bán hàng, nhân sự, thu chi và công nợ mà không phải đổi cách làm giữa nhiều màn hình.',
    stageNotes: ['Bán dịch vụ hoặc sản phẩm tại quầy', 'Theo dõi hàng hóa và vật tư đang quản lý', 'Ghi nhận thu chi theo hoạt động', 'Theo dõi khoản khách hoặc đối tác còn nợ', 'Tập hợp dữ liệu cần kiểm tra trước bước xử lý thuế'],
  },
  {
    id: 'fnb',
    label: 'Nhà hàng & F&B',
    intro: 'Từ đơn bán, bàn/phòng đến kho và dòng tiền, dữ liệu vận hành được nối tiếp thay vì nhập lại ở nhiều nơi.',
    stageNotes: ['Tạo đơn bán và nhận thanh toán', 'Theo dõi hàng hóa, nguyên liệu và biến động kho', 'Ghi nhận thu chi phát sinh', 'Theo dõi công nợ khi có giao dịch chưa hoàn tất', 'Tập hợp giao dịch cần rà soát trước bước xử lý thuế'],
  },
  {
    id: 'hotel',
    label: 'Khách sạn',
    intro: 'Quản lý phòng, đặt phòng, bán dịch vụ, thu chi và công nợ trong một hệ thống có cùng ngữ cảnh vận hành.',
    stageNotes: ['Ghi nhận dịch vụ và khoản khách thanh toán', 'Theo dõi hàng hóa/vật tư nếu có quản lý kho', 'Ghi nhận tiền vào và tiền ra', 'Theo dõi khoản khách hoặc đối tác còn nợ', 'Kiểm tra dữ liệu giao dịch trước bước xử lý thuế'],
  },
];

const STAGES = [
  {
    id: 'sale',
    number: '01',
    label: 'Bán hàng',
    short: 'Đơn hàng bắt đầu ở một nơi.',
    icon: ShoppingCart,
    title: 'Tạo đơn, nhận tiền và giữ lại đúng ngữ cảnh bán hàng.',
    description: 'AutoTax có màn hình bán hàng, đơn hàng, trả hàng và ca bán. Giá và dữ liệu đơn được backend kiểm tra trước khi ghi nhận.',
    items: ['Bán hàng tại quầy', 'Tiền mặt / chuyển khoản', 'Đơn hàng & trả hàng', 'Ca bán và lịch sử giao dịch'],
    trace: ['Đơn được tạo', 'Thanh toán được ghi nhận', 'Sự kiện chuyển sang kho'],
  },
  {
    id: 'inventory',
    number: '02',
    label: 'Kho hàng',
    short: 'Bán xong, tồn kho đi tiếp.',
    icon: Warehouse,
    title: 'Tồn kho thay đổi cùng giao dịch thay vì trở thành một bảng riêng biệt.',
    description: 'Các module kho hiện có gồm tồn kho, chi nhánh, lô/hạn sử dụng, kiểm kê và chuyển kho. Luồng bán hàng sử dụng dữ liệu tồn theo tenant và chi nhánh.',
    items: ['Tồn kho', 'Chi nhánh & kho', 'Lô / hạn sử dụng', 'Kiểm kê & chuyển kho'],
    trace: ['Đơn đã xác nhận', 'Tồn kho được cập nhật', 'Biến động được lưu lại'],
  },
  {
    id: 'cash',
    number: '03',
    label: 'Thu chi',
    short: 'Tiền vào, tiền ra có nơi để đối chiếu.',
    icon: CircleDollarSign,
    title: 'Nhìn dòng tiền từ cùng dữ liệu vận hành.',
    description: 'Tài chính, sổ quỹ và các giao dịch mua/nhập hàng được tách thành nghiệp vụ rõ ràng nhưng vẫn nằm trong cùng workspace.',
    items: ['Tổng quan tài chính', 'Sổ quỹ thu chi', 'Mua & nhập hàng', 'Nhà cung cấp'],
    trace: ['Giao dịch phát sinh', 'Dòng tiền được ghi nhận', 'Khoản cần đối chiếu hiện rõ'],
  },
  {
    id: 'debt',
    number: '04',
    label: 'Công nợ',
    short: 'Khoản chưa thanh toán không bị quên.',
    icon: HandCoins,
    title: 'Theo dõi khoản phải thu và các lần thanh toán tiếp theo.',
    description: 'AutoTax có module công nợ và luồng thu nợ. Khi trả hàng, hệ thống ưu tiên điều chỉnh phần công nợ còn lại trước khi tính phần tiền thực tế cần hoàn.',
    items: ['Công nợ phải thu', 'Thu nợ từng phần', 'Theo dõi trạng thái', 'Điều chỉnh khi trả hàng'],
    trace: ['Khoản chưa thanh toán', 'Công nợ được theo dõi', 'Thanh toán làm giảm số còn lại'],
  },
  {
    id: 'tax',
    number: '05',
    label: 'Kiểm soát thuế',
    short: 'Dữ liệu phải đủ ngữ cảnh trước khi kết luận.',
    icon: ShieldCheck,
    title: 'Kiểm soát dữ liệu thuế theo nguyên tắc fail-closed.',
    description: 'AutoTax không tự đoán số thuế phải nộp khi thiếu Rule Context. Giao dịch chưa đủ căn cứ được giữ ở trạng thái cần xác minh thay vì tạo ra một kết luận pháp lý giả.',
    items: ['Tập hợp giao dịch', 'Phân loại có xác nhận', 'Kiểm tra dữ liệu còn thiếu', 'Chặn kết luận khi thiếu Rule Context'],
    trace: ['Dữ liệu được tập hợp', 'Nhóm cần xác minh được tách ra', 'Chỉ tiếp tục khi đủ ngữ cảnh'],
  },
];

const CAPABILITIES = [
  {
    icon: Receipt,
    title: 'Bán hàng & đơn hàng',
    description: 'Tạo đơn, nhận thanh toán, xem đơn, trả hàng và quản lý ca bán bằng tên tính năng dễ hiểu.',
    links: ['Bán hàng', 'Đơn hàng', 'Trả hàng', 'Chốt ca'],
  },
  {
    icon: PackageCheck,
    title: 'Sản phẩm & kho',
    description: 'Quản lý sản phẩm, biến thể, bảng giá, tồn kho, chi nhánh, lô hàng, kiểm kê và chuyển kho.',
    links: ['Sản phẩm', 'Bảng giá', 'Tồn kho', 'Kiểm kê'],
  },
  {
    icon: Users,
    title: 'Khách hàng & vận hành',
    description: 'Lưu khách hàng và các nghiệp vụ liên quan; một số mô hình có thêm lịch hẹn, phòng hoặc hoa hồng nhân sự.',
    links: ['Khách hàng', 'Lịch hẹn', 'Nhân sự', 'Khuyến mãi'],
  },
  {
    icon: CircleDollarSign,
    title: 'Thu chi & công nợ',
    description: 'Theo dõi dòng tiền, sổ quỹ, công nợ và nghiệp vụ mua/nhập hàng trong cùng hệ thống.',
    links: ['Tài chính', 'Sổ quỹ', 'Công nợ', 'Nhập hàng'],
  },
  {
    icon: ShieldCheck,
    title: 'Kiểm soát dữ liệu thuế',
    description: 'Rà soát dữ liệu, phân loại có xác nhận và dừng lại khi thiếu căn cứ thay vì tự sinh kết luận thuế.',
    links: ['Tập hợp dữ liệu', 'Xác minh', 'Kiểm soát', 'Fail-closed'],
  },
  {
    icon: Smartphone,
    title: 'Dùng trên điện thoại',
    description: 'Giao diện responsive, PWA và lớp thông báo giúp các thao tác chính dễ tiếp cận trên màn hình nhỏ.',
    links: ['Mobile-first', 'PWA', 'Thông báo', 'Điều hướng nhanh'],
  },
];

const BLOG_POSTS = [
  {
    eyebrow: 'Bán hàng & vận hành',
    title: 'Quản lý bán hàng cho hộ kinh doanh: từ đơn hàng đến cuối ngày',
    description: 'Nối đơn hàng, thanh toán, kho và công nợ thành một quy trình dễ đối chiếu.',
    href: '/blog/quan-ly-ban-hang-ho-kinh-doanh/',
  },
  {
    eyebrow: 'Kho hàng & mã vạch',
    title: 'Kiểm kho bằng mã vạch: quy trình dễ làm trên điện thoại',
    description: 'Quét sản phẩm, ghi số đếm thực tế và xử lý chênh lệch mà không nhập lại nhiều lần.',
    href: '/blog/kiem-kho-bang-ma-vach/',
  },
  {
    eyebrow: 'Dòng tiền & công nợ',
    title: 'Quản lý thu chi và công nợ: checklist cuối ngày cho cửa hàng',
    description: 'Tách doanh thu, tiền thực nhận và khoản còn nợ để nhìn dòng tiền rõ hơn.',
    href: '/blog/quan-ly-cong-no-thu-chi/',
  },
];

const FAQS = [
  {
    q: 'AutoTax có dùng được trên điện thoại không?',
    a: 'Có. Giao diện được tối ưu cho màn hình nhỏ và có PWA để thêm AutoTax vào màn hình chính trên thiết bị hỗ trợ. Khi bạn cấp quyền, các thao tác trong phiên ứng dụng có thể hiển thị thông báo hệ thống.',
  },
  {
    q: 'AutoTax có tự quyết định số thuế phải nộp không?',
    a: 'Không. Phần kiểm soát thuế được thiết kế fail-closed: nếu thiếu Rule Context hoặc căn cứ cần thiết, hệ thống không tự suy đoán nghĩa vụ thuế và sẽ yêu cầu bổ sung/xác minh dữ liệu.',
  },
  {
    q: 'AutoTax có quản lý kho và công nợ không?',
    a: 'Có. Hệ thống hiện có các module tồn kho, chi nhánh, lô hàng, kiểm kê, chuyển kho, sổ quỹ và công nợ. Các module này dùng chung ngữ cảnh tài khoản doanh nghiệp.',
  },
  {
    q: 'Tôi có cần cài phần mềm trên máy tính không?',
    a: 'Không bắt buộc. AutoTax là ứng dụng web và có thể chạy trong trình duyệt. Trên thiết bị hỗ trợ PWA, bạn có thể thêm ứng dụng vào màn hình chính để mở nhanh hơn.',
  },
  {
    q: 'AutoTax phù hợp với mô hình nào?',
    a: 'Hệ thống đang có luồng cho bán lẻ và các biến thể nghiệp vụ như spa/dịch vụ, F&B, khách sạn, thú cưng và phòng khám. Mỗi mô hình dùng chung lõi bán hàng, kho, tài chính và dữ liệu kiểm soát.',
  },
];

function BrandMark() {
  return (
    <span className="landing-brand-mark" aria-hidden="true">
      <img src="/autotax-logo.svg" alt="" />
    </span>
  );
}

function StageTrace({ stage }) {
  return (
    <div className="landing-stage-trace" aria-label={`Luồng ${stage.label}`}>
      <div className="landing-trace-head">
        <span className="landing-trace-dot" />
        <span>Luồng dữ liệu</span>
      </div>
      <ol>
        {stage.trace.map((item, index) => (
          <li key={item}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item}</strong>
          </li>
        ))}
      </ol>
      <div className="landing-trace-foot">
        <Database aria-hidden="true" />
        <span>Một nguồn dữ liệu xuyên suốt nghiệp vụ</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const [industryId, setIndustryId] = useState('retail');
  const [activeStage, setActiveStage] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const industry = useMemo(
    () => INDUSTRIES.find((item) => item.id === industryId) || INDUSTRIES[0],
    [industryId],
  );
  const stage = STAGES[activeStage];

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-shell">
      <a className="landing-skip" href="#main-content">Bỏ qua điều hướng</a>

      <header className="landing-header">
        <div className="landing-header-inner">
          <a href="#top" className="landing-brand" aria-label="AutoTax - Trang chủ">
            <BrandMark />
            <span className="landing-brand-copy">
              <strong>AutoTax</strong>
              <small>Business Control</small>
            </span>
          </a>

          <nav className="landing-nav" aria-label="Điều hướng trang chủ">
            <a href="#flow">Cách hoạt động</a>
            <a href="#capabilities">Tính năng</a>
            <a href="#trust">An toàn dữ liệu</a>
            <a href="/blog/">Kiến thức</a>
            <a href="#faq">Câu hỏi thường gặp</a>
          </nav>

          <div className="landing-header-actions">
            <Link to="/login" className="landing-login">Đăng nhập</Link>
            <Link to="/register" className="landing-button landing-button-dark">Tạo tài khoản</Link>
            <button
              type="button"
              className="landing-menu-button"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="landing-mobile-menu" aria-label="Điều hướng di động">
            <a href="#flow" onClick={closeMenu}>Cách hoạt động</a>
            <a href="#capabilities" onClick={closeMenu}>Tính năng</a>
            <a href="#trust" onClick={closeMenu}>An toàn dữ liệu</a>
            <a href="/blog/" onClick={closeMenu}>Kiến thức</a>
            <a href="#faq" onClick={closeMenu}>Câu hỏi thường gặp</a>
            <div className="landing-mobile-menu-actions">
              <Link to="/login" onClick={closeMenu}>Đăng nhập</Link>
              <Link to="/register" onClick={closeMenu}>Tạo tài khoản</Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main-content">
        <section id="top" className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-container">
            <p className="landing-eyebrow">Bán hàng · Kho · Thu chi · Công nợ · Kiểm soát dữ liệu thuế</p>
            <h1 id="landing-title">Một đơn hàng.<br />Một luồng dữ liệu.<br /><span>Ít việc phải nhớ hơn.</span></h1>
            <p className="landing-hero-copy">
              AutoTax gom các nghiệp vụ quan trọng của cửa hàng vào một workspace có tên tính năng dễ hiểu,
              dùng được trên máy tính lẫn điện thoại và không tự tạo kết luận thuế khi dữ liệu chưa đủ căn cứ.
            </p>
            <div className="landing-hero-actions">
              <Link to="/register" className="landing-button landing-button-primary">
                Tạo tài khoản <ArrowRight aria-hidden="true" />
              </Link>
              <a href="#flow" className="landing-button landing-button-ghost">Xem AutoTax nối dữ liệu thế nào</a>
            </div>

            <div className="landing-principles" aria-label="Nguyên tắc sản phẩm">
              <span><CheckCircle2 /> Tên tính năng bằng tiếng Việt dễ hiểu</span>
              <span><Smartphone /> Thiết kế cho cả desktop và điện thoại</span>
              <span><ShieldCheck /> Thiếu căn cứ thuế thì dừng để xác minh</span>
            </div>
          </div>
        </section>

        <section className="landing-industry-section" aria-labelledby="industry-title">
          <div className="landing-container landing-industry-layout">
            <div>
              <p className="landing-section-kicker">Industry Lens</p>
              <h2 id="industry-title">Chọn cách bạn đang vận hành.</h2>
            </div>
            <div className="landing-industry-content">
              <div className="landing-industry-tabs" role="group" aria-label="Mô hình kinh doanh">
                {INDUSTRIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={industryId === item.id ? 'is-active' : ''}
                    aria-pressed={industryId === item.id}
                    onClick={() => setIndustryId(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p key={industry.id} className="landing-industry-summary">{industry.intro}</p>
            </div>
          </div>
        </section>

        <section id="flow" className="landing-flow-section" aria-labelledby="flow-title">
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-section-kicker">Operational Spine</p>
              <h2 id="flow-title">Một giao dịch đi qua AutoTax như thế nào?</h2>
              <p>Không bắt đầu bằng “50 tính năng”. Bắt đầu bằng đúng việc người dùng đang làm, rồi dữ liệu đi tiếp.</p>
            </div>

            <div className="landing-stage-desktop">
              <div className="landing-stage-line" aria-hidden="true" />
              <div className="landing-stage-tabs" role="tablist" aria-label="Các bước vận hành">
                {STAGES.map((item, index) => {
                  const Icon = item.icon;
                  const selected = activeStage === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="landing-stage-panel"
                      className={selected ? 'is-active' : ''}
                      onClick={() => setActiveStage(index)}
                    >
                      <span className="landing-stage-number">{item.number}</span>
                      <span className="landing-stage-icon"><Icon /></span>
                      <strong>{item.label}</strong>
                      <small>{item.short}</small>
                    </button>
                  );
                })}
              </div>

              <div id="landing-stage-panel" role="tabpanel" className="landing-stage-panel" key={`${industry.id}-${stage.id}`}>
                <div className="landing-stage-copy">
                  <p className="landing-stage-context">{industry.label} · {industry.stageNotes[activeStage]}</p>
                  <h3>{stage.title}</h3>
                  <p>{stage.description}</p>
                  <ul>
                    {stage.items.map((item) => <li key={item}><CheckCircle2 /> {item}</li>)}
                  </ul>
                </div>
                <StageTrace stage={stage} />
              </div>
            </div>

            <div className="landing-stage-mobile">
              {STAGES.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article key={item.id} className="landing-mobile-stage">
                    <div className="landing-mobile-stage-rail" aria-hidden="true">
                      <span>{item.number}</span>
                      {index < STAGES.length - 1 && <i />}
                    </div>
                    <div className="landing-mobile-stage-card">
                      <div className="landing-mobile-stage-title"><Icon /><h3>{item.label}</h3></div>
                      <strong>{item.title}</strong>
                      <p>{industry.stageNotes[index]}</p>
                      <ul>{item.items.slice(0, 3).map((entry) => <li key={entry}>{entry}</li>)}</ul>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="capabilities" className="landing-capabilities" aria-labelledby="capability-title">
          <div className="landing-container">
            <div className="landing-editorial-heading">
              <span>Không cần học thuật ngữ ERP.</span>
              <h2 id="capability-title">Tên tính năng nói thẳng việc bạn cần làm.</h2>
            </div>

            <div className="landing-capability-list">
              {CAPABILITIES.map((capability, index) => {
                const Icon = capability.icon;
                return (
                  <article key={capability.title} className="landing-capability-row">
                    <span className="landing-capability-index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="landing-capability-icon"><Icon /></div>
                    <div className="landing-capability-copy">
                      <h3>{capability.title}</h3>
                      <p>{capability.description}</p>
                    </div>
                    <div className="landing-capability-tags">
                      {capability.links.map((item) => <span key={item}>{item}</span>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="trust" className="landing-trust" aria-labelledby="trust-title">
          <div className="landing-container landing-trust-grid">
            <div className="landing-trust-heading">
              <p className="landing-section-kicker">Control before claims</p>
              <h2 id="trust-title">Phần mềm quản lý không nên “đoán cho xong”.</h2>
              <p>AutoTax ưu tiên dữ liệu có thể kiểm tra, quyền truy cập rõ ràng và trạng thái cần xác minh khi chưa đủ căn cứ.</p>
            </div>

            <div className="landing-trust-list">
              <article>
                <Database />
                <div><h3>Dùng dữ liệu nghiệp vụ thật</h3><p>Các màn hình vận hành đọc dữ liệu từ backend thay vì dựa vào số liệu demo cố định để đưa ra kết luận.</p></div>
              </article>
              <article>
                <Lock />
                <div><h3>Phân quyền theo tài khoản</h3><p>Các module nghiệp vụ dùng tenant context và quyền người dùng; nhật ký thao tác và cài đặt quản trị nằm trong hệ thống.</p></div>
              </article>
              <article>
                <History />
                <div><h3>Sao lưu & khôi phục có quy trình</h3><p>Hệ thống có module sao lưu/khôi phục và pipeline deploy có bước bảo vệ dữ liệu trước khi thay release production.</p></div>
              </article>
              <article>
                <ShieldCheck />
                <div><h3>Thuế: thiếu ngữ cảnh thì không tự kết luận</h3><p>Rule Context còn thiếu sẽ chặn đường tính/kết xuất cũ, tránh biến heuristic thành một kết luận pháp lý.</p></div>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-mobile-proof" aria-labelledby="mobile-title">
          <div className="landing-container landing-mobile-proof-grid">
            <div className="landing-phone-frame" aria-hidden="true">
              <div className="landing-phone-top"><span>AutoTax</span><Bell /></div>
              <div className="landing-phone-task"><ShoppingCart /><div><small>Bán hàng</small><strong>Tạo đơn tại quầy</strong></div><ChevronRight /></div>
              <div className="landing-phone-task"><Warehouse /><div><small>Kho hàng</small><strong>Kiểm tra tồn kho</strong></div><ChevronRight /></div>
              <div className="landing-phone-task"><HandCoins /><div><small>Công nợ</small><strong>Xem khoản cần thu</strong></div><ChevronRight /></div>
              <div className="landing-phone-nav"><span>Trang chủ</span><strong>Bán hàng</strong><span>Đơn hàng</span><span>Kho</span></div>
            </div>
            <div className="landing-mobile-proof-copy">
              <p className="landing-section-kicker">Mobile composition riêng</p>
              <h2 id="mobile-title">Không phải desktop bị thu nhỏ lại.</h2>
              <p>Trên điện thoại, điều hướng chuyển thành bottom navigation, nút thao tác giữ trong tầm ngón tay và các luồng dài được tách thành bước ngắn dễ đọc.</p>
              <ul>
                <li><Smartphone /> Điều hướng nhanh cho các việc dùng thường xuyên</li>
                <li><Bell /> Thông báo trong ứng dụng và notification khi người dùng cấp quyền</li>
                <li><Boxes /> Có thể thêm PWA vào màn hình chính trên thiết bị hỗ trợ</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="knowledge" className="landing-blog" aria-labelledby="knowledge-title">
          <div className="landing-container">
            <div className="landing-blog-heading">
              <div>
                <p className="landing-section-kicker">Kiến thức & hướng dẫn</p>
                <h2 id="knowledge-title">Giải thích công việc trước khi nói về tính năng.</h2>
              </div>
              <a href="/blog/" className="landing-blog-all">Xem tất cả bài viết <ArrowRight /></a>
            </div>
            <div className="landing-blog-grid">
              {BLOG_POSTS.map((post, index) => (
                <a className="landing-blog-card" href={post.href} key={post.href}>
                  <span className="landing-blog-index">{String(index + 1).padStart(2, '0')}</span>
                  <p>{post.eyebrow}</p>
                  <h3>{post.title}</h3>
                  <span>{post.description}</span>
                  <strong>Đọc hướng dẫn <ArrowRight /></strong>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="landing-faq" aria-labelledby="faq-title">
          <div className="landing-container landing-faq-grid">
            <div className="landing-faq-heading">
              <p className="landing-section-kicker">FAQ</p>
              <h2 id="faq-title">Những câu hỏi nên rõ ngay từ đầu.</h2>
              <p>Không dùng lời quảng cáo để thay cho phạm vi thật của sản phẩm.</p>
            </div>
            <div className="landing-faq-list">
              {FAQS.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}<ChevronRight aria-hidden="true" /></summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-final-cta" aria-labelledby="cta-title">
          <div className="landing-container landing-final-cta-inner">
            <div>
              <p className="landing-section-kicker">Bắt đầu từ công việc đang có</p>
              <h2 id="cta-title">Đưa bán hàng, kho, tiền và dữ liệu kiểm soát về cùng một chỗ.</h2>
            </div>
            <div className="landing-final-actions">
              <Link to="/register" className="landing-button landing-button-light">Tạo tài khoản <ArrowRight /></Link>
              <Link to="/login" className="landing-final-login">Đã có tài khoản? Đăng nhập</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand"><BrandMark /><div><strong>AutoTax</strong><span>Business Control</span></div></div>
          <p>Phần mềm quản lý bán hàng, kho, thu chi, công nợ và kiểm soát dữ liệu vận hành.</p>
          <div className="landing-footer-links">
            <Link to="/login">Đăng nhập</Link>
            <Link to="/register">Tạo tài khoản</Link>
            <a href="/blog/">Kiến thức</a>
            <a href="#faq">FAQ</a>
          </div>
        </div>
      </footer>

      <div className="landing-mobile-cta" aria-label="Hành động nhanh">
        <Link to="/login">Đăng nhập</Link>
        <Link to="/register">Tạo tài khoản <ArrowRight /></Link>
      </div>
    </div>
  );
}
