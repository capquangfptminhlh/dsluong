import React, { useState, useEffect, useRef } from 'react';
import { DatabaseBackup, Download, Trash2, Upload, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Backup() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dangTao, setDangTao] = useState(false);
  const [dangCho, setDangCho] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ds, tt] = await Promise.all([
        axios.get(`${API_BASE}/api/backup`),
        axios.get(`${API_BASE}/api/backup/restore/status`).catch(() => ({ data: { dang_cho: false } })),
      ]);
      setList(ds.data);
      setDangCho(tt.data.dang_cho);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const dungLuong = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  };

  const taoSaoLuu = async () => {
    setDangTao(true);
    try {
      const res = await axios.post(`${API_BASE}/api/backup/create`);
      alert(`Đã tạo bản sao lưu: ${res.data.name} (${dungLuong(res.data.size)})`);
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi sao lưu'); }
    finally { setDangTao(false); }
  };

  const taiVe = async (name) => {
    try {
      const res = await axios.get(`${API_BASE}/api/backup/download/${encodeURIComponent(name)}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert('Lỗi khi tải file'); }
  };

  const xoa = async (name) => {
    if (!window.confirm(`Xóa bản sao lưu "${name}"?`)) return;
    try { await axios.delete(`${API_BASE}/api/backup/${encodeURIComponent(name)}`); fetchAll(); }
    catch { alert('Lỗi khi xóa'); }
  };

  const khoiPhuc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const xacNhan = window.prompt(
      `CẢNH BÁO: Khôi phục sẽ THAY THẾ toàn bộ dữ liệu hiện tại bằng dữ liệu trong file "${file.name}".\n\n` +
      `Dữ liệu hiện tại sẽ được cất tự động vào thư mục backups/ trước khi thay.\n\n` +
      `Gõ chữ KHOIPHUC (in hoa, không dấu) để xác nhận:`
    );
    if (xacNhan !== 'KHOIPHUC') { if (fileRef.current) fileRef.current.value = ''; return; }

    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(`${API_BASE}/api/backup/restore`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(`${res.data.message}\n\nFile chứa ${res.data.so_tai_khoan} tài khoản.`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi khi khôi phục');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const huyKhoiPhuc = async () => {
    if (!window.confirm('Hủy yêu cầu khôi phục đang chờ?')) return;
    try { await axios.delete(`${API_BASE}/api/backup/restore/pending`); fetchAll(); }
    catch { alert('Lỗi'); }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
          <DatabaseBackup className="w-8 h-8 text-teal-600" /> Sao Lưu & Khôi Phục
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Bảo vệ toàn bộ sổ sách, hàng hóa, hóa đơn của cửa hàng</p>
      </div>

      {dangCho && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-bold text-amber-900">Đang chờ khởi động lại backend để khôi phục</div>
            <p className="text-sm text-amber-800 mt-1">Bản sao lưu đã được nhận và kiểm tra. Hãy khởi động lại dịch vụ backend AutoTax trên máy chủ đang chạy hệ thống để hoàn tất khôi phục. Dữ liệu hiện tại sẽ được cất một bản an toàn trước khi thay thế.</p>
            <button onClick={huyKhoiPhuc} className="mt-2 text-sm font-bold text-amber-900 underline">Hủy yêu cầu khôi phục</button>
          </div>
        </div>
      )}

      <div className="bg-teal-50 border border-teal-100 rounded-2xl p-5 mb-6 flex items-start gap-3">
        <ShieldAlert className="w-6 h-6 text-teal-600 shrink-0 mt-0.5" />
        <div className="text-sm text-teal-900">
          <b>Backend tự kiểm tra sao lưu mỗi giờ và tạo tối đa một bản mỗi ngày theo giờ Việt Nam</b>, giữ 30 bản gần nhất trong thư mục <span className="font-mono">backend/backups/</span>.
          <div className="mt-1">Nên <b>bấm "Tải về"</b> định kỳ và cất bản sao lưu ở nơi khác (USB, Google Drive) — nếu máy chủ hoặc ổ đĩa gặp sự cố thì bản nằm cùng máy cũng có thể mất theo.</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <button onClick={taoSaoLuu} disabled={dangTao} className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-md shadow-teal-200 disabled:opacity-60">
          {dangTao ? <RefreshCw className="w-5 h-5 animate-spin" /> : <DatabaseBackup className="w-5 h-5" />}
          {dangTao ? 'Đang sao lưu...' : 'Sao lưu ngay'}
        </button>
        <label className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-rose-200 text-rose-700 font-bold rounded-xl hover:bg-rose-50 cursor-pointer">
          <Upload className="w-5 h-5" /> Khôi phục từ file...
          <input ref={fileRef} type="file" accept=".db" onChange={khoiPhuc} className="hidden" />
        </label>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 font-bold text-slate-700">Các bản sao lưu ({list.length})</div>
        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div> : list.length === 0 ? (
            <div className="py-16 text-center">
              <DatabaseBackup className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">Chưa có bản sao lưu nào.</p>
              <p className="text-slate-400 text-sm mt-1">Bấm "Sao lưu ngay" để tạo bản đầu tiên.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0"><tr><th className="py-3 px-4 font-semibold">Tên file</th><th className="py-3 px-4 font-semibold">Thời điểm</th><th className="py-3 px-4 font-semibold text-right">Dung lượng</th><th className="py-3 px-4 font-semibold text-right">Thao tác</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((b, i) => (
                  <tr key={b.name} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">{b.name}{i === 0 && <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">MỚI NHẤT</span>}</td>
                    <td className="py-3 px-4 text-slate-500">{new Date(b.createdAt).toLocaleString('vi-VN')}</td>
                    <td className="py-3 px-4 text-right text-slate-600">{dungLuong(b.size)}</td>
                    <td className="py-3 px-4 text-right"><div className="flex justify-end gap-1"><button onClick={() => taiVe(b.name)} title="Tải về máy" className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg"><Download className="w-4 h-4" /></button><button onClick={() => xoa(b.name)} title="Xóa" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
