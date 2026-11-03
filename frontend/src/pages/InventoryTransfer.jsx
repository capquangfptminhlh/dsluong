import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, MapPin, Send } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function InventoryTransfer() {
  const [code, setCode] = useState('TRF-' + Date.now().toString().slice(-5));
  const [fromBranch, setFromBranch] = useState('Chi nhánh 1 (Kho Tổng)');
  const [toBranch, setToBranch] = useState('Chi nhánh 2 (Quận 1)');
  const [transfers, setTransfers] = useState([]);

  useEffect(() => {
    fetchTransfers();
  }, []);

  const fetchTransfers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/inventory-adv/transfer`);
      setTransfers(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API_BASE}/api/inventory-adv/transfer`, { code, from_branch: fromBranch, to_branch: toBranch });
      alert('Đã gửi yêu cầu chuyển kho!');
      setCode('TRF-' + Date.now().toString().slice(-5));
      fetchTransfers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <ArrowRightLeft className="w-8 h-8 text-amber-500" /> Chuyển Kho Nội Bộ
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Điều chuyển hàng hóa giữa các chi nhánh hoặc các kho với nhau</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl p-6 border shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Tạo Phiếu Mới</h2>
          <div className="space-y-6 mb-8">
            <div className="p-4 border-2 border-slate-200 rounded-xl bg-slate-50 relative">
              <div className="absolute -top-3 left-4 bg-white px-2 font-bold text-slate-500 text-sm">Kho Xuất Hàng</div>
              <div className="flex items-center gap-3">
                <MapPin className="text-rose-500 w-5 h-5"/>
                <select value={fromBranch} onChange={e=>setFromBranch(e.target.value)} className="w-full bg-transparent font-bold text-slate-700 outline-none text-lg">
                  <option>Chi nhánh 1 (Kho Tổng)</option>
                  <option>Chi nhánh 2 (Quận 1)</option>
                </select>
              </div>
            </div>
            
            <div className="p-4 border-2 border-emerald-200 rounded-xl bg-emerald-50 relative">
              <div className="absolute -top-3 left-4 bg-white px-2 font-bold text-emerald-600 text-sm">Kho Nhận Hàng</div>
              <div className="flex items-center gap-3">
                <MapPin className="text-emerald-500 w-5 h-5"/>
                <select value={toBranch} onChange={e=>setToBranch(e.target.value)} className="w-full bg-transparent font-bold text-slate-700 outline-none text-lg">
                  <option>Chi nhánh 2 (Quận 1)</option>
                  <option>Chi nhánh 1 (Kho Tổng)</option>
                </select>
              </div>
            </div>
          </div>

          <button onClick={handleSave} className="w-full bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 transition-all">
            <Send className="w-6 h-6"/> Tạo Phiếu Chuyển Kho
          </button>
        </div>

        <div className="bg-white rounded-2xl p-6 border shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Lịch Sử Chuyển Kho</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-slate-500 text-sm">
                  <th className="pb-2">Mã Phiếu</th>
                  <th className="pb-2">Từ -&gt; Đến</th>
                  <th className="pb-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr><td colSpan="3" className="py-4 text-center text-slate-400">Chưa có lịch sử</td></tr>
                ) : (
                  transfers.map(t => (
                    <tr key={t.id} className="border-b border-slate-50">
                      <td className="py-3 font-bold">{t.code}</td>
                      <td className="py-3 text-sm">
                        <div className="text-rose-600 font-semibold">{t.from_branch}</div>
                        <div className="text-emerald-600 font-semibold">↓ {t.to_branch}</div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-bold">{t.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
