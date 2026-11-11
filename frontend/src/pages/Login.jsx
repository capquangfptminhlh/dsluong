import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, Store } from 'lucide-react';
import PWAInstallPrompt from '../components/PWAInstallPrompt';
import API_BASE from '../config/api';
import logo from '../assets/logo.png';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/app');
    }
    axios
      .get(`${API_BASE}/api/branches`)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setBranches(list);
        const savedId = localStorage.getItem('active_branch_id');
        const def = list.find((b) => String(b.id) === String(savedId)) || list.find((b) => b.is_default) || list[0];
        if (def) setSelectedBranchId(String(def.id));
      })
      .catch(() => {});
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!phone || !password) return alert('Vui lòng nhập số điện thoại/tài khoản và mật khẩu!');

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, {
        phone,
        password,
        branch_id: selectedBranchId ? Number(selectedBranchId) : undefined
      });
      if (res.data.requireOtp) {
        if (res.data.otp) {
          alert(`[Dev/Test] Mã OTP của bạn là: ${res.data.otp}`);
        }
        setStep(2);
      } else {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));
        if (res.data.user.sector) {
          localStorage.setItem('industry_type', res.data.user.sector);
        }
        const activeBranch = res.data.branch || branches.find((b) => String(b.id) === String(selectedBranchId));
        if (activeBranch) {
          localStorage.setItem('active_branch_id', String(activeBranch.id));
          localStorage.setItem('active_branch_name', activeBranch.name);
        }
        navigate('/app');
      }
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        alert(err.response.data.error);
      } else {
        alert('Đã có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp) return alert('Vui lòng nhập mã OTP!');

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login-verify`, { phone, otp });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      if (res.data.user.sector) {
        localStorage.setItem('industry_type', res.data.user.sector);
      }
      navigate('/app');
    } catch (err) {
      if (err.response && err.response.data && err.response.data.error) {
        alert(err.response.data.error);
      } else {
        alert('Mã OTP không hợp lệ hoặc đã hết hạn.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <img src={logo} alt="Nhà Thuốc Nhân Đức" className="h-20 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Nhà Thuốc Nhân Đức</h1>
          <p className="text-emerald-700 font-medium text-xs mt-1">Hệ thống Quản lý Bán thuốc Chuẩn GPP</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleLogin} className="space-y-4">
            {branches.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Chi nhánh / Quầy thuốc làm việc</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-600">
                    <Store className="w-5 h-5" />
                  </div>
                  <select
                    value={selectedBranchId}
                    onChange={(e) => setSelectedBranchId(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-emerald-50/60 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none font-bold text-slate-800 text-sm"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.is_default ? '(Cơ sở chính)' : `(TK: ${b.username || 'cn' + b.id})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại / Tài khoản chi nhánh</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                  placeholder="0933324368 hoặc cn2, duocsiminh..."
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-md shadow-blue-200 flex items-center justify-center disabled:opacity-70 mt-2"
            >
              {loading ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm mb-4">
              Mã xác nhận OTP (6 số) đã được gửi đến email đăng ký của bạn. Vui lòng kiểm tra hộp thư.
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nhập mã OTP</label>
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none text-center font-mono text-xl tracking-widest font-bold"
                placeholder="123456"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors shadow-md shadow-green-200 flex items-center justify-center disabled:opacity-70 mt-2"
            >
              {loading ? 'Đang kiểm tra...' : 'Xác nhận Đăng nhập'}
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors flex items-center justify-center mt-2"
            >
              Quay lại
            </button>
          </form>
        )}

        <div className="mt-5">
          <PWAInstallPrompt variant="banner" />
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm">
          <span className="text-slate-500">Chưa có tài khoản? </span>
          <Link to="/register" className="font-bold text-blue-600 hover:text-blue-700">
            Đăng ký cửa hàng mới
          </Link>
        </div>
      </div>
    </div>
  );
}
