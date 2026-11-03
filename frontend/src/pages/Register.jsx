import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Store, Phone, Lock, ChevronRight, Activity } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';
import logo from '../assets/logo.png';

export default function Register() {
  const [form, setForm] = useState({ shopName: 'Nhà Thuốc Nhân Đức', phone: '', password: '', sector: 'pharmacy', email: '' });
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await axios.post(`${API_BASE}/api/auth/register-request`, {
        name: form.shopName,
        phone: form.phone,
        password: form.password,
        sector: form.sector,
        email: form.email
      });
      setStep(2);
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi gửi OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/register-verify`, {
        phone: form.phone,
        otp
      });
      if (res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        localStorage.setItem('industry_type', res.data.user.sector || form.sector);
        window.dispatchEvent(new Event('industryChange'));
        navigate('/app');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Mã OTP không đúng');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-4">
          <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-20 w-auto object-contain" />
        </div>
        <h2 className="text-center text-3xl font-black text-slate-900">
          Khởi tạo Nhà Thuốc Mới
        </h2>
        <p className="mt-2 text-center text-sm text-emerald-700 font-bold">
          Hệ thống Quản lý Bán thuốc &amp; Kê đơn Chuẩn GPP
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-slate-200/50 sm:rounded-3xl sm:px-10 border border-slate-100">
          {step === 1 ? (
            <form className="space-y-6" onSubmit={handleRequestOTP}>
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
                  Số điện thoại
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
                  Email (Để nhận mã OTP)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                  </div>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="block w-full pl-10 pr-3 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-medium"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">
                  Mật khẩu (Tối thiểu 8 ký tự gồm chữ & số)
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
                    className="block w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-emerald-800 font-bold bg-emerald-50/50 appearance-none"
                  >
                    <option value="pharmacy">💊 Nhà thuốc &amp; Quầy thuốc chuẩn GPP</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <ChevronRight className="h-5 w-5 text-emerald-600 rotate-90" />
                  </div>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors disabled:bg-emerald-400"
                >
                  {isLoading ? 'Đang gửi mã...' : 'Khởi tạo Nhà Thuốc'} <ChevronRight className="w-4 h-4"/>
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleVerifyOTP}>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-500 mb-4">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900">Nhập mã xác nhận</h3>
                <p className="text-sm text-slate-500 mt-2">Mã OTP 6 số đã được gửi tới email <br/> <strong>{form.email}</strong></p>
              </div>

              <div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="block w-full px-4 py-4 text-center text-2xl tracking-[0.5em] border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 font-bold"
                  placeholder="------"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 px-4 border border-slate-200 rounded-xl shadow-sm text-sm font-bold text-slate-700 bg-white hover:bg-slate-50 transition-colors"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:bg-blue-400"
                >
                  {isLoading ? 'Đang xử lý...' : 'Xác nhận OTP'}
                </button>
              </div>
            </form>
          )}

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
