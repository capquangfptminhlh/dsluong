import { useEffect, useMemo, useState } from 'react';
import {
  applyPWAUpdate,
  getDeferredInstallPrompt,
  isStandalonePWA,
  promptPWAInstall,
} from '../pwa-client';

const DISMISS_KEY = 'autotax:pwa-install-dismissed-at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isIOSDevice() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function installWasDismissedRecently() {
  const value = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return value > 0 && Date.now() - value < DISMISS_MS;
}

export default function PWAStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installReady, setInstallReady] = useState(Boolean(getDeferredInstallPrompt()));
  const [updateReady, setUpdateReady] = useState(false);
  const [installed, setInstalled] = useState(isStandalonePWA());
  const [dismissed, setDismissed] = useState(installWasDismissedRecently());
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const ios = useMemo(() => isIOSDevice(), []);
  const mobile = useMemo(
    () => window.matchMedia?.('(max-width: 1024px)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
    [],
  );

  useEffect(() => {
    const onInstallReady = () => setInstallReady(true);
    const onInstalled = () => {
      setInstalled(true);
      setInstallReady(false);
      setShowIOSHelp(false);
    };
    const onUpdateReady = () => setUpdateReady(true);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('autotax:pwa-install-ready', onInstallReady);
    window.addEventListener('autotax:pwa-installed', onInstalled);
    window.addEventListener('autotax:pwa-update-ready', onUpdateReady);
    window.addEventListener('autotax:online', onOnline);
    window.addEventListener('autotax:offline', onOffline);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('autotax:pwa-install-ready', onInstallReady);
      window.removeEventListener('autotax:pwa-installed', onInstalled);
      window.removeEventListener('autotax:pwa-update-ready', onUpdateReady);
      window.removeEventListener('autotax:online', onOnline);
      window.removeEventListener('autotax:offline', onOffline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const dismissInstall = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    setShowIOSHelp(false);
  };

  const install = async () => {
    if (getDeferredInstallPrompt()) {
      const choice = await promptPWAInstall();
      if (choice?.outcome === 'accepted') setInstalled(true);
      return;
    }
    if (ios) setShowIOSHelp(true);
  };

  if (!online) {
    return (
      <div className="autotax-pwa-toast autotax-pwa-toast--offline" role="status">
        <span className="autotax-pwa-dot" />
        <div><strong>Đang offline</strong><small>Khung app vẫn mở được; dữ liệu trực tuyến sẽ hoạt động lại khi có mạng.</small></div>
      </div>
    );
  }

  if (updateReady) {
    return (
      <div className="autotax-pwa-toast" role="status">
        <div><strong>Có bản AutoTax mới</strong><small>Cập nhật ngay để dùng phiên bản mới nhất.</small></div>
        <button type="button" onClick={() => applyPWAUpdate()}>Cập nhật</button>
      </div>
    );
  }

  const canOfferInstall = mobile && !installed && !dismissed && (installReady || ios);
  if (!canOfferInstall) return null;

  return (
    <>
      <div className="autotax-pwa-toast autotax-pwa-toast--install" role="status">
        <img src="/autotax-pwa-v3.svg" alt="" aria-hidden="true" />
        <div><strong>Cài AutoTax vào điện thoại</strong><small>Mở nhanh như app, toàn màn hình và tải lại nhanh hơn.</small></div>
        <button type="button" onClick={install}>Cài app</button>
        <button type="button" className="autotax-pwa-close" onClick={dismissInstall} aria-label="Đóng">×</button>
      </div>

      {showIOSHelp && (
        <div className="autotax-pwa-sheet-backdrop" role="presentation" onClick={() => setShowIOSHelp(false)}>
          <section className="autotax-pwa-sheet" role="dialog" aria-modal="true" aria-label="Cài AutoTax trên iPhone" onClick={(event) => event.stopPropagation()}>
            <div className="autotax-pwa-sheet-handle" />
            <h2>Cài AutoTax trên iPhone</h2>
            <p>Trong Safari, bấm <strong>Chia sẻ</strong> → <strong>Thêm vào Màn hình chính</strong> → <strong>Thêm</strong>.</p>
            <button type="button" onClick={() => setShowIOSHelp(false)}>Đã hiểu</button>
          </section>
        </div>
      )}
    </>
  );
}
