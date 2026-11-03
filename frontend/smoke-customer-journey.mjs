import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3103';
const API = `${BASE}/api`;
const stamp = String(Date.now()).slice(-7);
const ownerPhone = `09${stamp.padStart(8, '0').slice(-8)}`;
const ownerPassword = 'CustomerJourney2026!';
const rootName = `Điện lạnh E2E ${stamp}`;
const childName = `Tủ lạnh E2E ${stamp}`;
const uiProductName = `Tủ lạnh UI ${stamp}`;
const variantProductName = `Tủ lạnh Variant ${stamp}`;
const customerName = `Khách E2E ${stamp}`;
const customerUpdatedName = `${customerName} Updated`;
const customerPhone = `08${stamp.padStart(8, '1').slice(-8)}`;
const customerUpdatedPhone = `07${stamp.padStart(8, '2').slice(-8)}`;
const customerAddress = `12 Nguyễn Huệ E2E ${stamp}`;
const customerUpdatedAddress = `88 Lê Lợi E2E ${stamp}`;
const quickCustomerName = `Khách nhanh ${stamp}`;
const quickCustomerPhone = `06${stamp.padStart(8, '3').slice(-8)}`;
const quickCustomerAddress = `99 Trần Hưng Đạo E2E ${stamp}`;
const artifactsDir = new URL('./journey-artifacts/', import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function api(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (expected !== undefined) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

async function waitForText(page, text, timeout = 10000) {
  await page.waitForFunction((needle) => document.body?.innerText?.includes(needle), { timeout }, text);
}

async function clickText(page, text, selector = 'button', timeout = 10000) {
  await page.waitForFunction((needle, css) => {
    const nodes = [...document.querySelectorAll(css)];
    return nodes.some((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (node.textContent || '').trim().includes(needle);
    });
  }, { timeout }, text, selector);
  const clicked = await page.evaluate((needle, css) => {
    const node = [...document.querySelectorAll(css)].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (candidate.textContent || '').trim().includes(needle);
    });
    if (!node) return false;
    node.click();
    return true;
  }, text, selector);
  assert(clicked, `Không click được "${text}"`);
  await sleep(120);
}

async function setControlValue(page, element, value) {
  await page.evaluate((node, nextValue) => {
    const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (!setter) throw new Error('Không tìm thấy native value setter');
    setter.call(node, String(nextValue));
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, element, String(value));
  await sleep(80);
}

async function replaceInput(page, selector, value, index = 0) {
  const handles = await page.$$(selector);
  const handle = handles[index];
  assert(handle, `Không tìm thấy input ${selector}[${index}]`);
  await setControlValue(page, handle, value);
}

async function replaceLabeled(page, labelText, value, controlSelector = 'input, textarea') {
  const control = await page.evaluateHandle((needle, css) => {
    const labels = [...document.querySelectorAll('label')];
    const label = labels.find((node) => (node.textContent || '').trim().includes(needle));
    if (!label) return null;
    if (label.matches(css)) return label;
    return label.querySelector(css) || label.parentElement?.querySelector(css) || null;
  }, labelText, controlSelector);
  const element = control.asElement();
  assert(element, `Không tìm thấy control của label "${labelText}"`);
  await setControlValue(page, element, value);
  await control.dispose();
}

async function selectByOptionText(page, optionNeedle, desiredNeedle) {
  const result = await page.evaluate(({ anchor, desired }) => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const select = [...document.querySelectorAll('select')].find((node) => visible(node)
      && [...node.options].some((option) => (option.textContent || '').includes(anchor)));
    if (!select) return { ok: false, reason: `select:${anchor}` };
    const option = [...select.options].find((item) => (item.textContent || '').includes(desired));
    if (!option) return { ok: false, reason: `option:${desired}`, options: [...select.options].map((item) => item.textContent) };
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: option.value, text: option.textContent };
  }, { anchor: optionNeedle, desired: desiredNeedle });
  assert(result.ok, `Không chọn được ${desiredNeedle}: ${JSON.stringify(result)}`);
  await sleep(180);
  return result;
}

async function clickProductCard(page, productName) {
  const clicked = await page.evaluate((name) => {
    const label = [...document.querySelectorAll('div')].find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (node.textContent || '').trim() === name;
    });
    if (!label) return false;
    let node = label;
    while (node && node !== document.body) {
      if (String(node.className || '').includes('cursor-pointer')) {
        node.click();
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }, productName);
  assert(clicked, `Không click được card sản phẩm ${productName}`);
  await sleep(180);
}

