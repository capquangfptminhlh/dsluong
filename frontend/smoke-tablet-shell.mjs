import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: '0912345678', password: 'AuditUi2026!' }),
});
if (!login.ok) throw new Error(`Tablet shell login failed HTTP ${login.status}`);
const auth = await login.json();

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();

const rgb = (value) => String(value || '').match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
const luminance = (values) => {
  const channels = values.map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a, b) => {
  if (a.length < 3 || b.length < 3) return 0;
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

try {
  await page.evaluateOnNewDocument((token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('industry_type', 'retail');
  }, auth.token, auth.user);

  // Tablet/compact shell: this width previously exposed desktop CRM and overlapping shell controls.
  await page.setViewport({ width: 800, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: true });
  await page.goto(`${BASE}/app/customers`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('[data-route="/app/customers"]', { timeout: 10000 });
  await sleep(150);

  const tablet = await page.evaluate(() => {
    const route = document.querySelector('[data-route="/app/customers"]');
    const heading = [...(route?.querySelectorAll('h1') || [])].find((node) => node.textContent?.includes('Quản lý CRM'));
    const add = [...(route?.querySelectorAll('button') || [])].find((node) => node.textContent?.includes('Thêm Khách Hàng'));
    const cardList = [...(route?.querySelectorAll('div') || [])].find((node) => String(node.className).includes('md:hidden') && String(node.className).includes('overflow-y-auto'));
    const desktopTable = [...(route?.querySelectorAll('div') || [])].find((node) => String(node.className).includes('hidden md:block') && node.querySelector('table'));
    const ai = document.querySelector('button[aria-label="Mở trợ lý AutoTax AI"]');
    const header = document.querySelector('.autotax-header');
    const globalSearch = document.querySelector('.autotax-global-search');
    const profile = document.querySelector('.autotax-profile-button');
    const rect = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const effectiveBackground = (node) => {
      let current = node;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        const numbers = String(value).match(/[\d.]+/g)?.map(Number) || [];
        const alpha = numbers.length >= 4 ? numbers[3] : 1;
        if (numbers.length >= 3 && alpha > 0.05) return value;
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      heading: rect(heading),
      headingColor: heading ? getComputedStyle(heading).color : '',
      headingBackground: heading ? effectiveBackground(heading) : '',
      add: rect(add),
      cardDisplay: cardList ? getComputedStyle(cardList).display : null,
      tableDisplay: desktopTable ? getComputedStyle(desktopTable).display : null,
      aiDisplay: ai ? getComputedStyle(ai).display : 'none',
      header: rect(header),
      search: rect(globalSearch),
      profile: rect(profile),
    };
  });
  console.log('[TABLET SHELL 800]', JSON.stringify(tablet));
  if (tablet.scrollWidth > tablet.width + 4 || tablet.bodyScrollWidth > tablet.width + 4) {
    throw new Error(`Tablet shell horizontal overflow: html=${tablet.scrollWidth}, body=${tablet.bodyScrollWidth}`);
  }
  if (!tablet.heading || tablet.heading.left < 0 || tablet.heading.right > tablet.width || tablet.heading.height < 20) {
    throw new Error(`Tablet customer heading missing/clipped: ${JSON.stringify(tablet.heading)}`);
  }
  if (contrast(rgb(tablet.headingColor), rgb(tablet.headingBackground)) < 4.5) {
    throw new Error(`Tablet customer heading contrast too low: ${tablet.headingColor} on ${tablet.headingBackground}`);
  }
  if (!tablet.add || tablet.add.left < 0 || tablet.add.right > tablet.width || tablet.add.width < 180 || tablet.add.height < 40) {
    throw new Error(`Tablet add-customer action missing/clipped: ${JSON.stringify(tablet.add)}`);
  }
  if (tablet.cardDisplay === 'none' || tablet.tableDisplay !== 'none') {
    throw new Error(`Tablet CRM must use customer cards and hide dense desktop table: card=${tablet.cardDisplay}, table=${tablet.tableDisplay}`);
  }
  if (tablet.aiDisplay !== 'none') throw new Error(`AI launcher must be hidden on compact tablet shell, got ${tablet.aiDisplay}`);
  if (!tablet.search || !tablet.profile || tablet.search.right > tablet.profile.left - 4) {
    throw new Error(`Tablet header search/profile collision: search=${JSON.stringify(tablet.search)}, profile=${JSON.stringify(tablet.profile)}`);
  }

  // Profile menu must remain readable and fully inside the viewport.
  await page.click('.autotax-profile-button');
  await sleep(100);
  const account = await page.evaluate(() => {
    const profile = document.querySelector('.autotax-profile-button');
    const menu = profile?.nextElementSibling;
    const logout = [...(menu?.querySelectorAll('button') || [])].find((node) => node.textContent?.includes('Đăng xuất'));
    const name = menu?.querySelector('.text-slate-800');
    const rect = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const effectiveBackground = (node) => {
      let current = node;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        const numbers = String(value).match(/[\d.]+/g)?.map(Number) || [];
        const alpha = numbers.length >= 4 ? numbers[3] : 1;
        if (numbers.length >= 3 && alpha > 0.05) return value;
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    return {
      menu: rect(menu),
      menuDisplay: menu ? getComputedStyle(menu).display : null,
      menuBackground: menu ? effectiveBackground(menu) : '',
      nameColor: name ? getComputedStyle(name).color : '',
      nameBackground: name ? effectiveBackground(name) : '',
      logout: rect(logout),
      logoutColor: logout ? getComputedStyle(logout).color : '',
      logoutBackground: logout ? effectiveBackground(logout) : '',
    };
  });
  console.log('[TABLET PROFILE 800]', JSON.stringify(account));
  if (!account.menu || account.menuDisplay === 'none' || account.menu.left < 0 || account.menu.right > 800 || account.menu.top < 56) {
    throw new Error(`Tablet profile menu missing/outside viewport: ${JSON.stringify(account.menu)}`);
  }
  if (!account.logout || account.logout.height < 36 || contrast(rgb(account.logoutColor), rgb(account.logoutBackground)) < 4.5) {
    throw new Error(`Tablet logout action unreadable: ${JSON.stringify(account)}`);
  }
  if (contrast(rgb(account.nameColor), rgb(account.nameBackground)) < 4.5) {
    throw new Error(`Tablet profile identity unreadable: ${account.nameColor} on ${account.nameBackground}`);
  }

  // Opening compact navigation creates a full-screen button backdrop. The global button-motion
  // system must not rewrite its fixed positioning.
  await page.keyboard.press('Escape');
  const menuButton = await page.$('button[aria-label="Mở menu"]');
  if (!menuButton) throw new Error('Tablet menu button missing');
  await menuButton.click();
  await sleep(80);
  const backdrop = await page.evaluate(() => {
    const node = document.querySelector('button[aria-label="Đóng menu"].fixed.inset-0');
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return {
      position: getComputedStyle(node).position,
      top: r.top, left: r.left, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height,
      motion: node.dataset.autotaxMotion || '',
    };
  });
  console.log('[TABLET BACKDROP 800]', JSON.stringify(backdrop));
  if (!backdrop || backdrop.position !== 'fixed' || backdrop.top > 1 || backdrop.left > 1 || backdrop.width < 798 || backdrop.height < 898) {
    throw new Error(`Global button motion broke fixed mobile backdrop: ${JSON.stringify(backdrop)}`);
  }

  // Desktop still gets the assistant, and it must stay anchored to the viewport bottom-right.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('button[aria-label="Mở trợ lý AutoTax AI"]', { timeout: 10000 });
  await sleep(80);
  const aiDesktop = await page.evaluate(() => {
    const node = document.querySelector('button[aria-label="Mở trợ lý AutoTax AI"]');
    const r = node?.getBoundingClientRect();
    return node && r ? {
      display: getComputedStyle(node).display,
      position: getComputedStyle(node).position,
      rightGap: innerWidth - r.right,
      bottomGap: innerHeight - r.bottom,
      width: r.width,
      height: r.height,
      motion: node.dataset.autotaxMotion || '',
    } : null;
  });
  console.log('[DESKTOP AI LAUNCHER]', JSON.stringify(aiDesktop));
  if (!aiDesktop || aiDesktop.display === 'none' || aiDesktop.position !== 'fixed' || aiDesktop.rightGap < 16 || aiDesktop.rightGap > 40 || aiDesktop.bottomGap < 16 || aiDesktop.bottomGap > 40) {
    throw new Error(`Desktop AI launcher not viewport-anchored: ${JSON.stringify(aiDesktop)}`);
  }

  console.log('TABLET SHELL SMOKE PASSED: CRM + header + account menu + positioned-button integrity');
} finally {
  await browser.close();
}
