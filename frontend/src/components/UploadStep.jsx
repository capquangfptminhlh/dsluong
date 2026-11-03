import React, { useCallback, useState } from 'react';
import { AlertCircle, File, UploadCloud, UserCog } from 'lucide-react';
import { parseExcel } from '../utils/excelParser';
import axios from 'axios';
import API_BASE from '../config/api';
import TaxpayerProfileModal from './TaxpayerProfileModal';

export default function UploadStep({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const handleDrag = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') setIsDragging(true);
    else if (event.type === 'dragleave') setIsDragging(false);
  }, []);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Vui lòng chọn file Excel (.xlsx, .xls) hoặc .csv');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { raw, products } = await parseExcel(file);

      // Chỉ tái sử dụng mapping đã được lưu/xác nhận trước đây. Không suy đoán nhóm
      // hoạt động từ tên sản phẩm/dịch vụ vì đó là dữ liệu đầu vào cho Rule Engine thuế.
      try {
        const response = await axios.get(`${API_BASE}/api/mappings`);
        const mappingDict = Object.fromEntries((response.data || []).map((item) => [item.keyword, item.category]));
        products.forEach((product) => {
          if (mappingDict[product.groupName]) product.category = mappingDict[product.groupName];
          else delete product.category;
        });
      } catch (requestError) {
        console.warn('[TAX MAPPING] Không tải được mapping đã xác nhận:', requestError.message);
        products.forEach((product) => { delete product.category; });
      }

      onUploadSuccess(raw, products);
    } catch (parseError) {
      setError(parseError.message || 'Có lỗi xảy ra khi đọc file');
    } finally {
      setLoading(false);
    }
  }, [onUploadSuccess]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (event.dataTransfer.files?.[0]) processFile(event.dataTransfer.files[0]);
  }, [processFile]);

  const handleChange = (event) => {
    event.preventDefault();
    if (event.target.files?.[0]) processFile(event.target.files[0]);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-start p-4 sm:p-6 md:p-8">
      <div className="mb-6 w-full max-w-2xl text-center">
        <h2 className="mb-3 text-2xl font-extrabold text-slate-900 md:text-3xl">Tải lên dữ liệu bán hàng</h2>
        <p className="mb-4 text-sm leading-6 text-slate-500 md:text-base">
          Tải file từ sàn TMĐT, POS hoặc sao kê. AutoTax đọc và chuẩn hóa dữ liệu; nhóm hoạt động chưa có mapping đã xác nhận sẽ được để trống để bạn review ở bước tiếp theo.
        </p>
        <button
          type="button"
          onClick={() => setShowProfileModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <UserCog className="h-4 w-4" />
          Cập nhật hồ sơ thuế
        </button>
      </div>

      <div
        className={`w-full max-w-2xl rounded-2xl border-2 border-dashed p-8 transition-all duration-200 ${isDragging ? 'scale-[1.01] border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
            {loading ? <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /> : <UploadCloud className="h-8 w-8" />}
          </div>
          <div className="text-center">
            <p className="mb-1 text-base font-bold text-slate-700">{loading ? 'Đang đọc và chuẩn hóa dữ liệu…' : 'Kéo thả file vào đây'}</p>
            {!loading && <p className="text-xs text-slate-500">hoặc chọn file từ máy tính</p>}
          </div>
          {!loading && (
            <>
              <input type="file" id="file-upload" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleChange} />
              <label htmlFor="file-upload" className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-slate-800">
                <UploadCloud className="h-4 w-4" />Chọn file Excel / CSV
              </label>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex w-full max-w-2xl items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          <AlertCircle className="h-5 w-5 shrink-0" /><p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ['Sàn TMĐT', 'Shopee, TikTok, Lazada', 'bg-emerald-50 text-emerald-600'],
          ['Phần mềm POS', 'KiotViet, Sapo, Haravan', 'bg-blue-50 text-blue-600'],
          ['Sao kê ngân hàng', 'Nhận diện file sao kê', 'bg-amber-50 text-amber-600'],
        ].map(([title, subtitle, tone]) => (
          <div key={title} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`rounded-lg p-2 ${tone}`}><File className="h-5 w-5" /></div>
            <div><h4 className="text-sm font-bold text-slate-800">{title}</h4><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>
          </div>
        ))}
      </div>

      <TaxpayerProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </div>
  );
}
