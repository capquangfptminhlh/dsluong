import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const phone = `09${String(12345678).padStart(8, '0')}`;
const password = `AuditUi${2026}${String.fromCharCode(33)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await response.text();
  let data = body;
  try { data = body ? JSON.parse(body) : null; } catch {}
  return { response, data };
}

async function registerTestOwner() {
  await sleep(1200);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { response, data } = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'AutoTax Audit', phone, password, sector: 'retail' }),
    });
    if (response.ok) return data;
    if (response.status === 409) {
      const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
      if (login.response.ok) return login.data;
    }
    if (attempt === 3) throw new Error(`Không tạo được tài khoản smoke: HTTP ${response.status} ${JSON.stringify(data)}`);
    await sleep(800);
  }
  throw new Error('Không tạo được tài khoản smoke');
}

const ROUTES = [
  '/app', '/app/overview', '/app/products', '/app/products/categories', '/app/products/barcode',
  '/app/products/pricing', '/app/products/bom', '/app/products/combos', '/app/products/serials', '/app/products/units',
  '/app/pos', '/app/pos/orders', '/app/pos/returns', '/app/pos/shift', '/app/pos/payments',
  '/app/purchase', '/app/suppliers', '/app/supplier-orders', '/app/branches', '/app/inventory',
  '/app/inventory/in', '/app/inventory/out', '/app/inventory/transfer', '/app/inventory/check', '/app/inventory/batches',
  '/app/customers', '/app/customers/crm', '/app/customers/loyalty', '/app/customers/care', '/app/finance',
  '/app/finance/cashbook', '/app/finance/debt', '/app/reports', '/app/report', '/app/audit', '/app/guide',
  '/app/staff', '/app/staff/commissions', '/app/rooms', '/app/appointments', '/app/promotions',
  '/app/settings', '/app/settings/backup', '/app/settings/audit', '/app/settings/automation',
  '/app/settings/omnichannel', '/app/settings/miniapp', '/app/settings/cloudflare', '/app/admin/users',
];
// Theme and shell regressions can hide on any route. Every authenticated route must render on mobile,
// not only the handful of primary navigation screens.
const MOBILE_ROUTES = ROUTES;

const auth = await registerTestOwner();
if (!auth?.token) throw new Error('Smoke auth không trả token');

const profile = await request('/api/auth/profile', { headers: { Authorization: `Bearer ${auth.token}` } });
if (!profile.response.ok) throw new Error(`Profile smoke lỗi HTTP ${profile.response.status}`);

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('industry_type', user.sector || 'retail');
}, auth.token, auth.user);

const failures = [];
let pageErrors = [];
let apiErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  const url = response.url();
  if (url.startsWith(`${BASE}/api/`) && response.status() >= 500) {
    apiErrors.push(`${response.status()} ${url.slice(BASE.length)}`);
  }
});

for (const asset of ['/sw.js', '/manifest.webmanifest']) {
  const result = await request(asset);
  if (!result.response.ok) failures.push(`${asset}: missing PWA asset HTTP ${result.response.status}`);
}

function resetRouteErrors() {
  pageErrors = [];
  apiErrors = [];
}

function recordRuntimeFailures(route, body) {
  if (pageErrors.length) failures.push(`${route}: pageerror ${[...new Set(pageErrors)].join(' | ')}`);
  if (apiErrors.length) failures.push(`${route}: API ${[...new Set(apiErrors)].join(' | ')}`);
  if (body.includes('Màn hình này gặp sự cố')) failures.push(`${route}: ErrorBoundary activated`);
  if (body.trim().length < 20) failures.push(`${route}: empty UI`);
}

await page.goto(`${BASE}/app/overview`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await sleep(450);
await page.evaluate(() => window.alert('Đã lưu thành công'));
try {
  await page.waitForSelector('.autotax-toast', { timeout: 1500 });
  const toastText = await page.$eval('.autotax-toast', (node) => node.textContent || '');
  if (!toastText.includes('Đã lưu thành công')) failures.push('/app/overview: legacy alert bridge did not preserve message');
} catch {
  failures.push('/app/overview: toast did not appear from legacy alert bridge');
}
if (!(await page.$('.autotax-notification-bell'))) failures.push('/app/overview: phone notification control missing');

try {
  await page.click('a[href="/app/pos"]');
  await page.waitForSelector('[data-autotax-loader="true"]', { timeout: 700 });
  await sleep(700);
  if (!new URL(page.url()).pathname.startsWith('/app/pos')) failures.push('/app/overview -> /app/pos: client navigation failed');
} catch (error) {
  failures.push(`/app/overview -> /app/pos: branded route loader missing (${error.message})`);
}

for (const route of ROUTES) {
  resetRouteErrors();
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(550);
  const body = await page.evaluate(() => document.body?.innerText || '');
  if (!response || response.status() >= 500) failures.push(`${route}: document HTTP ${response?.status() || 'no-response'}`);
  recordRuntimeFailures(route, body);
  console.log(`[SMOKE] ${route} ${failures.some((item) => item.startsWith(`${route}:`)) ? 'FAIL' : 'OK'}`);
}

// Audit output-invoice interaction smoke: create one paid POS order, open audit workbench,
// verify the missing-output row exposes the link action and its modal without runtime/API 5xx.
try {
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` };
  await request('/api/auth/profile', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ name: 'AutoTax Audit', taxCode: 'UI-AUDIT-001' }),
  });
  const productRes = await request('/api/products', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ name: 'UI Audit Product', sku: `UI-AUDIT-${Date.now()}`, price: 12000, cost_price: 6000, stock: 3, category: 'Audit' }),
  });
  if (!productRes.response.ok || !productRes.data?.id) {
    failures.push(`/app/audit interaction: product setup failed HTTP ${productRes.response.status}`);
  } else {
    const checkoutRes = await request('/api/pos/checkout', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ cart: [{ id: productRes.data.id, name: 'UI Audit Product', quantity: 1 }], payment_method: 'cash', paid_cash: 12000, paid_bank: 0, vat_rate: 0 }),
    });
    if (!checkoutRes.response.ok) failures.push(`/app/audit interaction: checkout setup failed HTTP ${checkoutRes.response.status}`);
    await request('/api/audit-compliance/sales-reconciliation/run', { method: 'POST', headers: authHeaders, body: '{}' });
    resetRouteErrors();
    await page.goto(`${BASE}/app/audit`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(800);
    const auditSection = await page.$('[data-testid="sales-reconciliation"]');
    if (!auditSection) failures.push('/app/audit interaction: sales reconciliation section missing');
    const buttons = await page.$$('button');
    let targetButton = null;
    for (const button of buttons) {
      const label = await page.evaluate((node) => (node.textContent || '').trim(), button);
      const box = await button.boundingBox();
      if (label.includes('Gắn hóa đơn') && box && box.width > 0 && box.height > 0) { targetButton = button; break; }
    }
    if (!targetButton) {
      failures.push('/app/audit interaction: missing visible output-invoice link action');
    } else {
      await targetButton.click();
      await sleep(250);
      const dialog = await page.$('[role="dialog"][aria-label="Gắn hóa đơn đầu ra"]');
      if (!dialog) failures.push('/app/audit interaction: output invoice dialog did not open');
      const dialogText = dialog ? await page.evaluate((node) => node.innerText || '', dialog) : '';
      if (dialog && !dialogText.includes('Ghi nhận & đối chiếu')) failures.push('/app/audit interaction: submit action missing in dialog');
      const dims = await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth }));
      if (dims.scroll > dims.viewport + 4) failures.push(`/app/audit interaction: horizontal overflow ${dims.scroll}px > ${dims.viewport}px`);
    }
    const body = await page.evaluate(() => document.body?.innerText || '');
    recordRuntimeFailures('/app/audit interaction', body);
  }
} catch (error) {
  failures.push(`/app/audit interaction: ${error.message}`);
}

