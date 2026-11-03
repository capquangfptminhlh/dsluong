import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0912345678', password: 'AuditUi2026!' }),
});
if (!login.ok) throw new Error(`Route loader smoke login failed HTTP ${login.status}`);
const auth = await login.json();

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (error) => { throw error; });
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('industry_type', 'retail');
}, auth.token, auth.user);

await page.goto(`${BASE}/app`, { waitUntil: 'networkidle0', timeout: 30000 });

async function clickRoute(path) {
  const selector = `a[href="${path}"]`;
  await page.waitForSelector(selector, { timeout: 5000 });
  await page.$eval(selector, (node) => node.click());
  await page.waitForFunction((expected) => window.location.pathname === expected, { timeout: 5000 }, path);
  await page.waitForFunction(() => !document.querySelector('.autotax-route-loader-overlay'), { timeout: 2500 });
  const state = await page.evaluate(() => ({
    path: window.location.pathname,
    text: document.body?.innerText || '',
    overlay: Boolean(document.querySelector('.autotax-route-loader-overlay')),
  }));
  if (state.overlay) throw new Error(`${path}: loader overlay still visible`);
  if (state.text.includes('Màn hình này gặp sự cố')) throw new Error(`${path}: error boundary visible`);
  console.log(`[ROUTE LOADER] ${path} settled`);
}

// Exercise repeated real anchor clicks. The old bug cancelled its own hide timer
// after routeLoading became true, causing the first overlay to block later clicks.
for (const path of ['/app/products', '/app/pos', '/app/pos/orders', '/app/overview']) {
  await clickRoute(path);
}

// Mobile bottom-navigation clicks must also remain usable after repeated routing.
await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 1 });
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle0', timeout: 30000 });
for (const path of ['/app/pos', '/app/pos/orders', '/app/inventory', '/app/overview']) {
  await clickRoute(path);
}

await browser.close();
console.log('ROUTE LOADER SMOKE PASSED: repeated desktop + mobile clicks settle and remain interactive');
