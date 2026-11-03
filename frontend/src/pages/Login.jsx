import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, ShieldCheck, BarChart3, ReceiptText } from 'lucide-react';
import API_BASE from '../config/api';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!phone || !password) return alert('Vui lòng nhập số điện thoại và mật khẩu!');
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, { phone, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      if (res.data.user.sector) localStorage.setItem('industry_type', res.data.user.sector);
      navigate('/app');
    } catch (err) {
      if (err.response?.data?.error) alert(err.response.data.error);
      else alert('Đã có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_30px_90px_rgba(31,50,89,.10)] sm:min-h-[calc(100vh-40px)] lg:grid-cols-[1.12fr_.88fr]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#eef5ff] via-[#f5f7ff] to-[#ecfbf6] p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -left-24 bottom-[-120px] h-[440px] w-[440px] rounded-full bg-blue-300/20 blur-3xl" />
          <div className="absolute right-[-80px] top-[-100px] h-[380px] w-[380px] rounded-full bg-violet-300/20 blur-3xl" />
          <div className="relative z-10 flex items-center gap-3">
            <img src="/autotax-logo.svg" alt="AutoTax" className="h-12 w-12 rounded-2xl shadow-sm" />
            <div><div className="text-xl font-black tracking-tight text-slate-950">AutoTaxPOS</div><div className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">Business Control</div></div>
          </div>

          <div className="relative z-10 max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-sm backdrop-blur"><ShieldCheck className="h-4 w-4" /> Vận hành cửa hàng tập trung</div>
            <h1 className="text-5xl font-black leading-[1.06] tracking-[-.045em] text-[#10203f]">Bán hàng, kho, tài chính và dữ liệu thuế trong một hệ thống.</h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-500">Giao diện tối ưu cho thao tác hàng ngày: nhanh ở quầy, rõ ở back-office và nhất quán trên mọi nghiệp vụ.</p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                [BarChart3, 'Tổng quan', 'Theo dõi vận hành'],
                [ReceiptText, 'Bán hàng', 'Đơn & thanh toán'],
                [ShieldCheck, 'Kiểm soát', 'Quyền & dữ liệu'],
              ].map(([Icon, title, note]) => (
                <div key={title} className="rounded-2xl border border-white/80 bg-white/72 p-4 shadow-[0_12px_30px_rgba(31,50,89,.05)] backdrop-blur">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm"><Icon className="h-5 w-5" /></div>
                  <div className="text-sm font-extrabold text-slate-800">{title}</div><div className="mt-1 text-[11px] text-slate-400">{note}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 text-xs font-medium text-slate-400">AutoTaxPOS · Commercial operations workspace</div>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-10 lg:p-14">
          <div className="w-full max-w-md">
            <div className="mb-9 lg:hidden"><div className="flex items-center gap-3"><img src="/autotax-logo.svg" alt="AutoTax" className="h-11 w-11 rounded-xl" /><div><div className="text-lg font-black text-slate-950">AutoTaxPOS</div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Business Control</div></div></div></div>
            <div className="mb-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><ShieldCheck className="h-6 w-6" /></div>
              <h2 className="text-3xl font-black tracking-[-.04em] text-[#10203f]">Chào mừng trở lại</h2>
              <p className="mt-2 text-sm text-slate-500">Đăng nhập để quản lý cửa hàng và dữ liệu vận hành.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div><label className="mb-2 block text-xs font-bold text-slate-600">Số điện thoại</label><div className="relative"><Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" placeholder="0912345678" required /></div></div>
              <div><div className="mb-2 flex items-center justify-between"><label className="text-xs font-bold text-slate-600">Mật khẩu</label><span className="text-xs font-semibold text-blue-600">Bảo mật tài khoản</span></div><div className="relative"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" placeholder="••••••••" required /></div></div>
              <button type="submit" disabled={loading} className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-500/20 transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 disabled:hover:translate-y-0">{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
            </form>

            <div className="mt-8 border-t border-slate-100 pt-6 text-center text-sm"><span className="text-slate-500">Chưa có tài khoản? </span><Link to="/register" className="font-extrabold text-blue-600 hover:text-blue-700">Đăng ký cửa hàng mới</Link></div>
          </div>
        </section>
      </div>
    </div>
  );
}