import React, { useState, useEffect } from 'react';
import { Clock, Wallet, LogIn, LogOut, TrendingUp, TrendingDown } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

const formatShiftTime = (value) => {
  if (!value) return '—';
  const raw = String(value).trim();
  const sqliteUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw);
  const date = new Date(sqliteUtc ? `${raw.replace(' ', 'T')}Z` : raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export default function Shift() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState('');
  const [closing, setClosing] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [c, h] = await Promise.all([
        axios.get(`${API_BASE}/api/shifts/current`),
        axios.get(`${API_BASE}/api/shifts`),
      ]);
      setCurrent(c.data);
      setHistory(h.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const money = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + ' ₫';

  const moCa = async () => {
    const openingValue = opening.trim() === '' ? 0 : Number(opening);
    if (!Number.isFinite(openingValue) || openingValue < 0) return alert('Tiền đầu ca không hợp lệ!');
    try {
      await axios.post(`${API_BASE}/api/shifts/open`, { opening_cash: openingValue });
      setOpening('');
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi mở ca'); }
  };

  const chotCa = async () => {
    if (closing === '') return alert('Nhập số tiền thực tế đếm được!');
    const closingValue = Number(closing);
    if (!Number.isFinite(closingValue) || closingValue < 0) return alert('Tiền cuối ca không hợp lệ!');
    try {
      const res = await axios.post(`${API_BASE}/api/shifts/close`, { closing_cash: closingValue, note });
      const d = res.data.difference;
      alert(`Đã chốt ca.\nDự kiến: ${money(res.data.expected_cash)}\nThực đếm: ${money(res.data.closing_cash)}\nChênh lệch: ${d === 0 ? 'Khớp' : (d > 0 ? 'Thừa ' : 'Thiếu ') + money(Math.abs(d))}`);
      setClosing(''); setNote('');
      fetchAll();
    } catch (err) { alert(err.response?.data?.error || 'Lỗi khi chốt ca'); }
  };

  const duKien = current ? Number(current.expected_now) || 0 : 0;
  const closingNumber = closing === '' ? null : Number(closing);
  const lechDuKien = closingNumber !== null && Number.isFinite(closingNumber) ? closingNumber - duKien : null;

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
          <Clock className="w-8 h-8 text-indigo-500" /> Chốt Ca Thu Ngân
        </h1>
        <p className="text-slate-500 mt-1 font-medium">Đếm tiền đầu/cuối ca, đối chiếu toàn bộ tiền mặt thực thu/chi trong két để chống thất thoát</p>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Đang tải...</div>
      ) : !current ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 max-w-md">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
            <LogIn className="w-7 h-7 text-indigo-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-1">Bắt đầu ca làm việc</h2>
          <p className="text-sm text-slate-500 mb-4">Nhập số tiền mặt có sẵn trong két đầu ca.</p>
          <label className="block text-sm font-bold text-slate-700 mb-1">Tiền đầu ca</label>
          <input type="number" min="0" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="VD: 500000"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 mb-4" />
          <button onClick={moCa} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5" /> Mở ca
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-indigo-500/20">
              <div className="flex items-center gap-2 opacity-90 mb-1"><Wallet className="w-5 h-5" /><span className="font-semibold">Tiền mặt dự kiến trong két</span></div>
              <div className="text-4xl font-black">{money(current.expected_now)}</div>
              <div className="text-xs opacity-80 mt-1">Mở ca lúc {formatShiftTime(current.opened_at)}</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Tiền đầu ca</span><span className="font-bold">{money(current.opening_cash)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500 flex items-center gap-1"><TrendingUp className="w-4 h-4 text-emerald-500" />Thu tiền mặt trong ca</span><span className="font-bold text-emerald-600">+ {money(current.cash_sales)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500 flex items-center gap-1"><TrendingDown className="w-4 h-4 text-rose-500" />Chi/hoàn tiền mặt</span><span className="font-bold text-rose-600">− {money(current.cash_out)}</span></div>
              <div className="border-t border-slate-100 pt-3 flex justify-between"><span className="font-bold text-slate-700">Dự kiến</span><span className="font-black text-slate-800">{money(current.expected_now)}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-fit">
            <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2"><LogOut className="w-5 h-5 text-rose-500" /> Chốt ca</h2>
            <p className="text-sm text-slate-500 mb-4">Đếm tiền thực tế trong két rồi nhập vào đây.</p>
            <label className="block text-sm font-bold text-slate-700 mb-1">Tiền thực tế đếm được</label>
            <input type="number" min="0" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="Đếm tiền trong két..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl outline-none focus:border-rose-500 mb-3" />

            {lechDuKien !== null && (
              <div className={`rounded-xl p-4 mb-3 flex items-center justify-between ${lechDuKien === 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                <span className="font-bold text-slate-600">Chênh lệch</span>
                <span className={`text-xl font-black ${lechDuKien === 0 ? 'text-emerald-600' : lechDuKien > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                  {lechDuKien === 0 ? 'Khớp ✓' : (lechDuKien > 0 ? 'Thừa ' : 'Thiếu ') + money(Math.abs(lechDuKien))}
                </span>
              </div>
            )}

            <label className="block text-sm font-bold text-slate-700 mb-1">Ghi chú</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: thiếu do bồi thường..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-rose-500 mb-4" />

            <button onClick={chotCa} className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 flex items-center justify-center gap-2">
              <LogOut className="w-5 h-5" /> Chốt ca & Đóng két
            </button>
          </div>
        </div>
      )}

      {history.filter((s) => s.status === 'closed').length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mt-8 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 font-bold text-slate-700">Lịch sử ca đã chốt</div>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Mở ca</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Đầu ca</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Thu TM</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Dự kiến</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Thực đếm</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Lệch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.filter((s) => s.status === 'closed').map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 px-4 text-slate-500">{formatShiftTime(s.opened_at)}</td>
                    <td className="py-2.5 px-4 text-right">{money(s.opening_cash)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-600">{money(s.cash_sales)}</td>
                    <td className="py-2.5 px-4 text-right">{money(s.expected_cash)}</td>
                    <td className="py-2.5 px-4 text-right font-bold">{money(s.closing_cash)}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${s.difference === 0 ? 'text-emerald-600' : s.difference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                      {s.difference === 0 ? 'Khớp' : (s.difference > 0 ? '+' : '−') + money(Math.abs(s.difference))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
