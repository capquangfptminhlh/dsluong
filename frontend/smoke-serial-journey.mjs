import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3103';
const API = `${BASE}/api`;
const stamp = String(Date.now()).slice(-8);
const phone = `03${stamp}`.slice(0, 10);
const customerPhone = `08${stamp}`.slice(0, 10);
const productName = `Laptop Serial E2E ${stamp}`;
const sku = `SER-${stamp}`;
const serialA = `IMEI-A-${stamp}`;
const serialB = `IMEI-B-${stamp}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

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

function cashButtonReady() {
  const button = document.querySelector('button[data-testid="pos-cash-checkout"]');
  return Boolean(button && !button.disabled);
}

async function clickCash(page) {
  await page.waitForFunction(cashButtonReady, { timeout: 10000 });
  await page.click('button[data-testid="pos-cash-checkout"]');
}

const auth = await api('/auth/register', {
  method: 'POST',
  body: { phone, name: `Serial E2E ${stamp}`, password: 'SerialJourney2026!', sector: 'retail' },
  expected: 200,
});
const token = auth.data?.token;
assert(token, 'Register did not return token');

const created = await api('/products/with-variants', {
  token,
  method: 'POST',
  body: {
    name: productName,
    category: 'Laptop',
    warranty_months: 12,
    warranty_options: [{ months: 12, price: 500000 }, { months: 24, price: 550000 }],
    variants: [{ sku, price: 500000, cost_price: 300000, stock: 2, attributes: { 'Cấu hình': 'Mặc định' } }],
  },
  expected: 200,
});
const productId = Number(created.data?.product_id);
assert(productId > 0, 'Missing product id');

await api('/pd/serials', {
  token,
  method: 'POST',
  body: { product_id: productId, serials: `${serialA}\n${serialB}` },
  expected: 200,
});

const seededProduct = (await api('/products', { token, expected: 200 })).data.find((p) => Number(p.id) === productId);
assert(seededProduct, 'Seeded serial product missing');
assert(Number(seededProduct.track_serial) === 1, 'Adding serials must enable track_serial');
assert(Number(seededProduct.stock) >= 2, `Serial product stock must allow sale, got ${seededProduct.stock}`);

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1000 });
const pageErrors = [];
const apiErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.url().includes('/api/') && response.status() >= 400) apiErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(({ tokenValue, user }) => {
    localStorage.setItem('token', tokenValue);
    localStorage.setItem('user', JSON.stringify(user));
  }, { tokenValue: token, user: auth.data?.user || { phone, name: `Serial E2E ${stamp}` } });

  await page.goto(`${BASE}/app/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction((name) => document.body?.innerText?.includes(name), { timeout: 15000 }, productName);
  const clicked = await page.evaluate((name) => {
    const label = [...document.querySelectorAll('div')].find((node) => (node.textContent || '').trim() === name);
    const card = label?.closest('.cursor-pointer');
    if (!card) return false;
    card.click();
    return true;
  }, productName);
  assert(clicked, 'Could not add serial product to cart');

  await page.waitForFunction(() => document.body?.innerText?.includes('Serial / IMEI'), { timeout: 10000 });
  await page.waitForSelector('select[aria-label^="Serial 1 "]', { timeout: 10000 });
  const serialOptions = await page.$$eval('select[aria-label^="Serial 1 "] option', (options) => options.map((o) => o.value).filter(Boolean));
  assert(serialOptions.includes(serialA) && serialOptions.includes(serialB), `POS did not load both in-stock serials: ${serialOptions.join(', ')}`);

  const blocker = await page.$eval('[data-testid="pos-serial-blocker"]', (node) => node.textContent || '');
  assert(blocker.includes('Serial') || blocker.includes('IMEI'), `Missing inline Serial blocker: ${blocker}`);
  const cashDisabledBeforeSerial = await page.$eval('button[data-testid="pos-cash-checkout"]', (button) => button.disabled);
  assert(cashDisabledBeforeSerial, 'Cash checkout must stay disabled until required Serial/IMEI is selected');

  await page.select('select[aria-label^="Serial 1 "]', serialA);
  await page.waitForFunction((serial) => document.querySelector('select[aria-label^="Serial 1 "]')?.value === serial, {}, serialA);

  const phoneInput = await page.$('input[placeholder*="SĐT khách mới"]');
  assert(phoneInput, 'Customer phone input missing on POS');
  await phoneInput.click({ clickCount: 3 });
  await phoneInput.type(customerPhone);
  await page.waitForFunction(cashButtonReady, { timeout: 10000 });

  await clickCash(page);
  await page.waitForFunction(() => document.body?.innerText?.includes('Giao dịch thành công'), { timeout: 15000 });

  const orders = (await api('/pos', { token, expected: 200 })).data;
  const order = orders.find((row) => String(row.customer_phone || '') === customerPhone);
  assert(order?.id && order?.order_code, 'Completed serial order missing from order history');

  let serialRows = (await api(`/pd/serials?product_id=${productId}`, { token, expected: 200 })).data;
  const soldA = serialRows.find((row) => row.serial === serialA);
  const untouchedB = serialRows.find((row) => row.serial === serialB);
  assert(soldA?.status === 'sold' && soldA?.order_code === order.order_code, `Selected serial was not marked sold correctly: ${JSON.stringify(soldA)}`);
  assert(untouchedB?.status === 'in_stock', `Unselected serial must remain in_stock: ${JSON.stringify(untouchedB)}`);

  const warranties = (await api('/pd/warranties', { token, expected: 200 })).data;
  const warranty = warranties.find((row) => row.order_code === order.order_code && row.serial === serialA);
  assert(warranty && Number(warranty.months) === 12, `Warranty was not auto-created for selected serial: ${JSON.stringify(warranty)}`);

  await api(`/pos/${order.id}/cancel`, {
    token,
    method: 'POST',
    body: { cancel_reason: 'Serial E2E cancellation' },
    expected: 200,
  });
  serialRows = (await api(`/pd/serials?product_id=${productId}`, { token, expected: 200 })).data;
  const restoredA = serialRows.find((row) => row.serial === serialA);
  assert(restoredA?.status === 'in_stock', `Cancelling order must restore sold serial to in_stock: ${JSON.stringify(restoredA)}`);
  assert(!restoredA?.order_code, `Restored serial must clear order_code: ${JSON.stringify(restoredA)}`);

  const warrantiesAfterCancel = (await api('/pd/warranties', { token, expected: 200 })).data;
  assert(!warrantiesAfterCancel.some((row) => row.order_code === order.order_code), 'Cancelling serial order must delete its warranty');
  assert(pageErrors.length === 0, `Browser page errors: ${pageErrors.join(' | ')}`);
  assert(apiErrors.filter((entry) => !entry.includes('/api/pos/checkout')).length === 0, `Unexpected API errors in serial journey: ${apiErrors.join(' | ')}`);

  console.log('SERIAL CUSTOMER JOURNEY PASSED: POS lists in-stock serials -> blocks missing serial -> sale -> warranty -> cancel restores serial');
} finally {
  await browser.close();
}
