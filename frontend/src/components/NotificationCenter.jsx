import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BellRing, CheckCircle2, CircleAlert, Info, ShieldAlert, X } from 'lucide-react';
import { installLegacyAlertBridge, subscribeUiNotifications } from '../utils/uiEvents';

const PREF_KEY = 'autotax_phone_notifications';

function iconFor(type) {
  if (type === 'success') return CheckCircle2;
  if (type === 'error') return ShieldAlert;
  if (type === 'warning') return CircleAlert;
  return Info;
}

function colorFor(type) {
  if (type === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (type === 'error') return 'border-rose-200 bg-rose-50 text-rose-800';
  if (type === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

async function ensureServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch (error) {
    console.warn('AutoTax service worker unavailable', error);
    return null;
  }
}

async function showDeviceNotification(detail) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const enabled = localStorage.getItem(PREF_KEY) === '1';
  if (!enabled) return;

  const registration = await ensureServiceWorker();
  const options = {
    body: detail.message || 'AutoTax vừa hoàn tất một thao tác.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: detail.tag || 'autotax-update',
    renotify: true,
    data: { url: detail.url || '/app' },
  };

  if (registration?.showNotification) {
    await registration.showNotification(detail.title || 'AutoTax', options);
  } else {
    new Notification(detail.title || 'AutoTax', options);
  }
}

export function NotificationBell() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [enabled, setEnabled] = useState(() => supported && localStorage.getItem(PREF_KEY) === '1' && Notification.permission === 'granted');
  const [busy, setBusy] = useState(false);

  const label = useMemo(() => {
    if (!supported) return 'Thiết bị không hỗ trợ thông báo hệ thống';
    if (enabled) return 'Thông báo điện thoại đang bật';
    if (Notification.permission === 'denied') return 'Thông báo điện thoại đang bị chặn';
    return 'Bật thông báo điện thoại';
  }, [enabled, supported]);

  const toggle = async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      if (enabled) {
        localStorage.setItem(PREF_KEY, '0');
        setEnabled(false);
        return;
      }
      await ensureServiceWorker();
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem(PREF_KEY, '1');
        setEnabled(true);
        await showDeviceNotification({
          title: 'Đã bật thông báo AutoTax',
          message: 'Các sự kiện quan trọng sẽ hiển thị trên điện thoại của bạn.',
          tag: 'notifications-enabled',
          url: window.location.pathname,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={toggle} className={`autotax-notification-bell ${enabled ? 'is-enabled' : ''}`} title={label} aria-label={label}>
      {enabled ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
      {enabled && <span className="autotax-notification-dot" />}
    </button>
  );
}

export default function NotificationCenter() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    ensureServiceWorker();
    const uninstallAlertBridge = installLegacyAlertBridge();
    const unsubscribe = subscribeUiNotifications((detail) => {
      setToasts((current) => [...current.slice(-4), detail]);
      if (detail.device || detail.important || document.visibilityState !== 'visible') {
        showDeviceNotification(detail).catch((error) => console.warn('AutoTax device notification failed', error));
      }
      const timeout = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== detail.id));
      }, Number(detail.duration) || 4200);
      detail.__timeout = timeout;
    });

    return () => {
      unsubscribe();
      uninstallAlertBridge();
    };
  }, []);

  const dismiss = (id) => setToasts((current) => current.filter((toast) => toast.id !== id));

  return (
    <div className="autotax-toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => {
        const Icon = iconFor(toast.type);
        return (
          <div key={toast.id} className={`autotax-toast ${colorFor(toast.type)}`}>
            <div className="autotax-toast-icon"><Icon className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="autotax-toast-title">{toast.title}</div>
              {toast.message && <div className="autotax-toast-message">{toast.message}</div>}
            </div>
            <button type="button" onClick={() => dismiss(toast.id)} className="autotax-toast-close" aria-label="Đóng thông báo"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
