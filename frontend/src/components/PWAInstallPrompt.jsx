import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share, PlusSquare, Check, X, ShieldCheck, Monitor, HelpCircle } from 'lucide-react';

export default function PWAInstallPrompt({ variant = 'header' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('android');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // 1. Kiểm tra xem app đang chạy standalone hay chưa
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandalone(isStandaloneMode);

    // 2. Phát hiện OS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isIosDevice);
    if (isIosDevice) {
      setActiveTab('ios');
    } else if (/windows|macintosh|linux/.test(ua) && !/android/.test(ua)) {
      setActiveTab('desktop');
    } else {
      setActiveTab('android');
    }

    // 3. Lắng nghe sự kiện cài đặt của Chromium
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.__pwaDeferredPrompt = e;
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setIsStandalone(true);
      window.__pwaDeferredPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async (e) => {
    if (e) e.stopPropagation();
    const prompt = deferredPrompt || window.__pwaDeferredPrompt;
    if (prompt) {
      try {
        prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstalled(true);
          setDeferredPrompt(null);
          window.__pwaDeferredPrompt = null;
          return;
        }
      } catch (err) {
        console.warn('PWA prompt error:', err);
      }
    }
    // Mở modal hướng dẫn chi tiết trực quan cho thiết bị
    setShowModal(true);
  };

  // Đang chạy dạng App đã cài đặt
  if (isStandalone || installed) {
    if (variant === 'badge') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
          <Check className="w-3 h-3 text-emerald-600" /> App GPP Đã Cài
        </span>
      );
    }
    if (variant === 'sidebar') {
      return (
        <div className="p-2.5 bg-emerald-50/80 border border-emerald-200/60 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-800">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Đang chạy chế độ App</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {/* 1. Header Variant */}
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-md shadow-emerald-600/25 transition-all hover:scale-105 shrink-0 animate-pulse"
          title="Cài đặt App Nhân Đức GPP lên thiết bị"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Cài Đặt App</span>
          <span className="sm:hidden">Cài App</span>
        </button>
      )}

      {/* 2. Sidebar Variant */}
      {variant === 'sidebar' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full p-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl shadow-lg shadow-emerald-600/30 transition-all hover:-translate-y-0.5 text-left flex items-center justify-between gap-2.5 group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Download className="w-4 h-4 text-white group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <div className="font-black text-xs leading-tight">Cài Đặt App</div>
              <div className="text-[10px] text-emerald-100 font-medium leading-tight">Mở nhanh trên màn hình</div>
            </div>
          </div>
          <span className="px-2 py-0.5 bg-white/20 text-[10px] font-black rounded-lg uppercase tracking-wider shrink-0">
            Tải Ngay
          </span>
        </button>
      )}

      {/* 3. Banner / Card Variant */}
      {variant === 'banner' && (
        <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-slate-800 text-sm">Cài đặt Ứng Dụng Nhân Đức GPP</div>
              <div className="text-xs text-slate-600 mt-0.5">Dùng toàn màn hình, mượt mà như app native, bán hàng siêu tốc</div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shrink-0 shadow-md shadow-emerald-600/20 transition-all"
          >
            Cài Đặt Miễn Phí
          </button>
        </div>
      )}

      {/* 4. Modal Hướng Dẫn Trực Quan 3 Nền Tảng */}
      {showModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Download className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-base leading-tight">Cài Đặt App Nhân Đức GPP</h3>
                  <p className="text-xs text-emerald-100">Cài đặt 1 chạm không cần qua App Store</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`flex-1 py-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'android'
                    ? 'border-emerald-600 text-emerald-700 bg-white'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-4 h-4" /> Android / Cốc Cốc
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`flex-1 py-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'ios'
                    ? 'border-emerald-600 text-emerald-700 bg-white'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-4 h-4" /> iPhone / iPad
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('desktop')}
                className={`flex-1 py-3 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'desktop'
                    ? 'border-emerald-600 text-emerald-700 bg-white'
                    : 'border-transparent hover:text-slate-900'
                }`}
              >
                <Monitor className="w-4 h-4" /> Máy Tính
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6 text-xs text-slate-700 space-y-4">
              {activeTab === 'android' && (
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      Bấm nút <strong className="text-slate-900">"Thử Kích Hoạt Cài Đặt"</strong> bên dưới. Nếu trình duyệt hiện popup, chọn <strong>"Cài đặt"</strong>.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      Nếu chưa thấy popup: Bấm vào <strong className="text-slate-900">Menu 3 chấm (⋮)</strong> ở góc trên bên phải trình duyệt Chrome / Cốc Cốc.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      Chọn <strong className="text-emerald-700">"Cài đặt ứng dụng"</strong> hoặc <strong className="text-emerald-700">"Thêm vào Màn hình chính"</strong>.
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ios' && (
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      Mở trang web bằng trình duyệt <strong className="text-slate-900">Safari</strong> trên iPhone / iPad.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      Bấm vào nút <strong className="text-slate-900">Chia sẻ</strong> (biểu tượng hình vuông có mũi tên lên <Share className="w-3.5 h-3.5 inline text-blue-600" />) ở thanh dưới cùng.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      Cuộn xuống chọn <strong className="text-slate-900">"Thêm vào MH chính"</strong> (Add to Home Screen <PlusSquare className="w-3.5 h-3.5 inline text-slate-700" />) rồi bấm <strong>"Thêm"</strong>.
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'desktop' && (
                <div className="space-y-3.5">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      Nhìn lên <strong className="text-slate-900">Thanh địa chỉ URL</strong> ở đầu trình duyệt Chrome / Edge.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      Bấm vào biểu tượng <strong className="text-emerald-700">Cài đặt (⊕ hoặc màn hình có mũi tên ↓)</strong> ở góc phải thanh địa chỉ.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      Bấm <strong className="text-emerald-700">"Cài đặt"</strong> — Ứng dụng sẽ hoạt động trong cửa sổ độc lập như một app desktop native!
                    </div>
                  </div>
                </div>
              )}

              {deferredPrompt && (
                <button
                  type="button"
                  onClick={async () => {
                    setShowModal(false);
                    deferredPrompt.prompt();
                    const choice = await deferredPrompt.userChoice;
                    if (choice.outcome === 'accepted') {
                      setInstalled(true);
                      setDeferredPrompt(null);
                    }
                  }}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Bấm Để Cài Đặt Trực Tiếp Ngay
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
              >
                Đã Hiểu & Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
