import React, { useState } from 'react';
import { ShoppingCart, Scissors, Home, Cat } from 'lucide-react';
import RetailPOS from './RetailPOS';
import SpaPOS from './SpaPOS';
import HotelPOS from './HotelPOS';

export default function PetShopPOS() {
  const [activeTab, setActiveTab] = useState('retail'); // 'retail' | 'grooming' | 'hotel'

  return (
    <div className="h-full flex flex-col bg-slate-50">
      
      {/* Top Header / Tab Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Cat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800">Pet Shop POS</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hệ thống Siêu Tích Hợp</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <button 
            onClick={() => setActiveTab('retail')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'retail' 
                ? 'bg-white text-indigo-700 shadow-md shadow-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> Bán Hàng
          </button>
          
          <button 
            onClick={() => setActiveTab('grooming')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'grooming' 
                ? 'bg-white text-rose-600 shadow-md shadow-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <Scissors className="w-4 h-4" /> Grooming & Spa
          </button>

          <button 
            onClick={() => setActiveTab('hotel')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'hotel' 
                ? 'bg-white text-cyan-600 shadow-md shadow-slate-200/50' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
            }`}
          >
            <Home className="w-4 h-4" /> Lưu chuồng
          </button>
        </div>
        
        <div className="w-[200px]"></div> {/* spacer for centering */}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'retail' && (
          <div className="absolute inset-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <RetailPOS />
          </div>
        )}
        
        {activeTab === 'grooming' && (
          <div className="absolute inset-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
             {/* Instead of modifying SpaPOS to know it's a petshop, we just reuse it. It looks generic enough! */}
            <SpaPOS />
          </div>
        )}

        {activeTab === 'hotel' && (
          <div className="absolute inset-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <HotelPOS />
          </div>
        )}
      </div>

    </div>
  );
}
