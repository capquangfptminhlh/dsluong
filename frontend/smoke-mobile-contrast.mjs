import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
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

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0912345678', password: 'AuditUi2026!' }),
});
if (!login.ok) throw new Error(`Contrast smoke login failed HTTP ${login.status}`);
const auth = await login.json();

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.evaluateOnNewDocument((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('industry_type', 'retail');
}, auth.token, auth.user);

const failures = [];
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((resolve) => setTimeout(resolve, 350));
  const result = await page.evaluate(() => {
    const parse = (value) => {
      const m = String(value || '').match(/rgba?\(([^)]+)\)/i);
      if (!m) return null;
      const p = m[1].split(',').map((x) => Number.parseFloat(x.trim()));
      return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: Number.isFinite(p[3]) ? p[3] : 1 };
    };
    const mix = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const background = (el) => {
      const chain = [];
      let node = el;
      while (node && node.nodeType === 1) {
        chain.unshift(node);
        node = node.parentElement;
      }
      let out = { r: 8, g: 12, b: 17, a: 1 };
      for (const item of chain) {
        const c = parse(getComputedStyle(item).backgroundColor);
        if (c && c.a > 0) out = mix(c, out);
      }
      return out;
    };
    const luminance = (c) => {
      const channel = (x) => {
        const v = x / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    };
    const ratio = (a, b) => {
      const l1 = luminance(a); const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const bad = [];
    for (const el of document.querySelectorAll('.autotax-page-enter *')) {
      if (['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(el.tagName)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > innerHeight * 3) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.45) continue;
      const directText = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent.trim()).join(' ').trim();
      if (!directText) continue;
      const fgRaw = parse(style.color);
      if (!fgRaw || fgRaw.a < 0.5) continue;
      const bg = background(el);
      const fg = fgRaw.a < 1 ? mix(fgRaw, bg) : fgRaw;
      const cr = ratio(fg, bg);
      // 3:1 is a hard visibility floor. This catches accidental light-on-light/dark-on-dark
      // theme collisions while allowing branded white text on the orange primary action.
      if (cr < 3) {
        bad.push({ text: directText.slice(0, 70), ratio: Number(cr.toFixed(2)), color: style.color, background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, cls: String(el.className || '').slice(0, 100) });
      }
    }
    return bad.slice(0, 12);
  });
  if (result.length) failures.push(`${route}: ${JSON.stringify(result)}`);
  console.log(`[CONTRAST MOBILE] ${route} ${result.length ? 'FAIL' : 'OK'}`);
}

await browser.close();
if (failures.length) {
  console.error('\nMOBILE CONTRAST FAILURES');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`MOBILE CONTRAST PASSED: ${ROUTES.length}/${ROUTES.length} authenticated routes have no severe text/background collision`);
