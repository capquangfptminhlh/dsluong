import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export default function HelpButton({ title, content }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block z-40">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        title="Hướng dẫn sử dụng"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-5 transform origin-top-right transition-all">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-500" />
                {title || 'Hướng dẫn'}
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
