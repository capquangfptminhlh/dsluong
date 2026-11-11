import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Share, PlusSquare, Check, X, ShieldCheck } from 'lucide-react';

export default function PWAInstallPrompt({ variant = 'header' }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Kiểm tra xem ứng dụng đã chạy dưới dạng Standalone (đã cài đặt) hay chưa
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandalone(isStandaloneMode);

    // Phát hiện thiết bị iOS / Safari
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIOS(isIosDevice);

    // Bắt sự kiện beforeinstallprompt từ trình duyệt (Chrome, Edge, Samsung Internet, Android...)
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setDeferredPrompt(null);
      }
    } else if (isIOS && !isStandalone) {
      setShowIOSModal(true);
    } else {
      // Thông báo hướng dẫn chung nếu trình duyệt đã hỗ trợ
      alert(
        'Để cài đặt ứng dụng Nhà Thuốc Nhân Đức:\n' +
        '1. Trên Chrome / Cốc Cốc / Edge: Bấm biểu tượng Cài đặt trên thanh địa chỉ (hoặc Menu ⋮ -> Cài đặt ứng dụng)\n' +
        '2. Trên iPhone / Safari: Bấm nút Chia sẻ (Share) -> Chọn "Thêm vào Màn hình chính".'
      );
    }
  };

  // Đã cài đặt và đang chạy dạng App
  if (isStandalone) {
    if (variant === 'badge') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-full">
          <Check className="w-3 h-3 text-emerald-600" /> App GPP Native
        </span>
      );
    }
    return null;
  }

  return (
    <>
      {variant === 'header' ? (
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black rounded-xl shadow-sm shadow-emerald-600/30 transition-all hover:scale-105 shrink-0"
          title="Cài đặt Nhà Thuốc Nhân Đức thành ứng dụng trên điện thoại / máy tính"
        >
          <Smartphone className="w-3.5 h-3.5 animate-bounce" />
          <span className="hidden sm:inline">Cài Đặt App</span>
          <span className="sm:hidden">Cài App</span>
        </button>
      ) : (
        <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-800 text-xs">Cài đặt Ứng Dụng Nhân Đức GPP</div>
              <div className="text-[11px] text-slate-500">Mở toàn màn hình, chạy nhanh không cần gõ link</div>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shrink-0 shadow-sm shadow-emerald-600/20 transition-all"
          >
            Cài Ngay
          </button>
        </div>
      )}

      {/* Modal hướng dẫn cho iOS / Safari */}
      {showIOSModal && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="font-black text-slate-900 text-sm">Cài Đặt Lên iPhone / iPad</h3>
              </div>
              <button onClick={() => setShowIOSModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 py-4 text-xs text-slate-700">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                  1
                </div>
                <div>
                  Bấm vào nút <strong className="text-slate-900">Chia sẻ</strong> (biểu tượng{' '}
                  <Share className="w-3.5 h-3.5 inline text-blue-600" />) ở thanh công cụ dưới đáy Safari.
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                  2
                </div>
                <div>
                  Cuộn xuống và chọn <strong className="text-slate-900">"Thêm vào Màn hình chính"</strong> (hoặc{' '}
                  <span className="italic">Add to Home Screen</span>{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline text-slate-700" />
                  ).
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                  3
                </div>
                <div>
                  Bấm <strong className="text-emerald-700">"Thêm"</strong> (Add) ở góc trên bên phải. Biểu tượng App Nhân Đức GPP sẽ xuất hiện trên màn hình điện thoại!
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-colors"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </>
  );
}
