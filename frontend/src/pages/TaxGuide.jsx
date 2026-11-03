import React, { useState } from 'react';
import { Search, BookOpen, AlertCircle, HelpCircle, ChevronDown, FileText, Smartphone } from 'lucide-react';

const TAX_RATES = [
  { name: 'Bán buôn, bán lẻ các loại hàng hóa', category: 'Phân phối, cung cấp hàng hóa', vat: '1%', pit: '0.5%' },
  { name: 'Phân phối, cung cấp hàng hóa', category: 'Phân phối, cung cấp hàng hóa', vat: '1%', pit: '0.5%' },
  { name: 'Dịch vụ lưu trú, khách sạn, nhà nghỉ', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Dịch vụ ăn uống, nhà hàng, quán ăn', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Dịch vụ bưu chính, viễn thông', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Cắt tóc, làm đầu, gội đầu, massage', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Dịch vụ sửa chữa máy tính, đồ dùng gia đình', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Dịch vụ tư vấn pháp luật, tài chính, kế toán', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Xây dựng, lắp đặt không bao thầu nguyên vật liệu', category: 'Dịch vụ, xây dựng không bao thầu NVL', vat: '5%', pit: '2%' },
  { name: 'Sản xuất gia công', category: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa', vat: '3%', pit: '1.5%' },
  { name: 'Vận tải hàng hóa, hành khách', category: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa', vat: '3%', pit: '1.5%' },
  { name: 'Dịch vụ ăn uống có gắn với bán hàng hóa', category: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa', vat: '3%', pit: '1.5%' },
  { name: 'Xây dựng, lắp đặt có bao thầu nguyên vật liệu', category: 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa', vat: '3%', pit: '1.5%' },
  { name: 'Hoạt động sản xuất, kinh doanh khác', category: 'Hoạt động kinh doanh khác', vat: '2%', pit: '1%' },
];

const FAQS = [
  {
    q: 'Bỏ thuế khoán từ năm 2026 nghĩa là sao?',
    a: 'Theo Nghị định 68/2026/NĐ-CP, Hộ kinh doanh không còn đóng một mức thuế cố định hàng tháng (thuế khoán) cho cán bộ thuế nữa. Bắt buộc 100% HKD phải thực hiện lưu trữ "Sổ Bán Hàng" (Sổ S2-HKD) và tự kê khai thuế dựa trên doanh thu thực tế phát sinh.'
  },
  {
    q: 'Doanh thu bao nhiêu thì phải đóng thuế?',
    a: 'Ngưỡng miễn thuế mới nhất từ năm 2026 là 500 triệu đồng/năm (Tuy nhiên, ngưỡng bắt buộc sử dụng Hóa đơn điện tử là 1 Tỷ/năm). Nếu doanh thu của bạn dưới 500 triệu, bạn không phải nộp Thuế GTGT và Thuế TNCN, nhưng vẫn phải nộp tờ khai 01/CNKD.'
  },
  {
    q: 'Khi nào bắt buộc dùng Hóa đơn điện tử?',
    a: 'Khi doanh thu của Hộ kinh doanh vượt mốc 1 Tỷ đồng/năm. Lúc này bạn bắt buộc phải trang bị hệ thống Hóa đơn điện tử khởi tạo từ máy tính tiền. Autotax sẽ cảnh báo bạn khi doanh thu gần chạm ngưỡng này để bạn chuẩn bị.'
  },
  {
    q: 'Làm sao để nộp thuế không cần ra phường?',
    a: 'Rất đơn giản! Bạn chỉ cần xuất Tờ khai 01/CNKD từ phần mềm Autotax, sau đó đăng nhập vào trang web thuedientu.gdt.gov.vn để nộp file XML/Excel này. Tiền thuế bạn có thể quét mã QR nộp trực tiếp qua app ngân hàng hoặc app eTax Mobile của Tổng cục Thuế.'
  }
];

export default function TaxGuide() {
  const [search, setSearch] = useState('');
  const [openFaq, setOpenFaq] = useState(0);

  const filteredRates = TAX_RATES.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) || 
    r.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-indigo-600 p-8 rounded-t-2xl text-white">
        <h2 className="text-3xl font-bold flex items-center gap-3 mb-2">
          <BookOpen className="w-8 h-8" /> Cẩm nang Thuế HKD 2026
        </h2>
        <p className="text-indigo-100 text-lg">
          Tra cứu tỷ lệ thuế suất, hỏi đáp luật mới (Nghị định 68) và hướng dẫn khai nộp thuế điện tử.
        </p>
      </div>

      <div className="p-8">
        <div className="grid lg:grid-cols-2 gap-12">
          
          {/* Left Column: Search & Guide */}
          <div className="space-y-10">
            
            {/* Search Section */}
            <section>
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-primary" /> Tra cứu ngành nghề & Tỷ lệ Thuế
              </h3>
              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-5 h-5" />
                </div>
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                  placeholder="Gõ tên mặt hàng (VD: quần áo, ăn uống, xây dựng...)"
                />
              </div>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl max-h-[300px] overflow-y-auto">
                {filteredRates.length > 0 ? (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="p-3 font-semibold text-slate-600">Ngành nghề</th>
                        <th className="p-3 font-semibold text-slate-600 text-center">Thuế GTGT</th>
                        <th className="p-3 font-semibold text-slate-600 text-center">Thuế TNCN</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredRates.map((rate, i) => (
                        <tr key={i} className="hover:bg-indigo-50 transition-colors">
                          <td className="p-3">
                            <div className="font-medium text-slate-800">{rate.name}</div>
                            <div className="text-xs text-slate-500 mt-1">{rate.category}</div>
                          </td>
                          <td className="p-3 text-center font-bold text-primary">{rate.vat}</td>
                          <td className="p-3 text-center font-bold text-orange-600">{rate.pit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    Không tìm thấy ngành nghề phù hợp.
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Note: Tỷ lệ trên là tỷ lệ chuẩn. Hệ thống đã tự động áp dụng ưu đãi giảm 20% GTGT trong năm 2026 (nếu có).
              </p>
            </section>

            {/* Step-by-step Guide */}
            <section>
              <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-green-500" /> Hướng dẫn nộp Thuế Online
              </h3>
              <div className="bg-green-50 rounded-xl p-6 border border-green-100 space-y-4">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-200 text-green-700 font-bold flex items-center justify-center shrink-0">1</div>
                  <div>
                    <h4 className="font-semibold text-green-900 mb-1">Xuất tờ khai 01/CNKD từ Autotax</h4>
                    <p className="text-sm text-green-800">Truy cập Trang chủ (Dashboard), bấm nút <b>Xuất Tờ Khai 01/CNKD</b> để tải file dữ liệu về máy.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-200 text-green-700 font-bold flex items-center justify-center shrink-0">2</div>
                  <div>
                    <h4 className="font-semibold text-green-900 mb-1">Nộp lên Thuế Điện Tử</h4>
                    <p className="text-sm text-green-800">Đăng nhập cổng <a href="https://thuedientu.gdt.gov.vn" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">thuedientu.gdt.gov.vn</a> bằng tài khoản cấp bởi cơ quan thuế. Nộp file vừa tải lên hệ thống.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-200 text-green-700 font-bold flex items-center justify-center shrink-0">3</div>
                  <div>
                    <h4 className="font-semibold text-green-900 mb-1">Nộp tiền qua eTax Mobile</h4>
                    <p className="text-sm text-green-800">Tải ứng dụng <b>eTax Mobile</b> trên điện thoại. Kiểm tra số thuế phải nộp và quét mã QR thanh toán qua ngân hàng.</p>
                  </div>
                </div>
              </div>
            </section>

          </div>

          {/* Right Column: Q&A */}
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-orange-500" /> Giải đáp Luật Thuế 2026 (NĐ 68)
            </h3>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div 
                  key={i} 
                  className={`border rounded-xl overflow-hidden transition-all duration-300 ${openFaq === i ? 'border-primary shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <button 
                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                    className="w-full text-left p-4 flex items-center justify-between bg-white"
                  >
                    <span className={`font-semibold pr-4 ${openFaq === i ? 'text-primary' : 'text-slate-800'}`}>{faq.q}</span>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 text-slate-400 ${openFaq === i ? 'rotate-180 text-primary' : ''}`} />
                  </button>
                  <div 
                    className={`bg-slate-50 overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96 border-t border-slate-100' : 'max-h-0'}`}
                  >
                    <p className="p-4 text-slate-600 leading-relaxed text-sm">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Promo block */}
            <div className="mt-8 bg-slate-900 rounded-xl p-6 text-white text-center">
              <FileText className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
              <h4 className="font-bold text-lg mb-2">Bạn vẫn thấy rắc rối?</h4>
              <p className="text-slate-400 text-sm mb-4">
                Chỉ cần dùng tính năng "Khai báo tự động" của Autotax, mọi số liệu phức tạp sẽ được giải quyết trong 1 giây.
              </p>
              <button className="bg-white text-slate-900 font-bold px-6 py-2 rounded-lg text-sm hover:bg-slate-200 transition-colors">
                Xem Báo Cáo Của Tôi
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
