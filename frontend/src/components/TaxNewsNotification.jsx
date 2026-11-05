import React, { useState, useEffect, useRef } from 'react';
import { Bell, Newspaper, AlertTriangle, ExternalLink, Check, Info } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function TaxNewsNotification() {
  const [isOpen, setIsOpen] = useState(false);
  const [news, setNews] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const fetchNews = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/news`);
      const data = res.data || [];
      setNews(data);
      setUnreadCount(data.filter(n => !n.is_read).length);
    } catch {
      setNews([]);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 5 * 60 * 1000); // Check every 5 mins on frontend
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenDropdown = async () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      try {
        await axios.post(`${API_BASE}/api/news/read`);
        setUnreadCount(0);
        // Optimistically update UI
        setNews(prev => prev.map(n => ({ ...n, is_read: 1 })));
      } catch (err) {}
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={handleOpenDropdown}
        className={`p-2 transition-colors relative rounded-lg ${isOpen ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-indigo-600" />
              Bản tin Thuế (Thư Viện Pháp Luật)
            </h3>
            <span className="text-[10px] font-medium bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Live 24/7</span>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {news.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                Đang cập nhật tin tức mới...
              </div>
            ) : (
              news.map((item, idx) => (
                <a 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  key={item.id || idx} 
                  className={`block p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${!item.is_read ? 'bg-indigo-50/30' : ''}`}
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-1">
                      {item.is_important ? (
                        <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center" title="Phương pháp / Quy định mới!">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                          <Info className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className={`text-sm leading-tight ${item.is_important ? 'font-bold text-red-700' : 'font-semibold text-slate-800'}`}>
                          {item.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-2 leading-relaxed">
                        {item.snippet}
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-medium">
                        <span className="text-slate-400">{formatDate(item.pubDate)}</span>
                        <span className="text-indigo-500 flex items-center gap-1 hover:underline">
                          Xem chi tiết <ExternalLink className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
          
          <div className="p-2 border-t border-slate-200 bg-slate-50 text-center">
            <a href="https://thuvienphapluat.vn" target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-500 hover:text-indigo-600 font-medium">
              Nguồn: Thư Viện Pháp Luật
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
