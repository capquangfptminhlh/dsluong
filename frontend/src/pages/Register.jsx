import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Store, Phone, Lock, ChevronRight, Activity } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function Register() {
  const [form, setForm] = useState({ shopName: '', phone: '', password: '', sector: 'retail' });
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      // Backend mới nhận { name, phone, password, sector } và trả về { token, user }
      const res = await axios.post(`${API_BASE}/api/auth/register`, {
        name: form.shopName,
        phone: form.phone,
        password: form.password,
        sector: form.sector,
      });
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('industry_type', res.data.user.sector || form.sector); // Save industry to adapt UI
        window.dispatchEvent(new Event('industryChange')); // Trigger UI update if needed
        navigate('/app');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi đăng ký');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Activity className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-black text-slate-900">
          Khởi tạo Cửa Hàng Mới
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 font-medium">
          Đăng ký để trải nghiệm Nền tảng ERP đa kênh mạnh mẽ nhất
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleRegister}>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Tên cửa hàng / Thương hiệu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Store className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={form.shopName}
                  onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-medium"
                  placeholder="VD: Cửa hàng Thời trang ABC..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Số điện thoại (Tài khoản Đăng nhập)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-medium"
                  placeholder="0901234567"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-medium"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Mô hình kinh doanh
              </label>
              <div className="relative">
                <select
                  value={form.sector}
                  onChange={(e) => setForm({ ...form, sector: e.target.value })}
                  className="block w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-bold bg-slate-50 appearance-none"
                >
                  <option value="retail">Bán lẻ (Siêu thị, Tạp hóa, Thời trang)</option>
                  <option value="spa">Spa & Dịch vụ làm đẹp</option>
                  <option value="fnb">Nhà hàng & Quán Cafe (F&B)</option>
                  <option value="hotel">Khách sạn (Hotel & Resort)</option>
                  <option value="petshop">Pet Shop (Thú cưng)</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <ChevronRight className="h-5 w-5 text-slate-400 rotate-90" />
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Khởi tạo Cửa Hàng <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-slate-500">Đã có tài khoản? </span>
            <Link to="/login" className="font-bold text-blue-600 hover:text-blue-500">
              Đăng nhập ngay
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
