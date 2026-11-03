import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0912345678', password: 'AuditUi2026!' }),
});
if (!login.ok) throw new Error(`Layout smoke login failed HTTP ${login.status}`);
const auth = await login.json();

await page.evaluateOnNewDocument((token, user) => {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('industry_type', 'retail');
}, auth.token, auth.user);

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(`${BASE}/app`, { waitUntil: 'networkidle0', timeout: 30000 });
const desktopDisplay = await page.$eval('.autotax-mobile-bottom-nav', (node) => getComputedStyle(node).display);
if (desktopDisplay !== 'none') throw new Error(`Desktop bottom nav must be hidden, got display=${desktopDisplay}`);

for (const width of [360, 390, 430]) {
  await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/app/pos`, { waitUntil: 'networkidle0', timeout: 30000 });
  const metrics = await page.evaluate(() => {
    const nav = document.querySelector('.autotax-mobile-bottom-nav');
    const safe = document.querySelector('.pb-safe');
    const buttons = [...(safe?.querySelectorAll('button') || [])];
    const bank = buttons.find((button) => button.textContent?.includes('Chuyển Khoản'));
    const cash = buttons.find((button) => button.textContent?.includes('Tiền Mặt'));
    const rect = (node) => node ? ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, height: node.getBoundingClientRect().height }) : null;
    return {
      width: window.innerWidth,
      viewport: window.innerHeight,
      nav: rect(nav),
      safe: rect(safe),
      bank: rect(bank),
      cash: rect(cash),
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      bodyHorizontalOverflow: document.body.scrollWidth - window.innerWidth,
    };
  });
  console.log(`[POS MOBILE ${width}]`, JSON.stringify(metrics));
  if (!metrics.nav || !metrics.bank || !metrics.cash) throw new Error(`POS mobile ${width}: layout nodes missing`);
  const actionBottom = Math.max(metrics.bank.bottom, metrics.cash.bottom);
  if (actionBottom > metrics.nav.top - 6) {
    throw new Error(`POS ${width}px checkout overlaps nav: actionBottom=${actionBottom}, navTop=${metrics.nav.top}`);
  }
  if (metrics.horizontalOverflow > 4 || metrics.bodyHorizontalOverflow > 4) {
    throw new Error(`POS ${width}px horizontal overflow: html=${metrics.horizontalOverflow}, body=${metrics.bodyHorizontalOverflow}`);
  }

  for (const route of ['/app', '/app/products', '/app/finance', '/app/report', '/app/settings']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      bodyOverflow: document.body.scrollWidth - window.innerWidth,
      navDisplay: getComputedStyle(document.querySelector('.autotax-mobile-bottom-nav')).display,
      body: document.body?.innerText || '',
      workspaceOverflowY: getComputedStyle(document.querySelector('.autotax-workspace')).overflowY,
    }));
    if (state.overflow > 4 || state.bodyOverflow > 4) throw new Error(`${route} ${width}px horizontal overflow`);
    if (state.navDisplay === 'none') throw new Error(`${route} ${width}px bottom nav unexpectedly hidden`);
    if (!['auto', 'scroll'].includes(state.workspaceOverflowY)) throw new Error(`${route} ${width}px workspace is not vertically scrollable`);
    if (state.body.includes('Màn hình này gặp sự cố')) throw new Error(`${route} ${width}px error boundary visible`);

    await page.evaluate(() => {
      const workspace = document.querySelector('.autotax-workspace');
      if (workspace) workspace.scrollTop = workspace.scrollHeight;
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const endState = await page.evaluate(() => {
      const workspace = document.querySelector('.autotax-workspace');
      const nav = document.querySelector('.autotax-mobile-bottom-nav');
      const pageRoot = document.querySelector('.autotax-page-enter');
      const navRect = nav?.getBoundingClientRect();
      const pageRect = pageRoot?.getBoundingClientRect();
      return {
        scrollTop: workspace?.scrollTop || 0,
        maxScroll: workspace ? Math.max(0, workspace.scrollHeight - workspace.clientHeight) : 0,
        pageBottom: pageRect?.bottom ?? null,
        navTop: navRect?.top ?? null,
      };
    });
    if (endState.maxScroll > 20 && endState.scrollTop < endState.maxScroll - 4) {
      throw new Error(`${route} ${width}px cannot reach scroll end: ${endState.scrollTop}/${endState.maxScroll}`);
    }
    if (endState.pageBottom !== null && endState.navTop !== null && endState.pageBottom > endState.navTop - 8) {
      throw new Error(`${route} ${width}px last page content is trapped under bottom nav: pageBottom=${endState.pageBottom}, navTop=${endState.navTop}`);
    }
  }

  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle0', timeout: 30000 });
  const dashboard = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.dashboard-metrics .metric-card')];
    const refresh = document.querySelector('.page-header .btn-secondary');
    const workspace = document.querySelector('.autotax-workspace');
    const first = cards[0]?.getBoundingClientRect();
    const second = cards[1]?.getBoundingClientRect();
    const refreshRect = refresh?.getBoundingClientRect();
    return {
      cardCount: cards.length,
      first: first ? { top: first.top, left: first.left, width: first.width } : null,
      second: second ? { top: second.top, left: second.left, width: second.width } : null,
      refreshWidth: refreshRect?.width || 0,
      workspaceScrollHeight: workspace?.scrollHeight || 0,
      workspaceClientHeight: workspace?.clientHeight || 0,
    };
  });
  if (dashboard.cardCount !== 4 || !dashboard.first || !dashboard.second) throw new Error(`Dashboard ${width}px metrics missing`);
  if (Math.abs(dashboard.first.top - dashboard.second.top) > 3 || dashboard.second.left <= dashboard.first.left) {
    throw new Error(`Dashboard ${width}px KPI cards must render as a 2-column mobile grid`);
  }
  if (dashboard.refreshWidth > width * 0.72) throw new Error(`Dashboard ${width}px refresh button is still stretched across the page`);

  await page.evaluate(() => {
    const workspace = document.querySelector('.autotax-workspace');
    if (workspace) workspace.scrollTop = workspace.scrollHeight;
  });
  await page.click('.autotax-mobile-bottom-nav a[href="/app/pos"]');
  await page.waitForFunction(() => location.pathname === '/app/pos' && !document.querySelector('.autotax-route-loader-overlay'), { timeout: 5000 });
  if ((await page.url()).endsWith('/app')) throw new Error(`Dashboard ${width}px bottom nav could not be tapped after scrolling`);
}

await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle0', timeout: 30000 });
const settings = await page.evaluate(() => {
  const input = [...document.querySelectorAll('input')].find((node) => node.placeholder?.includes('API Key'));
  const form = input?.closest('form');
  const button = [...(form?.querySelectorAll('button') || [])].find((node) => node.textContent?.includes('Thêm Cấu Hình Key'));
  const row = input?.parentElement;
  const tableWrapper = form?.nextElementSibling;
  const rect = (node) => node ? node.getBoundingClientRect() : null;
  const inputRect = rect(input);
  const buttonRect = rect(button);
  return {
    input: inputRect ? { top: inputRect.top, bottom: inputRect.bottom, width: inputRect.width } : null,
    button: buttonRect ? { top: buttonRect.top, bottom: buttonRect.bottom, width: buttonRect.width, height: buttonRect.height } : null,
    rowDirection: row ? getComputedStyle(row).flexDirection : null,
    tableOverflowX: tableWrapper ? getComputedStyle(tableWrapper).overflowX : null,
    tableClientWidth: tableWrapper?.clientWidth || 0,
    tableScrollWidth: tableWrapper?.scrollWidth || 0,
  };
});
console.log('[SETTINGS MOBILE 430]', JSON.stringify(settings));
if (!settings.input || !settings.button) throw new Error('Settings API-key input/button missing');
if (settings.rowDirection !== 'column') throw new Error(`Settings API-key controls must stack on mobile, got ${settings.rowDirection}`);
if (settings.button.top < settings.input.bottom + 4) throw new Error('Settings API-key submit button overlaps input');
if (settings.button.width < 250 || settings.button.height < 40) throw new Error(`Settings API-key submit target too small: ${settings.button.width}x${settings.button.height}`);
if (!['auto', 'scroll'].includes(settings.tableOverflowX) || settings.tableScrollWidth <= settings.tableClientWidth) throw new Error('Settings API-key table must be horizontally scrollable on mobile');

await browser.close();
console.log('SHELL LAYOUT SMOKE PASSED: desktop + touch mobile scroll-end reachability + bottom-nav interaction + settings actions');

// Run the route-wide dark-theme visibility audit in the same permanent gate.
await import('./smoke-mobile-contrast.mjs');
await import('./smoke-inventory-mobile.mjs');
