import React, { useMemo, useState } from 'react';
import UploadStep from '../components/UploadStep';
import MappingStep from '../components/MappingStep';
import ReportStep from '../components/ReportStep';
import { ArrowRight, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import axios from 'axios';
import API_BASE from '../config/api';

const CATEGORY_LABELS = {
  '1.1': 'Phân phối, cung cấp hàng hóa',
  '1.2': 'Dịch vụ, xây dựng không bao thầu',
  '1.3': 'Cho thuê tài sản',
  '1.4': 'Sản xuất, vận tải, dịch vụ gắn với hàng hóa',
  '1.5': 'Nội dung thông tin số',
  '1.6': 'Hoạt động kinh doanh khác',
};

export default function TaxReportFlow() {
  const [currentStep, setCurrentStep] = useState(1);
  const [excelData, setExcelData] = useState([]);
  const [uniqueProducts, setUniqueProducts] = useState([]);

  const classificationRows = useMemo(() => {
    const mapping = Object.fromEntries(uniqueProducts.map((item) => [item.groupName, item.category || '']));
    return excelData.map((item, index) => ({
      stt: index + 1,
      nhom_san_pham: item.groupName || '',
      dien_giai: item.name || item.productName || item.description || '',
      doanh_thu: Number(item.normalizedRevenue) || 0,
      ma_phan_loai: mapping[item.groupName] || '',
      nhom_hoat_dong: CATEGORY_LABELS[mapping[item.groupName]] || 'Chưa phân loại',
      trang_thai: mapping[item.groupName] ? 'Đã phân loại - cần xác nhận quy tắc thuế' : 'Chưa phân loại',
    }));
  }, [excelData, uniqueProducts]);

  const exportControlWorkbook = async () => {
    const totalRevenue = classificationRows.reduce((sum, row) => sum + row.doanh_thu, 0);
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(classificationRows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Phan loai doanh thu');

    const noteSheet = XLSX.utils.aoa_to_sheet([
      ['AUTOTAX - BẢNG KIỂM TRA PHÂN LOẠI DOANH THU'],
      ['Trạng thái', 'Tài liệu kiểm tra nội bộ - KHÔNG PHẢI tờ khai thuế'],
      ['Tổng doanh thu dữ liệu đã tải', totalRevenue],
      ['Lưu ý', 'Nghĩa vụ thuế chỉ được tính khi có kỳ tính thuế, phương pháp áp dụng, ngữ cảnh doanh thu năm, phân bổ ngưỡng và phiên bản quy tắc pháp lý đã duyệt.'],
    ]);
    XLSX.utils.book_append_sheet(workbook, noteSheet, 'Luu y');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `AutoTax_KiemTraPhanLoaiDoanhThu_${stamp}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    try {
      await axios.post(`${API_BASE}/api/reports`, { fileName, totalRevenue });
    } catch (error) {
      console.warn('[REPORT HISTORY] Không lưu được lịch sử xuất bảng kiểm tra:', error.message);
    }
  };

  return (
    <div className="pb-8">
      <div className="page-header">
        <div>
          <h2 className="page-title">Kiểm soát dữ liệu thuế</h2>
          <p className="page-subtitle">Upload → phân loại hoạt động → kiểm tra độ đầy đủ. AutoTax không tự biến dữ liệu chưa đủ ngữ cảnh thành nghĩa vụ thuế.</p>
        </div>
        <div className="status-pill bg-blue-50 text-blue-700"><FileSpreadsheet className="h-4 w-4" />Kiểm soát trước khai</div>
      </div>

      <div className="surface mb-5 overflow-x-auto p-2">
        <div className="grid min-w-[620px] grid-cols-3 gap-2">
          {[
            [1, 'Upload dữ liệu'],
            [2, 'Phân loại hoạt động'],
            [3, 'Kiểm tra & xuất bảng'],
          ].map(([step, label]) => (
            <div key={step} className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-bold ${currentStep >= step ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-400'}`}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${currentStep >= step ? 'bg-white/15' : 'bg-slate-200 text-slate-500'}`}>{step}</span>
              {label}
            </div>
          ))}
        </div>
      </div>

      {currentStep === 2 && (
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setCurrentStep(3)}>
            Kiểm tra kết quả <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="surface min-h-[520px] overflow-hidden p-4 sm:p-5">
        {currentStep === 1 && (
          <UploadStep
            onUploadSuccess={(data, products) => {
              setExcelData(data);
              setUniqueProducts(products);
              setCurrentStep(2);
            }}
          />
        )}

        {currentStep === 2 && (
          <MappingStep
            products={uniqueProducts}
            setProducts={setUniqueProducts}
            excelData={excelData}
            onExport={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 3 && (
          <ReportStep
            excelData={excelData}
            products={uniqueProducts}
            onExportWorkbook={exportControlWorkbook}
            onBack={() => setCurrentStep(2)}
          />
        )}
      </div>
    </div>
  );
}
