import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (error) => { throw error; });

const bannedClaims = [
  '10.000+ hộ kinh doanh',
  '95B+',
  '99.9%',
  'Miễn phí 7 ngày',
  'Không cần thẻ',
  'Hỗ trợ 24/7',
  'tự động tính thuế',
  '01/CNKD',
  'pravatar.cc',
];

async function inspect(viewport) {
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  const response = await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!response || response.status() >= 400) throw new Error(`Homepage document HTTP ${response?.status()}`);

  const result = await page.evaluate(() => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
    const description = document.querySelector('meta[name="description"]')?.content || '';
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => {
      try { return JSON.parse(node.textContent); } catch { return null; }
    }).filter(Boolean);
    const mobileCta = document.querySelector('.landing-mobile-cta');
    const footerLinks = document.querySelector('.landing-footer-links');
    const lastPrinciple = document.querySelector('.landing-principles span:last-child');
    const rect = (node) => node ? ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom }) : null;
    return {
      title: document.title,
      body: document.body?.innerText || '',
      html: document.documentElement.innerHTML,
      h1: document.querySelectorAll('h1').length,
      h2: document.querySelectorAll('h2').length,
      canonical,
      description,
      schemas: schemas.map((schema) => schema['@type']),
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      mobileCtaDisplay: mobileCta ? getComputedStyle(mobileCta).display : null,
      mobileCta: rect(mobileCta),
      footerLinks: rect(footerLinks),
      lastPrinciple: rect(lastPrinciple),
    };
  });

  if (result.h1 !== 1) throw new Error(`Homepage must have exactly one H1, got ${result.h1}`);
  if (result.h2 < 5) throw new Error(`Homepage semantic section hierarchy too shallow: H2=${result.h2}`);
  if (!result.title.includes('AutoTax') || !result.title.includes('bán hàng')) throw new Error(`Unexpected homepage title: ${result.title}`);
  if (!result.description.includes('bán hàng') || !result.description.includes('công nợ')) throw new Error('Meta description missing core intent terms');
  if (result.canonical !== 'https://autotaxpos.com/') throw new Error(`Unexpected canonical ${result.canonical}`);
  if (!result.schemas.includes('SoftwareApplication') || !result.schemas.includes('FAQPage')) throw new Error(`Missing structured data: ${result.schemas.join(',')}`);
  if (result.scrollWidth > result.width + 4) throw new Error(`Homepage horizontal overflow ${result.scrollWidth}>${result.width}`);
  for (const claim of bannedClaims) {
    if (result.body.includes(claim) || result.html.includes(claim)) throw new Error(`Unsafe/unverified legacy claim remains: ${claim}`);
  }
  return result;
}

const desktop = await inspect({ width: 1440, height: 1000 });
if (desktop.mobileCtaDisplay !== 'none') throw new Error(`Desktop sticky mobile CTA must be hidden, got ${desktop.mobileCtaDisplay}`);

// Real interaction: context lens updates copy and operational stages switch without errors.
const beforeIndustry = await page.$eval('.landing-industry-summary', (node) => node.textContent);
await page.$eval('.landing-industry-tabs button:nth-child(2)', (node) => node.click());
await page.waitForFunction((before) => document.querySelector('.landing-industry-summary')?.textContent !== before, {}, beforeIndustry);
await page.$eval('.landing-stage-tabs button:nth-child(5)', (node) => node.click());
await page.waitForFunction(() => document.querySelector('#landing-stage-panel')?.innerText.includes('fail-closed'));
console.log('[HOMEPAGE] Industry Lens + Operational Spine interaction passed');

for (const width of [360, 390, 430]) {
  const mobile = await inspect({ width, height: width === 430 ? 932 : 844 });
  if (mobile.mobileCtaDisplay === 'none') throw new Error(`${width}px sticky CTA unexpectedly hidden`);
  if (mobile.lastPrinciple && mobile.mobileCta && mobile.lastPrinciple.bottom > mobile.mobileCta.top - 4) {
    throw new Error(`${width}px sticky CTA covers hero principles: principleBottom=${mobile.lastPrinciple.bottom}, ctaTop=${mobile.mobileCta.top}`);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await new Promise((resolve) => setTimeout(resolve, 80));
  const bottom = await page.evaluate(() => {
    const cta = document.querySelector('.landing-mobile-cta')?.getBoundingClientRect();
    const links = document.querySelector('.landing-footer-links')?.getBoundingClientRect();
    return { ctaTop: cta?.top ?? 0, footerLinksBottom: links?.bottom ?? 0, viewport: window.innerHeight };
  });
  if (bottom.footerLinksBottom > bottom.ctaTop - 4) throw new Error(`${width}px sticky CTA covers footer actions: footerBottom=${bottom.footerLinksBottom}, ctaTop=${bottom.ctaTop}`);
  console.log(`[HOMEPAGE] ${width}px semantic + overflow + sticky CTA passed`);
}

const robots = await fetch(`${BASE}/robots.txt`);
if (!robots.ok || !(await robots.text()).includes('Sitemap: https://autotaxpos.com/sitemap.xml')) throw new Error('robots.txt missing sitemap declaration');
const sitemap = await fetch(`${BASE}/sitemap.xml`);
if (!sitemap.ok || !(await sitemap.text()).includes('<loc>https://autotaxpos.com/</loc>')) throw new Error('sitemap.xml missing homepage URL');

await browser.close();
console.log('HOMEPAGE SMOKE PASSED: SEO metadata + safe claims + interactions + 360/390/430 mobile composition');
