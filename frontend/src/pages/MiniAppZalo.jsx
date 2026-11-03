import React from 'react';
import { Smartphone, ShieldCheck, Zap } from 'lucide-react';

export default function MiniAppZalo() {
  return (
    <div className="p-8 max-w-5xl mx-auto h-full flex flex-col">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
            <Smartphone className="w-8 h-8 text-blue-500" /> MiniApp & Social Commerce
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Các kênh Zalo OA và Telegram Bot hiện chưa được kết nối production với POS.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl border-2 border-blue-100 p-8 shadow-[0_10px_40px_rgba(59,130,246,0.1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-10"></div>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-blue-500/30">Z</div>
            <div>
              <h2 className="text-2xl font-black text-slate-800">Zalo Mini App</h2>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-bold">Chưa tích hợp</span>
            </div>
          </div>
          <p className="text-slate-600 mb-6 leading-relaxed">AutoTax hiện chưa có webhook Zalo OA, link Mini App production hoặc QR cửa hàng thật từ backend.</p>
          <button type="button" disabled title="Chưa có webhook Zalo OA production" className="w-full bg-slate-100 text-slate-500 py-3 rounded-xl font-bold border border-slate-200 cursor-not-allowed flex items-center justify-center gap-2">
            <ShieldCheck className="w-5 h-5"/> Chưa có Webhook Zalo OA
          </button>
        </div>

        <div className="bg-white rounded-3xl border-2 border-cyan-100 p-8 shadow-[0_10px_40px_rgba(6,182,212,0.1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50 rounded-bl-full -z-10"></div>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-cyan-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-cyan-500/30">T</div>
            <div>
              <h2 className="text-2xl font-black text-slate-800">Telegram Bot</h2>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-full font-bold">Chưa tích hợp</span>
            </div>
          </div>
          <p className="text-slate-600 mb-6 leading-relaxed">AutoTax hiện chưa có Telegram bot runtime để nhận tin nhắn, hiển thị menu hoặc tạo đơn vào POS.</p>
          <button type="button" disabled title="Chưa có Telegram bot runtime production" className="w-full bg-slate-100 text-slate-500 py-3 rounded-xl font-bold border border-slate-200 cursor-not-allowed flex items-center justify-center gap-2">
            <Zap className="w-5 h-5"/> Chưa có Telegram Bot Runtime
          </button>
        </div>
      </div>
    </div>
  );
}
