import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const OUT = path.resolve('visual-artifacts');
await fs.mkdir(OUT, { recursive: true });

const loginResponse = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0912345678', password: 'AuditUi2026!' }),
});
if (!loginResponse.ok) throw new Error(`Visual login failed: HTTP ${loginResponse.status}`);
const auth = await loginResponse.json();

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:3001',
  ],
});
const page = await browser.newPage();
page.on('pageerror', (error) => { throw error; });

await page.evaluateOnNewDocument((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('industry_type', user.sector || 'retail');
}, auth.token, auth.user);

async function capture(name, route, viewport, fullPage = true) {
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!response || response.status() >= 500) throw new Error(`${route}: document HTTP ${response?.status()}`);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const state = await page.evaluate(() => ({
    text: document.body?.innerText || '',
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (state.text.includes('Màn hình này gặp sự cố')) throw new Error(`${route}: error boundary visible`);
  if (state.scrollWidth > state.width + 4) throw new Error(`${route}: horizontal overflow ${state.scrollWidth}>${state.width}`);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  console.log(`[VISUAL] ${name} captured`);
}

async function assertDashboardHoverContrast() {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const response = await page.goto(`${BASE}/app`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!response || response.status() >= 500) throw new Error(`/app: document HTTP ${response?.status()}`);
  await page.waitForSelector('[data-route="/app"]', { timeout: 10000 });
  const found = await page.evaluate(() => {
    const target = [...document.querySelectorAll('a[href="/app/pos"]')]
      .find((link) => (link.textContent || '').includes('Tạo đơn bán'));
    if (!target) return false;
    target.setAttribute('data-visual-hover-target', 'true');
    return true;
  });
  if (!found) throw new Error('Dashboard hover visual: quick action target missing');
  await page.hover('[data-visual-hover-target="true"]');
  await new Promise((resolve) => setTimeout(resolve, 120));
  const metrics = await page.evaluate(() => {
    const target = document.querySelector('[data-visual-hover-target="true"]');
    const label = target?.querySelector('span');
    const parse = (value) => {
      const numbers = String(value || '').match(/[\d.]+/g)?.map(Number) || [];
      return numbers.slice(0, 3);
    };
    const luminance = (rgb) => {
      const channels = rgb.map((value) => {
        const normalized = value / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const background = parse(getComputedStyle(target).backgroundColor);
    const foreground = parse(getComputedStyle(label || target).color);
    const lighter = Math.max(luminance(background), luminance(foreground));
    const darker = Math.min(luminance(background), luminance(foreground));
    return {
      background: getComputedStyle(target).backgroundColor,
      foreground: getComputedStyle(label || target).color,
      contrast: (lighter + 0.05) / (darker + 0.05),
    };
  });
  if (!Number.isFinite(metrics.contrast) || metrics.contrast < 4.5) {
    throw new Error(`Dashboard hover visual: insufficient label contrast ${JSON.stringify(metrics)}`);
  }
  console.log(`[VISUAL] dashboard hover contrast ${metrics.contrast.toFixed(2)}:1`);
}

async function capturePosDesktop() {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const response = await page.goto(`${BASE}/app/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!response || response.status() >= 500) throw new Error(`/app/pos: document HTTP ${response?.status()}`);
  await page.waitForSelector('[data-route="/app/pos"]', { timeout: 10000 });

  const prepared = await page.evaluate(() => {
    const route = document.querySelector('[data-route="/app/pos"]');
    const root = route?.firstElementChild;
    const allButton = [...(root?.querySelectorAll('button') || [])].find((button) => button.textContent?.trim() === 'Tất cả');
    const strip = allButton?.parentElement;
    if (!root || !strip) return false;
    for (let index = 0; index < 18; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Danh mục kiểm tra chiều rộng rất dài ${index + 1}`;
      button.style.whiteSpace = 'nowrap';
      button.style.padding = '8px 20px';
      strip.appendChild(button);
    }
    return true;
  });
  if (!prepared) throw new Error('POS desktop visual: could not prepare category width stress');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const metrics = await page.evaluate(() => {
    const route = document.querySelector('[data-route="/app/pos"]');
    const root = route?.firstElementChild;
    const left = [...(root?.children || [])].find((element) => element.classList.contains('flex-1'));
    const cart = [...(root?.children || [])].find((element) => element.classList.contains('shrink-0') && element.classList.contains('w-full'));
    const allButton = [...(left?.querySelectorAll('button') || [])].find((button) => button.textContent?.trim() === 'Tất cả');
    const strip = allButton?.parentElement;
    const rootRect = root?.getBoundingClientRect();
    const leftRect = left?.getBoundingClientRect();
    const cartRect = cart?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      rootWidth: rootRect?.width || 0,
      leftWidth: leftRect?.width || 0,
      leftRight: leftRect?.right || 0,
      cartWidth: cartRect?.width || 0,
      cartLeft: cartRect?.left || 0,
      cartRight: cartRect?.right || 0,
      stripClientWidth: strip?.clientWidth || 0,
      stripScrollWidth: strip?.scrollWidth || 0,
    };
  });

  if (!metrics.rootWidth || !metrics.leftWidth || !metrics.cartWidth) {
    throw new Error(`POS desktop visual: missing layout pane ${JSON.stringify(metrics)}`);
  }
  if (metrics.documentScrollWidth > metrics.viewportWidth + 4) {
    throw new Error(`POS desktop visual: page overflow ${JSON.stringify(metrics)}`);
  }
  if (metrics.cartRight > metrics.viewportWidth + 2 || metrics.cartLeft >= metrics.viewportWidth - 20) {
    throw new Error(`POS desktop visual: cart pushed off-screen ${JSON.stringify(metrics)}`);
  }
  if (metrics.leftRight > metrics.cartLeft + 3) {
    throw new Error(`POS desktop visual: products overlap cart ${JSON.stringify(metrics)}`);
  }
  if (metrics.stripScrollWidth <= metrics.stripClientWidth + 100) {
    throw new Error(`POS desktop visual: category stress did not produce internal scroll ${JSON.stringify(metrics)}`);
  }

  await page.screenshot({ path: path.join(OUT, 'pos-desktop-1440.png'), fullPage: false });
  console.log(`[VISUAL] pos-desktop-1440 captured (left ${Math.round(metrics.leftWidth)}px, cart ${Math.round(metrics.cartWidth)}px, category scroll ${metrics.stripScrollWidth}px)`);
}

async function captureBarcodeScanner() {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const response = await page.goto(`${BASE}/app/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!response || response.status() >= 500) throw new Error(`/app/pos: document HTTP ${response?.status()}`);
  await page.waitForSelector('[data-testid="pos-open-barcode-scanner"]', { timeout: 10000 });
  await page.click('[data-testid="pos-open-barcode-scanner"]');
  await page.waitForSelector('[data-testid="barcode-scanner-modal"]', { timeout: 5000 });
  await page.waitForFunction(() => {
    const reader = document.querySelector('[data-testid="barcode-reader"]');
    const video = document.querySelector('[data-testid="barcode-video"]');
    const stream = video?.srcObject;
    const track = stream?.getVideoTracks?.()[0];
    return reader?.dataset?.cameraStatus === 'scanning'
      && track?.readyState === 'live'
      && video.readyState >= 2
      && video.videoWidth > 0
      && video.videoHeight > 0;
  }, { timeout: 12000 });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const metrics = await page.evaluate(() => {
    const video = document.querySelector('[data-testid="barcode-video"]');
    const stream = video?.srcObject;
    const track = stream?.getVideoTracks?.()[0];
    return {
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      modal: Boolean(document.querySelector('[data-testid="barcode-scanner-modal"]')),
      status: document.querySelector('[data-testid="barcode-reader"]')?.dataset?.cameraStatus || '',
      videoWidth: video?.videoWidth || 0,
      videoHeight: video?.videoHeight || 0,
      trackState: track?.readyState || '',
    };
  });
  if (!metrics.modal) throw new Error('Barcode visual: scanner modal missing');
  if (metrics.status !== 'scanning' || metrics.trackState !== 'live' || !metrics.videoWidth || !metrics.videoHeight) {
    throw new Error(`Barcode visual: camera not live ${JSON.stringify(metrics)}`);
  }
  if (metrics.scrollWidth > metrics.width + 4) throw new Error(`Barcode visual horizontal overflow ${metrics.scrollWidth}>${metrics.width}`);
  await page.screenshot({ path: path.join(OUT, 'barcode-scanner-mobile-390.png'), fullPage: false });
  console.log(`[VISUAL] barcode-scanner-mobile-390 captured (${metrics.status}, ${metrics.videoWidth}x${metrics.videoHeight})`);
}

await capture('homepage-desktop', '/', { width: 1440, height: 1000 });
await capture('homepage-mobile-360', '/', { width: 360, height: 800 });
await capture('homepage-mobile-430', '/', { width: 430, height: 932 });
await capture('dashboard-desktop', '/app', { width: 1440, height: 1000 });
await assertDashboardHoverContrast();
await capture('tax-control-desktop', '/app/report', { width: 1440, height: 1000 });
await capture('finance-desktop', '/app/finance', { width: 1440, height: 1000 });
await capturePosDesktop();
await capture('dashboard-mobile-360', '/app', { width: 360, height: 800 });
await capture('products-mobile-360', '/app/products', { width: 360, height: 800 });
await capture('inventory-mobile-390', '/app/inventory', { width: 390, height: 844 });
await capture('pos-mobile-390', '/app/pos', { width: 390, height: 844 });
await captureBarcodeScanner();
await capture('finance-mobile-390', '/app/finance', { width: 390, height: 844 });
await capture('settings-mobile-430', '/app/settings', { width: 430, height: 932 });

await browser.close();
