import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const API = `${BASE}/api`;
const PHONE = '0933333303';
const PASSWORD = 'BarcodeAudit2026!';

async function api(path, { method = 'GET', token, body, expected = [200] } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!expected.includes(response.status)) throw new Error(`${method} ${path}: HTTP ${response.status}: ${text}`);
  return data;
}

let auth;
try {
  auth = await api('/auth/register', { method: 'POST', body: { phone: PHONE, name: 'Barcode Audit', password: PASSWORD, sector: 'retail' } });
} catch {
  auth = await api('/auth/login', { method: 'POST', body: { phone: PHONE, password: PASSWORD } });
}
if (!auth?.token) throw new Error('Barcode smoke missing auth token');

const sku = `SCAN-${Date.now()}`;
const created = await api('/products', {
  method: 'POST', token: auth.token,
  body: { name: 'Sản phẩm quét camera', sku, barcode: sku, price: 88000, cost_price: 50000, stock: 9, category: 'Audit' },
});
if (!created?.id) throw new Error('Barcode smoke product creation failed');

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--unsafely-treat-insecure-origin-as-secure=http://127.0.0.1:3001',
  ],
});
const page = await browser.newPage();
page.on('pageerror', (error) => { throw error; });
await page.evaluateOnNewDocument((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('industry_type', 'retail');
}, auth.token, auth.user);

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.goto(`${BASE}/app/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('[data-testid="pos-open-barcode-scanner"]', { timeout: 10000 });
await page.click('[data-testid="pos-open-barcode-scanner"]');
await page.waitForSelector('[data-testid="barcode-scanner-modal"]', { timeout: 5000 });
await page.waitForFunction(() => document.querySelector('[data-testid="barcode-reader"]')?.dataset?.cameraStatus === 'scanning', { timeout: 12000 });

const camera = await page.$eval('[data-testid="barcode-video"]', (video) => {
  const stream = video.srcObject;
  const track = stream?.getVideoTracks?.()[0];
  return {
    state: document.querySelector('[data-testid="barcode-reader"]')?.dataset?.cameraStatus || '',
    readyState: video.readyState,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    hasStream: !!stream,
    trackState: track?.readyState || '',
  };
});
if (camera.state !== 'scanning') throw new Error(`Camera must be scanning, got ${camera.state}`);
if (!camera.hasStream || camera.trackState !== 'live') throw new Error(`Camera stream is not live: ${JSON.stringify(camera)}`);
if (camera.readyState < 2 || camera.videoWidth <= 0 || camera.videoHeight <= 0) throw new Error(`Camera video did not render frames: ${JSON.stringify(camera)}`);

await page.type('[data-testid="barcode-manual-input"]', sku);
await page.click('[data-testid="barcode-manual-submit"]');
await page.waitForFunction((name) => document.body.innerText.includes(name) && !document.querySelector('[data-testid="barcode-scanner-modal"]'), {}, 'Sản phẩm quét camera');
const posText = await page.evaluate(() => document.body.innerText);
if (!posText.includes('Sản phẩm quét camera')) throw new Error('Manual barcode path did not add product to POS cart');
if (await page.$('[data-testid="barcode-video"]')) throw new Error('Camera video remained mounted after scanner closed');

await page.goto(`${BASE}/app/inventory/check`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('[data-testid="inventory-check-code"]', { timeout: 10000 });
await page.type('[data-testid="inventory-check-code"]', sku);
await page.click('[data-testid="inventory-check-add"]');
await page.waitForFunction((name) => document.querySelector('[data-testid="inventory-counted-list"]')?.innerText.includes(name), {}, 'Sản phẩm quét camera');
const countedText = await page.$eval('[data-testid="inventory-counted-list"]', (node) => node.innerText);
if (!countedText.includes('Tồn hệ thống') || !countedText.includes('Đếm thực tế')) throw new Error('Inventory check scan row missing count controls');

await page.click('[data-testid="inventory-open-barcode-scanner"]');
await page.waitForSelector('[data-testid="barcode-scanner-modal"]', { timeout: 5000 });
await page.waitForFunction(() => document.querySelector('[data-testid="barcode-reader"]')?.dataset?.cameraStatus === 'scanning', { timeout: 12000 });
await page.type('[data-testid="barcode-manual-input"]', sku);
await page.click('[data-testid="barcode-manual-submit"]');
await page.waitForFunction(() => !document.querySelector('[data-testid="barcode-scanner-modal"]'));
const actualValue = await page.$eval('[data-testid="inventory-counted-list"] input[type="number"]', (node) => Number(node.value));
if (actualValue !== 2) throw new Error(`Repeated inventory scan should increment actual count to 2, got ${actualValue}`);

await browser.close();
console.log(`BARCODE SMOKE PASSED: live video ${camera.videoWidth}x${camera.videoHeight} + cleanup + POS/inventory fallback`);
