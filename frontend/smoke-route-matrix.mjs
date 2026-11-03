import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3103';
const API = `${BASE}/api`;
const stamp = String(Date.now()).slice(-8);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const allowed = expected === undefined ? null : (Array.isArray(expected) ? expected : [expected]);
  if (allowed) assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  else assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  return { status: response.status, data };
}

const auth = await api('/auth/register', {
  method: 'POST',
  body: { phone: `09${stamp}`.slice(0, 10), name: `Route Matrix ${stamp}`, password: 'RouteMatrix2026!', sector: 'retail' },
  expected: 200,
});
const token = auth.data?.token;
assert(token, 'Route matrix registration missing token');

const routes = [
  '/app/overview', '/app/products', '/app/products/categories', '/app/products/barcode',
  '/app/products/pricing', '/app/products/bom', '/app/products/combos', '/app/products/serials',
  '/app/products/units', '/app/pos', '/app/pos/orders', '/app/pos/returns', '/app/pos/shift',
  '/app/pos/payments', '/app/purchase', '/app/suppliers', '/app/supplier-orders', '/app/branches',
  '/app/inventory', '/app/inventory/in', '/app/inventory/out', '/app/inventory/transfer',
  '/app/inventory/check', '/app/inventory/batches', '/app/customers', '/app/customers/crm',
  '/app/customers/loyalty', '/app/customers/care', '/app/finance', '/app/finance/cashbook',
  '/app/finance/debt', '/app/reports', '/app/report', '/app/audit', '/app/guide', '/app/staff',
  '/app/staff/commissions', '/app/rooms', '/app/appointments', '/app/promotions', '/app/settings',
  '/app/settings/audit', '/app/settings/automation', '/app/settings/omnichannel', '/app/settings/miniapp',
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
const pageErrors = [];
const api5xx = [];
let activeRoute = '';
page.on('pageerror', (error) => pageErrors.push(`${activeRoute}: ${error.message}`));
page.on('response', (response) => {
  if (response.url().includes('/api/') && response.status() >= 500) {
    api5xx.push(`${activeRoute}: ${response.status()} ${response.request().method()} ${response.url()}`);
  }
});

async function establishSession() {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ tokenValue, user }) => {
    localStorage.setItem('token', tokenValue);
    localStorage.setItem('user', JSON.stringify(user));
  }, { tokenValue: token, user: auth.data?.user || { name: `Route Matrix ${stamp}` } });
}

async function checkRoute(route, mobile) {
  activeRoute = `${route}${mobile ? ' [mobile]' : ' [desktop]'}`;
  await page.setViewport(mobile
    ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
    : { width: 1440, height: 1000, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert(response && response.status() < 500, `${activeRoute}: document HTTP ${response?.status()}`);
  await page.waitForFunction((expected) => {
    if (location.pathname.includes('/login')) return true;
    const mounted = document.querySelector('[data-route]');
    return location.pathname === expected && Boolean(mounted);
  }, { timeout: 8000 }, route);
  await sleep(120);
  const state = await page.evaluate(() => ({
    pathname: location.pathname,
    text: document.body?.innerText || '',
    htmlWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body?.scrollWidth || 0,
    viewport: innerWidth,
  }));
  assert(!state.pathname.includes('/login'), `${activeRoute}: unexpectedly redirected to login`);
  assert(state.text.trim().length >= 20, `${activeRoute}: blank/near-blank screen`);
  assert(!state.text.includes('Màn hình này gặp sự cố'), `${activeRoute}: global error boundary rendered`);
  assert(!state.text.includes('Something went wrong'), `${activeRoute}: generic crash rendered`);
  if (mobile) {
    assert(state.htmlWidth <= state.viewport + 6 && state.bodyWidth <= state.viewport + 6,
      `${activeRoute}: horizontal overflow viewport=${state.viewport}, html=${state.htmlWidth}, body=${state.bodyWidth}`);
  }
}

try {
  await establishSession();
  const failures = [];
  for (const mobile of [false, true]) {
    for (const route of routes) {
      try {
        await checkRoute(route, mobile);
      } catch (error) {
        failures.push(`${activeRoute}: ${error.message}`);
      }
    }
  }

  const uniquePageErrors = [...new Set(pageErrors)];
  const uniqueApi5xx = [...new Set(api5xx)];
  if (uniquePageErrors.length) failures.push(`PAGEERRORS:\n${uniquePageErrors.join('\n')}`);
  if (uniqueApi5xx.length) failures.push(`API5XX:\n${uniqueApi5xx.join('\n')}`);
  assert(failures.length === 0, `Route matrix failures (${failures.length}):\n${failures.join('\n')}`);
  console.log(`ROUTE MATRIX PASSED: ${routes.length} routes x desktop/mobile = ${routes.length * 2} screens`);
} finally {
  await browser.close();
}
