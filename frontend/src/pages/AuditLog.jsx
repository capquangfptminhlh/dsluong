import React, { useState, useEffect, useMemo } from 'react';
import { ScrollText, Search, Download, RefreshCw, User, Shield } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import { xuatExcel } from '../utils/excel';

// Dịch mã hành động sang tiếng Việt dễ hiểu
const NHAN = {
  'order.cancel': { t: 'Hủy đơn hàng', m: 'rose' },
  'return.create': { t: 'Trả hàng', m: 'rose' },
  'product.delete': { t: 'Xóa sản phẩm', m: 'rose' },
  'category.delete': { t: 'Xóa danh mục', m: 'rose' },
  'supplier.delete': { t: 'Xóa nhà cung cấp', m: 'rose' },
  'promo.delete': { t: 'Xóa khuyến mãi', m: 'rose' },
  'user.delete': { t: 'Xóa tài khoản', m: 'rose' },
  'users.export': { t: 'Xuất danh sách khách', m: 'amber' },
  'purchase.create': { t: 'Nhập hàng', m: 'emerald' },
  'inventory.in': { t: 'Nhập kho', m: 'emerald' },
  'inventory.out': { t: 'Xuất kho', m: 'amber' },
  'inventory.check': { t: 'Kiểm kho', m: 'slate' },
  'cash.in': { t: 'Phiếu thu', m: 'emerald' },
  'cash.out': { t: 'Phiếu chi', m: 'amber' },
  'debt.pay': { t: 'Thanh toán công nợ', m: 'emerald' },
  'staff.create': { t: 'Thêm nhân viên', m: 'slate' },
  'staff.update': { t: 'Sửa nhân viên', m: 'amber' },
  'staff.lock': { t: 'Khóa nhân viên', m: 'rose' },
  'staff.unlock': { t: 'Mở khóa nhân viên', m: 'emerald' },
  'staff.commission': { t: 'Ghi hoa hồng', m: 'slate' },
  'shift.open': { t: 'Mở ca', m: 'slate' },
  'shift.close': { t: 'Chốt ca', m: 'slate' },
  'backup.create': { t: 'Tạo sao lưu', m: 'slate' },
  'backup.download': { t: 'Tải sao lưu', m: 'amber' },
  'backup.delete': { t: 'Xóa sao lưu', m: 'rose' },
  'backup.restore_queued': { t: 'Yêu cầu khôi phục dữ liệu', m: 'rose' },
};

const MAU = {
  rose: 'bg-rose-100 text-rose-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  slate: 'bg-slate-100 text-slate-600',
};

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [locHanhDong, setLocHanhDong] = useState('all');
  const [chiNhayCam, setChiNhayCam] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/staff/audit-log?limit=1000`);
      setRows(res.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const nhan = (a) => NHAN[a] || { t: a, m: 'slate' };

  const danhSachHanhDong = useMemo(
    () => [...new Set(rows.map((r) => r.action))].sort(),
    [rows]
  );

  const hienThi = useMemo(() => rows.filter((r) => {
    const n = nhan(r.action);
    if (chiNhayCam && n.m !== 'rose' && n.m !== 'amber') return false;
    if (locHanhDong !== 'all' && r.action !== locHanhDong) return false;
    if (!search) return true;
    const txt = `${r.actor_name || ''} ${r.action} ${n.t} ${r.target || ''} ${r.detail || ''}`.toLowerCase();
    return txt.includes(search.toLowerCase());
  }), [rows, search, locHanhDong, chiNhayCam]);

  const chiTiet = (d) => {
    if (!d) return '';
    try {
      const o = JSON.parse(d);
      return Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
    } catch { return d; }
  };

  const xuat = () => xuatExcel(
    hienThi,
    [
      { key: 'created_at', label: 'Thời gian' },
      { key: 'actor_name', label: 'Người thực hiện' },
      { key: 'actor_type', label: 'Vai trò', format: (v) => (v === 'owner' ? 'Chủ cửa hàng' : 'Nhân viên') },
      { key: 'action', label: 'Hành động', format: (v) => nhan(v).t },
      { key: 'target', label: 'Đối tượng' },
      { key: 'detail', label: 'Chi tiết', format: chiTiet },
      { key: 'ip', label: 'IP' },
    ],
    'Nhat-ky-thao-tac', 'Nhật ký'
  );

  return (
    <div className="p-8 max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <ScrollText className="w-8 h-8 text-slate-700" /> Nhật Ký Thao Tác
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Ai đã làm gì, lúc nào — dùng để truy vết khi có sai lệch</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200">
            <RefreshCw className="w-3.5 h-3.5" /> Tải lại
          </button>
          <button onClick={xuat} className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-900">
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo người, hành động, đối tượng..."
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-500" />
          </div>
          <select value={locHanhDong} onChange={(e) => setLocHanhDong(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-500 bg-white">
            <option value="all">Tất cả hành động</option>
            {danhSachHanhDong.map((a) => <option key={a} value={a}>{nhan(a).t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer">
            <input type="checkbox" checked={chiNhayCam} onChange={(e) => setChiNhayCam(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-rose-600" />
            Chỉ xem việc nhạy cảm
          </label>
          <span className="text-xs text-slate-400 ml-auto">{hienThi.length} bản ghi</span>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? <div className="py-16 text-center text-slate-400">Đang tải...</div>
            : hienThi.length === 0 ? (
              <div className="py-16 text-center">
                <ScrollText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">{rows.length === 0 ? 'Chưa có thao tác nào được ghi nhận.' : 'Không có bản ghi khớp bộ lọc.'}</p>
                {rows.length === 0 && <p className="text-slate-400 text-sm mt-1">Nhật ký sẽ ghi lại khi có hủy đơn, xóa hàng, nhập kho, thu chi...</p>}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 sticky top-0">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Thời gian</th>
                    <th className="py-3 px-4 font-semibold">Người làm</th>
                    <th className="py-3 px-4 font-semibold">Hành động</th>
                    <th className="py-3 px-4 font-semibold">Đối tượng</th>
                    <th className="py-3 px-4 font-semibold">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hienThi.map((r) => {
                    const n = nhan(r.action);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{(r.created_at || '').replace('T', ' ').split('.')[0]}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {r.actor_type === 'owner' ? <Shield className="w-3.5 h-3.5 text-indigo-500" /> : <User className="w-3.5 h-3.5 text-slate-400" />}
                            <span className="font-semibold text-slate-700">{r.actor_name || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${MAU[n.m]}`}>{n.t}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{r.target || '—'}</td>
                        <td className="py-3 px-4 text-xs text-slate-500 max-w-md truncate" title={chiTiet(r.detail)}>{chiTiet(r.detail)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}