for (const industry of ['retail', 'spa', 'fnb', 'hotel', 'petshop']) {
  await page.evaluate((value) => {
    localStorage.setItem('industry_type', value);
    window.dispatchEvent(new Event('industryChange'));
  }, industry);
  resetRouteErrors();
  await page.goto(`${BASE}/app/pos`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(600);
  const text = await page.evaluate(() => document.body?.innerText || '');
  recordRuntimeFailures(`/app/pos [${industry}]`, text);
  console.log(`[SMOKE] POS ${industry}`);
}

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
let mobileNavChecked = false;
for (const route of MOBILE_ROUTES) {
  resetRouteErrors();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(550);
  const layout = await page.evaluate(() => ({
    body: document.body?.innerText || '',
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    mobileNavCount: document.querySelectorAll('.autotax-mobile-bottom-nav .autotax-mobile-nav-item').length,
    mobileNavDisplay: document.querySelector('.autotax-mobile-bottom-nav') ? getComputedStyle(document.querySelector('.autotax-mobile-bottom-nav')).display : 'missing',
  }));
  recordRuntimeFailures(`${route} [mobile]`, layout.body);
  if (layout.scrollWidth > layout.viewportWidth + 4) {
    failures.push(`${route} [mobile]: global horizontal overflow ${layout.scrollWidth}px > ${layout.viewportWidth}px`);
  }
  if (!mobileNavChecked) {
    if (layout.mobileNavCount !== 5 || layout.mobileNavDisplay === 'none' || layout.mobileNavDisplay === 'missing') {
      failures.push(`${route} [mobile]: bottom navigation invalid (${layout.mobileNavCount} items, display=${layout.mobileNavDisplay})`);
    }
    mobileNavChecked = true;
  }
  console.log(`[SMOKE] MOBILE ${route}`);
}

await browser.close();

if (failures.length) {
  console.error('\nSMOKE FAILURES');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`\nSMOKE PASSED: ${ROUTES.length} routes + 5 POS modes + ${MOBILE_ROUTES.length} mobile routes; PWA + loader + toast + mobile nav; no API 5xx`);
