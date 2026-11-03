import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const phone = '0912345678';
const password = 'AuditUi2026!';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { response, data };
}

async function registerTestOwner() {
  await sleep(600);
  const register = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Inventory Layout Audit', phone, password, sector: 'retail' }),
  });
  if (register.response.ok) return register.data;
  if (register.response.status === 409) {
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    });
    if (login.response.ok) return login.data;
  }
  throw new Error(`Inventory mobile smoke auth failed HTTP ${register.response.status}: ${JSON.stringify(register.data)}`);
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();

try {
  const auth = await registerTestOwner();
  if (!auth?.token) throw new Error('Inventory mobile smoke auth missing token');

  await page.evaluateOnNewDocument((token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('industry_type', 'retail');
  }, auth.token, auth.user);

  for (const width of [360, 390, 430]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/app/inventory`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('input[placeholder*="Tìm theo tên"]', { timeout: 10000 });

    const state = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="Tìm theo tên"]');
      const select = document.querySelector('select[aria-label="Lọc theo trạng thái tồn kho"]');
      const lowKpi = document.querySelector('button[aria-pressed]');
      const kpiGrid = lowKpi?.parentElement;
      const kpis = [...(kpiGrid?.children || [])];
      const pageHeaderTitle = [...document.querySelectorAll('h1')].find((node) => node.textContent?.includes('Quản lý Kho bãi'));
      const mobileActions = [...document.querySelectorAll('button')].filter((node) => ['Xuất kho', 'Nhập kho'].includes(node.textContent?.trim()));
      const mobileList = [...document.querySelectorAll('div')].find((node) => String(node.className).includes('md:hidden') && String(node.className).includes('max-h-[62vh]'));
      const desktopTableWrapper = [...document.querySelectorAll('div')].find((node) => String(node.className).includes('hidden md:block') && node.querySelector('table'));
      const nav = document.querySelector('.autotax-mobile-bottom-nav');
      const workspace = document.querySelector('.autotax-workspace');
      const rect = (node) => {
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      return {
        input: rect(input),
        select: rect(select),
        kpis: kpis.map(rect),
        pageHeaderHidden: pageHeaderTitle ? pageHeaderTitle.offsetParent === null : false,
        mobileActionCount: mobileActions.filter((node) => node.offsetParent !== null).length,
        mobileList: rect(mobileList),
        desktopTableHidden: desktopTableWrapper ? getComputedStyle(desktopTableWrapper).display === 'none' : false,
        nav: rect(nav),
        horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        bodyHorizontalOverflow: document.body.scrollWidth - window.innerWidth,
        workspaceScrollTop: workspace?.scrollTop || 0,
        workspaceScrollHeight: workspace?.scrollHeight || 0,
        workspaceClientHeight: workspace?.clientHeight || 0,
      };
    });

    console.log(`[INVENTORY MOBILE ${width}]`, JSON.stringify(state));
    if (!state.input || !state.select) throw new Error(`Inventory ${width}px search/filter controls missing`);
    if (state.input.width < width * 0.72 || state.select.width < width * 0.72) {
      throw new Error(`Inventory ${width}px search/filter too narrow: input=${state.input.width}, select=${state.select.width}`);
    }
    if (state.select.top < state.input.bottom + 6) {
      throw new Error(`Inventory ${width}px search/filter must stack without overlap`);
    }
    if (state.kpis.length !== 3 || state.kpis.some((item) => !item)) throw new Error(`Inventory ${width}px KPI cards missing`);
    if (Math.max(...state.kpis.map((item) => item.top)) - Math.min(...state.kpis.map((item) => item.top)) > 3) {
      throw new Error(`Inventory ${width}px KPI cards are not on one compact row`);
    }
    if (state.kpis.some((item) => item.width > width * 0.34)) {
      throw new Error(`Inventory ${width}px KPI card is too wide for the 3-up mobile row`);
    }
    if (!state.pageHeaderHidden) throw new Error(`Inventory ${width}px duplicates the desktop page header under the app-shell title`);
    if (state.mobileActionCount !== 2) throw new Error(`Inventory ${width}px must expose two mobile stock action buttons`);
    if (!state.mobileList || !state.desktopTableHidden) throw new Error(`Inventory ${width}px must use mobile cards and hide the desktop table`);
    if (state.horizontalOverflow > 4 || state.bodyHorizontalOverflow > 4) {
      throw new Error(`Inventory ${width}px horizontal overflow: html=${state.horizontalOverflow}, body=${state.bodyHorizontalOverflow}`);
    }

    await page.evaluate(() => {
      const workspace = document.querySelector('.autotax-workspace');
      if (workspace) workspace.scrollTop = workspace.scrollHeight;
    });
    await sleep(100);
    const end = await page.evaluate(() => {
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
    if (end.maxScroll > 20 && end.scrollTop < end.maxScroll - 4) {
      throw new Error(`Inventory ${width}px cannot reach scroll end: ${end.scrollTop}/${end.maxScroll}`);
    }
    if (end.pageBottom !== null && end.navTop !== null && end.pageBottom > end.navTop - 8) {
      throw new Error(`Inventory ${width}px final content is trapped under bottom nav: pageBottom=${end.pageBottom}, navTop=${end.navTop}`);
    }
  }

  console.log('INVENTORY MOBILE LAYOUT SMOKE PASSED: compact KPIs + full-width controls + card list + bottom-nav safe area');
} finally {
  await browser.close();
}