async function selectCartOption(page, ariaPrefix, productName, optionIndex) {
  const result = await page.evaluate(({ prefix, name, index }) => {
    const select = [...document.querySelectorAll('select')].find((node) => (node.getAttribute('aria-label') || '') === `${prefix} ${name}`);
    if (!select) return { ok: false, reason: 'missing-select' };
    const option = select.options[index];
    if (!option) return { ok: false, reason: 'missing-option', count: select.options.length };
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: option.value, text: option.textContent };
  }, { prefix: ariaPrefix, name: productName, index: optionIndex });
  assert(result.ok, `Không chọn được ${ariaPrefix} #${optionIndex}: ${JSON.stringify(result)}`);
  await sleep(160);
  return result;
}

const registration = await api('/auth/register', {
  method: 'POST',
  body: { phone: ownerPhone, name: `E2E Owner ${stamp}`, password: ownerPassword, sector: 'retail' },
  expected: 200,
});
assert(registration.data?.token, 'Đăng ký E2E không trả token');
const token = registration.data.token;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
const pageErrors = [];
const api5xx = [];
const dialogs = [];
let stage = 'bootstrap';
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  if (response.url().startsWith(API) && response.status() >= 500) api5xx.push(`${response.status()} ${response.url()}`);
});
page.on('dialog', async (dialog) => {
  dialogs.push(dialog.message());
  await dialog.accept();
});

