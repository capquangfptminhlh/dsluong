let deferredInstallPrompt = null;
let registration = null;
let refreshing = false;
let updateTimer = null;
let updateWindowStartedAt = 0;
let hiddenAt = 0;

const AUTO_APPLY_WINDOW_MS = 30 * 1000;
const RESUME_REFRESH_AFTER_MS = 60 * 1000;
const UPDATE_POLL_MS = 5 * 60 * 1000;

const emit = (name, detail = {}) => {
  window.dispatchEvent(new CustomEvent(name, { detail }));
};

const withinAutoApplyWindow = () => Date.now() - updateWindowStartedAt <= AUTO_APPLY_WINDOW_MS;

const activateWorker = (worker) => {
  if (!worker) return false;
  worker.postMessage({ type: 'SKIP_WAITING' });
  return true;
};

export function isStandalonePWA() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function getPWARegistration() {
  return registration;
}

export async function promptPWAInstall() {
  if (!deferredInstallPrompt) return { outcome: 'unavailable' };
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  emit('autotax:pwa-install-result', choice);
  return choice;
}

export async function applyPWAUpdate() {
  const current = registration || await navigator.serviceWorker?.getRegistration?.('/');
  if (!current) return false;
  if (current.waiting) return activateWorker(current.waiting);
  await current.update();
  if (current.waiting) return activateWorker(current.waiting);
  return false;
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Persistence is a best-effort enhancement only.
  }
}

export async function registerAutoTaxPWA() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    emit('autotax:pwa-install-ready');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    requestPersistentStorage();
    emit('autotax:pwa-installed');
  });

  window.addEventListener('online', () => emit('autotax:online'));
  window.addEventListener('offline', () => emit('autotax:offline'));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  try {
    updateWindowStartedAt = Date.now();
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    // If a previous session already downloaded an update, activate it as soon as
    // the POS/PWA is opened again instead of leaving the cashier on stale UI.
    if (registration.waiting) {
      emit('autotax:pwa-update-ready', { registration });
      activateWorker(registration.waiting);
    }

    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          emit('autotax:pwa-update-ready', { registration });
          // Auto-apply only during app startup/resume. This avoids an unexpected
          // reload in the middle of a long-running cashier transaction.
          if (withinAutoApplyWindow()) activateWorker(worker);
        }
      });
    });

    if (isStandalonePWA()) requestPersistentStorage();

    const refreshRegistration = () => registration?.update().catch(() => null);

    refreshRegistration();
    updateTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshRegistration();
    }, UPDATE_POLL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      if (hiddenAt && Date.now() - hiddenAt >= RESUME_REFRESH_AFTER_MS) {
        updateWindowStartedAt = Date.now();
      }
      hiddenAt = 0;
      refreshRegistration();
    });

    window.addEventListener('pageshow', () => {
      updateWindowStartedAt = Date.now();
      refreshRegistration();
    });

    return registration;
  } catch (error) {
    console.warn('[AutoTax PWA] service worker registration failed', error);
    return null;
  }
}

export function stopPWAUpdatePolling() {
  if (updateTimer) window.clearInterval(updateTimer);
  updateTimer = null;
}
