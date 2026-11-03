import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, ShieldAlert, Lock, Unlock } from 'lucide-react';
import API_BASE, { downloadAuthFile } from '../config/api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [_onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [changingId, setChangingId] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/auth/users`);
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();

    const fetchOnline = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/system/online-users`);
        setOnlineUsers(res.data);
      } catch {}
    };

    fetchOnline();
    const interval = setInterval(fetchOnline, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleLock = async (user) => {
    const isLocked = user.status === 'locked';
    const locked = !isLocked;
    const actionText = locked ? 'khóa' : 'mở khóa';
    if (!window.confirm(`${locked ? 'Khóa' : 'Mở khóa'} tài khoản của ${user.name}?${locked ? ' Phiên đăng nhập hiện tại sẽ bị từ chối ở yêu cầu API kế tiếp.' : ''}`)) return;

    setChangingId(user.id);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/users/${user.id}/lock`, { locked });
      setUsers((current) => current.map((item) => (
        item.id === user.id ? { ...item, status: res.data?.status || (locked ? 'locked' : 'active') } : item
      )));
    } catch (err) {
      alert(err.response?.data?.error || `Lỗi khi ${actionText} tài khoản`);
    } finally {
      setChangingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm h-full p-8 flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center justify-between w-full">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <ShieldAlert className="text-red-500 w-6 h-6" /> Quản trị Hệ thống
            </h2>
            <p className="text-slate-500 mt-1">Danh sách Hộ kinh doanh đang sử dụng hệ thống. Xóa cứng online đã được tắt để bảo vệ dữ liệu cửa hàng.</p>
          </div>
          <button
            onClick={() => downloadAuthFile('/api/auth/users/export', 'Leads-Export.xlsx').catch(() => alert('Chỉ superadmin mới xuất được danh sách này.'))}
            className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 border border-green-200 font-semibold rounded-xl hover:bg-green-100 transition-colors"
          >
            Xuất Excel Data (Zalo)
          </button>
        </div>
        <div className="bg-indigo-50 text-primary px-4 py-2 rounded-lg font-bold ml-4">
          Tổng cộng: {users.length} Leads
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="py-3 px-4 text-slate-500 font-semibold text-sm">ID</th>
              <th className="py-3 px-4 text-slate-500 font-semibold text-sm">Tên Cửa Hàng / HKD</th>
              <th className="py-3 px-4 text-slate-500 font-semibold text-sm">Số điện thoại (Zalo)</th>
              <th className="py-3 px-4 text-slate-500 font-semibold text-sm">Trạng thái</th>
              <th className="py-3 px-4 text-slate-500 font-semibold text-sm">Ngày Đăng ký</th>
              <th className="py-3 px-4 text-right text-slate-500 font-semibold text-sm">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-500">Đang tải dữ liệu...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-8 text-slate-500">Chưa có khách hàng nào.</td></tr>
            ) : (
              users.map(user => {
                const isLocked = user.status === 'locked';
                return (
                  <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                    <td className="py-3 px-4 text-slate-500">#{user.id}</td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 text-primary rounded-full flex items-center justify-center">
                          <Users className="w-4 h-4" />
                        </div>
                        {user.name}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">{user.phone}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${isLocked ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                        {isLocked ? 'Đã khóa' : 'Hoạt động'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-sm">
                      {new Date(user.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        disabled={changingId === user.id}
                        onClick={() => handleToggleLock(user)}
                        className={`px-3 py-1.5 rounded-lg transition-colors text-sm font-semibold flex items-center gap-1 ml-auto disabled:opacity-50 ${isLocked ? 'bg-green-50 text-green-700 hover:bg-green-600 hover:text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white'}`}
                      >
                        {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        {changingId === user.id ? 'Đang xử lý...' : (isLocked ? 'Mở khóa' : 'Khóa')}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