try {
  stage = 'login';
  // 1) Login exactly like a store owner.
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 30000 });
  await replaceInput(page, 'input[type="tel"]', ownerPhone);
  await replaceInput(page, 'input[type="password"]', ownerPassword);
  await clickText(page, 'Đăng nhập');
  await page.waitForFunction(() => location.pathname.startsWith('/app'), { timeout: 10000 });

  stage = 'categories';
  // 2) Master data: root category -> child category, persisted in backend.
  await page.goto(`${BASE}/app/products/categories`, { waitUntil: 'networkidle0', timeout: 30000 });
  await clickText(page, 'Thêm nhóm lớn');
  await replaceLabeled(page, 'Tên nhóm lớn', rootName);
  await clickText(page, 'Tạo mục');
  await waitForText(page, rootName);
  const openedChild = await page.evaluate((name) => {
    const section = [...document.querySelectorAll('section')].find((node) => (node.textContent || '').includes(name));
    const button = section && [...section.querySelectorAll('button')].find((node) => (node.textContent || '').includes('Danh mục con'));
    if (!button) return false;
    button.click();
    return true;
  }, rootName);
  assert(openedChild, 'Không mở được form danh mục con');
  await replaceLabeled(page, 'Tên danh mục con', childName);
  await clickText(page, 'Tạo mục');
  await waitForText(page, childName);
  const categoryRows = (await api('/categories', { token })).data;
  const root = categoryRows.find((row) => row.name === rootName);
  const child = categoryRows.find((row) => row.name === childName);
  assert(root && child && Number(child.parent_id) === Number(root.id), 'Nhóm lớn/danh mục con không lưu đúng quan hệ');

  stage = 'product-create';
  // 3) Add a normal product from the UI and verify persisted category/stock/price.
  await page.goto(`${BASE}/app/products`, { waitUntil: 'networkidle0', timeout: 30000 });
  await clickText(page, 'Thêm Sản Phẩm');
  await replaceLabeled(page, 'Tên sản phẩm', uiProductName);
  await replaceLabeled(page, 'Mã SKU', `UI-${stamp}`);
  await selectByOptionText(page, 'Chọn nhóm lớn', rootName);
  await page.waitForFunction((name) => [...document.querySelectorAll('option')].some((option) => (option.textContent || '').includes(name)), { timeout: 5000 }, childName);
  await selectByOptionText(page, 'Chọn danh mục', childName);
  await replaceInput(page, 'input[data-money-input="retail-price"]', '25000000');
  await replaceInput(page, 'input[data-money-input="cost-price"]', '20000000');
  await replaceLabeled(page, 'Tồn kho', '5');
  await clickText(page, 'Lưu Hệ Thống');
  await waitForText(page, uiProductName);
  const productsAfterUi = (await api('/products', { token })).data;
  const uiProduct = productsAfterUi.find((row) => row.name === uiProductName);
  assert(uiProduct, 'Sản phẩm tạo từ UI không tồn tại');
  assert(String(uiProduct.category) === childName, `Sản phẩm lưu sai danh mục: ${uiProduct.category}`);
  assert(Number(uiProduct.stock) === 5, `Sản phẩm lưu sai tồn: ${uiProduct.stock}`);

  // Seed a 2-variant + 2-warranty product for the cashier journey.
  const variantCreate = await api('/products/with-variants', {
    token,
    method: 'POST',
    body: {
      name: variantProductName,
      category: childName,
      warranty_months: 12,
      warranty_options: [
        { months: 12, price: 1200000 },
        { months: 24, price: 1350000 },
      ],
      variants: [
        { sku: `VAR-A-${stamp}`, price: 1000000, cost_price: 700000, stock: 6, attributes: { 'Phiên bản': 'A' } },
        { sku: `VAR-B-${stamp}`, price: 1100000, cost_price: 750000, stock: 4, attributes: { 'Phiên bản': 'B' } },
      ],
    },
    expected: 200,
  });
  const variantProductId = Number(variantCreate.data?.product_id);
  assert(variantProductId > 0, 'Không tạo được sản phẩm biến thể E2E');

  stage = 'crm-edit';
  // 4) CRM: add -> open -> edit name/phone/note -> persist.
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'networkidle0', timeout: 30000 });
  await clickText(page, 'Thêm Khách Hàng');
  await replaceInput(page, 'input[placeholder="Tên khách hàng"]', customerName);
  await replaceInput(page, 'input[placeholder="Số điện thoại"]', customerPhone);
  await replaceInput(page, 'input[placeholder="Địa chỉ (tuỳ chọn)"]', customerAddress);
  await replaceInput(page, 'input[placeholder="Thẻ ghi chú (tuỳ chọn)"]', 'Khách test hành trình');
  await clickText(page, 'Lưu khách hàng');
  await waitForText(page, customerName);
  const selected = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('tr, button')].find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (node.textContent || '').includes(name);
    });
    if (!row) return false;
    row.click();
    return true;
  }, customerName);
  assert(selected, 'Không mở được chi tiết khách hàng vừa tạo');
  await clickText(page, 'Sửa');
  await replaceLabeled(page, 'Tên khách hàng', customerUpdatedName);
  await replaceLabeled(page, 'Số điện thoại', customerUpdatedPhone);
  await replaceLabeled(page, 'Địa chỉ', customerUpdatedAddress, 'textarea');
  await replaceLabeled(page, 'Ghi chú / thẻ khách hàng', 'Đã sửa từ E2E', 'textarea');
  await clickText(page, 'Lưu thay đổi');
  await waitForText(page, customerUpdatedName);
  const customersAfterEdit = (await api('/customers', { token })).data;
  const savedCustomer = customersAfterEdit.find((row) => row.name === customerUpdatedName);
  assert(savedCustomer?.phone === customerUpdatedPhone, `CRM sửa khách không persist đúng: ${JSON.stringify(savedCustomer)}`);
  assert(savedCustomer?.address === customerUpdatedAddress, `CRM không lưu địa chỉ sau chỉnh sửa: ${JSON.stringify(savedCustomer)}`);
  assert(String(savedCustomer?.tags || '').includes('Đã sửa'), 'CRM không lưu ghi chú sau chỉnh sửa');

  stage = 'pos-customer';
  // 5) POS quick-customer + select saved customer.
  await page.goto(`${BASE}/app/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('button[aria-label="Tạo khách hàng mới"]', { timeout: 10000 });
  await page.click('button[aria-label="Tạo khách hàng mới"]');
  await replaceInput(page, 'input[placeholder="Ví dụ: Anh Minh"]', quickCustomerName);
  await replaceInput(page, 'input[placeholder="Nhập số điện thoại"]', quickCustomerPhone);
  await replaceInput(page, 'textarea[placeholder="Địa chỉ khách hàng (tuỳ chọn)"]', quickCustomerAddress);
  await clickText(page, 'Lưu khách');
  const quickSelected = await page.$eval('select[aria-label="Chọn khách hàng đã lưu"]', (node) => node.value);
  assert(quickSelected === quickCustomerPhone, `Khách tạo nhanh không tự chọn: ${quickSelected}`);
  const quickCustomerSaved = (await api('/customers', { token })).data.find((row) => row.phone === quickCustomerPhone);
  assert(quickCustomerSaved?.address === quickCustomerAddress, `Khách tạo nhanh không lưu địa chỉ: ${JSON.stringify(quickCustomerSaved)}`);
  await selectByOptionText(page, 'Khách lẻ / Chọn khách đã lưu', customerUpdatedName);
  const persistedSelected = await page.$eval('select[aria-label="Chọn khách hàng đã lưu"]', (node) => node.value);
  assert(persistedSelected === customerUpdatedPhone, `Không chọn được khách CRM trong POS: ${persistedSelected}`);

  stage = 'pos-multiline';
  // 6) Add same product as two distinct variants and assert every line stays independent.
  await replaceInput(page, 'input[placeholder^="Tìm tên / quét mã vạch"]', variantProductName);
  await waitForText(page, variantProductName);
  await clickProductCard(page, variantProductName);
  await page.waitForSelector(`select[aria-label="Phân loại ${variantProductName}"]`, { timeout: 5000 });
  const variantB = await selectCartOption(page, 'Phân loại', variantProductName, 1);
  assert(String(variantB.text).includes('B'), `Không chuyển được dòng đầu sang biến thể B: ${JSON.stringify(variantB)}`);
  await clickProductCard(page, variantProductName); // adds default A as another line
  await page.waitForFunction((name) => document.querySelectorAll(`input[aria-label="Số lượng ${CSS.escape(name)}"]`).length === 2, { timeout: 5000 }, variantProductName).catch(async () => {
    const count = await page.evaluate((name) => [...document.querySelectorAll('input')].filter((node) => node.getAttribute('aria-label') === `Số lượng ${name}`).length, variantProductName);
    throw new Error(`Cần 2 dòng phân loại trong giỏ, thực tế ${count}`);
  });

  const qtyInputs = await page.$$(`input[aria-label="Số lượng ${variantProductName}"]`);
  assert(qtyInputs.length === 2, `Cần 2 input số lượng, có ${qtyInputs.length}`);
  await setControlValue(page, qtyInputs[0], '3');
  await sleep(180);
  const quantities = await page.$$eval(`input[aria-label="Số lượng ${variantProductName}"]`, (nodes) => nodes.map((node) => Number(node.value)));
  assert(quantities[0] === 3 && quantities[1] === 1, `Sửa SL một phân loại làm ảnh hưởng dòng khác: ${JSON.stringify(quantities)}`);

  const priceInputs = await page.$$(`input[aria-label="Giá bán ${variantProductName}"]`);
  assert(priceInputs.length === 2, `Cần 2 input giá bán, có ${priceInputs.length}`);
  await setControlValue(page, priceInputs[0], '1250000');
  await sleep(160);
  const prices = await page.$$eval(`input[aria-label="Giá bán ${variantProductName}"]`, (nodes) => nodes.map((node) => Number(node.value)));
  assert(prices[0] === 1250000 && prices[1] === 1200000, `Sửa giá một phân loại làm ảnh hưởng dòng khác: ${JSON.stringify(prices)}`);

  const warrantySelects = await page.$$(`select[aria-label="Gói bảo hành ${variantProductName}"]`);
  assert(warrantySelects.length === 2, `Cần 2 select bảo hành, có ${warrantySelects.length}`);
  await warrantySelects[0].select(await warrantySelects[0].evaluate((node) => node.options[1].value));
  await sleep(160);
  const warrantyValues = await page.$$eval(`select[aria-label="Gói bảo hành ${variantProductName}"]`, (nodes) => nodes.map((node) => Number(node.value)));
  assert(warrantyValues[0] === 24 && warrantyValues[1] === 12, `Đổi bảo hành một phân loại làm ảnh hưởng dòng khác: ${JSON.stringify(warrantyValues)}`);

  stage = 'checkout';
  // 7) Checkout and verify order, warranty, customer history and exact variant inventory movement.
  await page.waitForFunction(() => {
    const button = document.querySelector('button[data-testid="pos-cash-checkout"]');
    return button && !button.disabled;
  }, { timeout: 10000 });
  await page.click('button[data-testid="pos-cash-checkout"]');
  await waitForText(page, 'Giao dịch thành công', 15000);
  const receiptText = await page.$eval('#receipt-content', (node) => node.innerText || '');
  assert(receiptText.includes(customerUpdatedName), 'Hóa đơn không mang khách đã chọn');
  const orderCodeMatch = receiptText.match(/DH[A-Z0-9]+/);
  assert(orderCodeMatch, `Không tìm thấy mã đơn trên hóa đơn: ${receiptText}`);
  const orderCode = orderCodeMatch[0];

  const orders = (await api(`/customers/${savedCustomer.id}/orders`, { token })).data;
  const order = orders.find((row) => row.order_code === orderCode);
  assert(order, `CRM không liên kết đơn ${orderCode} về khách`);

  const productsAfterSale = (await api('/products', { token })).data;
  const soldProduct = productsAfterSale.find((row) => Number(row.id) === variantProductId);
  assert(soldProduct, 'Không tải lại được sản phẩm biến thể sau bán');
  const soldVariants = Array.isArray(soldProduct.variants) ? soldProduct.variants : [];
  const stockA = Number(soldVariants.find((variant) => String(variant.sku) === `VAR-A-${stamp}`)?.stock);
  const stockB = Number(soldVariants.find((variant) => String(variant.sku) === `VAR-B-${stamp}`)?.stock);
  assert(stockA === 5 && stockB === 1, `Tồn biến thể sai sau bán A=1, B=3: A=${stockA}, B=${stockB}`);
  assert(Number(soldProduct.stock) === 6, `Tồn tổng sai sau bán 4 SP: ${soldProduct.stock}`);

  const warrantyRows = (await api('/pd/warranties', { token })).data;
  const orderWarranties = warrantyRows.filter((row) => row.order_code === orderCode);
  assert(orderWarranties.length >= 2, `Không tự tạo đủ bảo hành theo các dòng đơn: ${JSON.stringify(orderWarranties)}`);
  assert(orderWarranties.some((row) => Number(row.months) === 24) && orderWarranties.some((row) => Number(row.months) === 12), 'Bảo hành không giữ thời hạn riêng từng dòng');

  const pnlAfterSale=(await api('/finance/pnl',{token})).data;
  assert(Number(pnlAfterSale.net_revenue)>0,`P&L thiếu doanh thu thuần: ${JSON.stringify(pnlAfterSale)}`);
  assert(Number(pnlAfterSale.cost_of_goods)>0,`P&L thiếu giá vốn: ${JSON.stringify(pnlAfterSale)}`);
  assert(Math.abs(Number(pnlAfterSale.gross_profit)-(Number(pnlAfterSale.net_revenue)-Number(pnlAfterSale.cost_of_goods)))<1,`P&L sai lợi nhuận gộp: ${JSON.stringify(pnlAfterSale)}`);
  assert(Math.abs(Number(pnlAfterSale.net_profit)-(Number(pnlAfterSale.gross_profit)+Number(pnlAfterSale.other_income||0)-Number(pnlAfterSale.operating_expense||0)))<1,`P&L sai lãi/lỗ ròng: ${JSON.stringify(pnlAfterSale)}`);

  stage = 'post-sale-history';
  // 8) UI order + CRM history remain reachable after transaction.
  await clickText(page, 'Đóng');
  await page.goto(`${BASE}/app/pos/orders`, { waitUntil: 'networkidle0', timeout: 30000 });
  await waitForText(page, orderCode, 10000);
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'networkidle0', timeout: 30000 });
  await waitForText(page, customerUpdatedName, 10000);
  const reopen = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('tr, button')].find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (node.textContent || '').includes(name);
    });
    if (!row) return false;
    row.click();
    return true;
  }, customerUpdatedName);
  assert(reopen, 'Không mở lại được khách sau bán');
  await waitForText(page, orderCode, 10000);

  stage = 'mobile-critical-routes';
  // 9) Mobile reality check on critical screens: no global horizontal overflow and primary actions visible.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  for (const route of ['/app/pos', '/app/customers', '/app/products/categories', '/app/products', '/app/pos/orders', '/app/inventory']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(450);
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      html: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      text: document.body?.innerText || '',
    }));
    assert(layout.html <= layout.width + 4 && layout.body <= layout.width + 4, `${route} mobile bị tràn ngang: ${JSON.stringify(layout)}`);
    assert(layout.text.trim().length > 30 && !layout.text.includes('Màn hình này gặp sự cố'), `${route} mobile lỗi/blank`);
  }

  assert(pageErrors.length === 0, `Browser pageerror: ${[...new Set(pageErrors)].join(' | ')}`);
  assert(api5xx.length === 0, `API 5xx trong hành trình: ${[...new Set(api5xx)].join(' | ')}`);
  console.log('CUSTOMER JOURNEY E2E PASSED: login -> category hierarchy -> product -> CRM edit -> POS quick customer -> multi-variant line independence -> warranty -> checkout -> stock -> orders -> CRM -> mobile');
} catch (error) {
  await fs.mkdir(artifactsDir, { recursive: true });
  await page.screenshot({ path: new URL(`customer-journey-failure-${stamp}.png`, artifactsDir).pathname, fullPage: true }).catch(() => {});
  console.error(`CUSTOMER JOURNEY E2E FAILED at ${stage}:`, error.message);
  if (dialogs.length) console.error('Dialogs:', dialogs.join(' | '));
  if (pageErrors.length) console.error('Page errors:', [...new Set(pageErrors)].join(' | '));
  if (api5xx.length) console.error('API 5xx:', [...new Set(api5xx)].join(' | '));
  process.exitCode = 1;
} finally {
  await browser.close();
}
