import React, { useMemo } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileCheck2, ShieldCheck } from 'lucide-react';

const CATEGORIES = [
  ['1.1', 'Phân phối, cung cấp hàng hóa'],
  ['1.2', 'Dịch vụ, xây dựng không bao thầu'],
  ['1.3', 'Cho thuê tài sản'],
  ['1.4', 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa'],
  ['1.5', 'Nội dung thông tin số'],
  ['1.6', 'Hoạt động kinh doanh khác'],
];

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} ₫`;

export default function ReportStep({ excelData = [], products = [], onExportWorkbook, onBack }) {
  const report = useMemo(() => {
    const groupToCategory = Object.fromEntries(products.map((item) => [item.groupName, item.category || '']));
    const byCategory = Object.fromEntries(CATEGORIES.map(([id, name]) => [id, { id, name, revenue: 0, rows: 0 }]));
    let totalRevenue = 0;
    let classifiedRevenue = 0;
    let classifiedRows = 0;

    excelData.forEach((item) => {
      const revenue = Number(item.normalizedRevenue) || 0;
      totalRevenue += revenue;
      const category = groupToCategory[item.groupName];
      if (category && byCategory[category]) {
        byCategory[category].revenue += revenue;
        byCategory[category].rows += 1;
        classifiedRevenue += revenue;
        classifiedRows += 1;
      }
    });

    return {
      totalRevenue,
      classifiedRevenue,
      unclassifiedRevenue: totalRevenue - classifiedRevenue,
      classifiedRows,
      totalRows: excelData.length,
      completeness: excelData.length ? Math.round((classifiedRows / excelData.length) * 100) : 0,
      breakdown: Object.values(byCategory).filter((item) => item.rows > 0 || item.revenue !== 0),
    };
  }, [excelData, products]);

  const readyForReview = report.totalRows > 0 && report.completeness === 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className={`status-pill ${readyForReview ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {readyForReview ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {readyForReview ? 'Đủ phân loại để chuyển bước review' : 'Còn dữ liệu cần phân loại'}
          </div>
          <h3 className="mt-3 text-xl font-extrabold text-slate-950">Bảng kiểm tra phân loại doanh thu</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Đây là lớp kiểm soát dữ liệu trước khi áp dụng Rule Engine thuế. Màn hình này không tự tính số thuế phải nộp và không tạo tờ khai chính thức.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />Quay lại phân loại</button>
          <button type="button" className="btn-primary" onClick={onExportWorkbook} disabled={!report.totalRows}><Download className="h-4 w-4" />Xuất bảng kiểm tra</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card"><div className="metric-label">Tổng doanh thu dữ liệu</div><div className="metric-value">{money(report.totalRevenue)}</div><div className="mt-2 text-xs text-slate-400">{report.totalRows.toLocaleString('vi-VN')} dòng dữ liệu</div></div>
        <div className="metric-card"><div className="metric-label">Đã phân loại</div><div className="metric-value">{report.completeness}%</div><div className="mt-2 text-xs text-slate-400">{report.classifiedRows}/{report.totalRows} dòng</div></div>
        <div className="metric-card"><div className="metric-label">Doanh thu đã phân loại</div><div className="metric-value">{money(report.classifiedRevenue)}</div><div className="mt-2 text-xs text-slate-400">Sẵn sàng cho bước review quy tắc</div></div>
        <div className="metric-card"><div className="metric-label">Chưa phân loại</div><div className={`metric-value ${report.unclassifiedRevenue ? 'text-amber-600' : ''}`}>{money(report.unclassifiedRevenue)}</div><div className="mt-2 text-xs text-slate-400">Phải xử lý trước khi tính thuế</div></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className="surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileCheck2 className="h-4 w-4 text-blue-600" />Doanh thu theo nhóm hoạt động</div>
            <div className="mt-1 text-xs text-slate-400">Chỉ là phân loại dữ liệu, không phải tỷ lệ hay nghĩa vụ thuế.</div>
          </div>
          <div className="divide-y divide-slate-100">
            {report.breakdown.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xs font-extrabold text-slate-600">{item.id}</div>
                <div className="min-w-0 flex-1"><div className="text-sm font-bold text-slate-800">{item.name}</div><div className="mt-0.5 text-[11px] text-slate-400">{item.rows} dòng dữ liệu</div></div>
                <div className="text-right text-sm font-extrabold text-slate-900">{money(item.revenue)}</div>
              </div>
            ))}
            {!report.breakdown.length && <div className="px-5 py-12 text-center text-sm text-slate-400">Chưa có dữ liệu đã phân loại.</div>}
          </div>
        </section>

        <section className="surface p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="h-5 w-5" /></div>
          <h4 className="mt-4 text-base font-extrabold text-slate-900">Hard Gate trước tính thuế</h4>
          <div className="mt-4 space-y-3 text-sm">
            {[
              ['Phân loại 100% dữ liệu', report.completeness === 100],
              ['Đã xác định kỳ tính thuế', false],
              ['Đã chọn phương pháp áp dụng', false],
              ['Đã nạp phiên bản quy tắc hiệu lực', false],
              ['Đã review / phê duyệt', false],
            ].map(([label, ok]) => (
              <div key={label} className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${ok ? 'text-emerald-500' : 'text-slate-300'}`} />
                <span className={ok ? 'font-semibold text-slate-700' : 'text-slate-400'}>{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            AutoTax chặn việc sinh “thuế phải nộp”, “hoàn thuế” hoặc “nộp eTax” khi chưa đủ các gate trên. Điều này ngăn dữ liệu vận hành bị hiểu nhầm thành kết luận pháp lý.
          </div>
        </section>
      </div>
    </div>
  );
}
