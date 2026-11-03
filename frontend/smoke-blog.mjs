import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101';
const OUT = path.resolve('visual-artifacts');
const BLOG_ROOT = path.resolve('public/blog');
await fs.mkdir(OUT, { recursive: true });

const entries = await fs.readdir(BLOG_ROOT, { withFileTypes: true });
const articleSlugs = [];
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  try {
    await fs.access(path.join(BLOG_ROOT, entry.name, 'index.html'));
    articleSlugs.push(entry.name);
  } catch {}
}
articleSlugs.sort();
if (articleSlugs.length === 0) throw new Error('No static blog articles discovered');

const pages = [
  { path: '/blog/', canonical: 'https://autotaxpos.com/blog/', schema: ['CollectionPage'], slug: 'index' },
  ...articleSlugs.map((slug) => ({ path: `/blog/${slug}/`, canonical: `https://autotaxpos.com/blog/${slug}/`, schema: ['Article', 'BreadcrumbList'], slug })),
];

function schemaTypes(html) {
  const scripts = [...html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  return scripts.map((match) => { try { return JSON.parse(match[1])['@type']; } catch { return null; } }).filter(Boolean);
}

for (const item of pages) {
  const response = await fetch(`${BASE}${item.path}`, { redirect: 'manual' });
  const html = await response.text();
  if (response.status !== 200) throw new Error(`${item.path}: expected HTTP 200, got ${response.status}`);
  if (!String(response.headers.get('content-type') || '').includes('text/html')) throw new Error(`${item.path}: not served as HTML`);
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1] || '';
  if (canonical !== item.canonical) throw new Error(`${item.path}: unexpected canonical ${canonical}`);
  const types = schemaTypes(html);
  for (const required of item.schema) if (!types.includes(required)) throw new Error(`${item.path}: missing ${required} schema`);
  if (!html.includes('/autotax-logo.svg')) throw new Error(`${item.path}: AutoTax logo missing`);
  for (const unsafe of ['10.000+ hộ kinh doanh', '95B+', '99.9%', 'Miễn phí 7 ngày', 'sẵn sàng nộp']) if (html.includes(unsafe)) throw new Error(`${item.path}: unsafe legacy claim remains: ${unsafe}`);
  console.log(`[BLOG STATIC] ${item.path} OK`);
}

const blogIndex = await (await fetch(`${BASE}/blog/`)).text();
for (const item of pages.slice(1)) if (!blogIndex.includes(`href="${item.path}"`)) throw new Error(`/blog/: missing link to ${item.path}`);
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
for (const item of pages) if (!sitemap.includes(`<loc>${item.canonical}</loc>`)) throw new Error(`sitemap missing ${item.canonical}`);

const logoResponse = await fetch(`${BASE}/autotax-logo.svg`);
if (!logoResponse.ok || !String(logoResponse.headers.get('content-type') || '').includes('image/svg')) throw new Error('AutoTax logo asset missing or invalid');
const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
const appIcon = manifest.icons?.find((icon) => icon.src === '/autotax-pwa-v3.svg');
const maskableIcon = manifest.icons?.find((icon) => icon.src === '/autotax-pwa-maskable-v3.svg');
if (!appIcon || !String(appIcon.purpose || '').split(/\s+/).includes('any')) throw new Error('PWA primary icon missing or invalid');
if (!maskableIcon || !String(maskableIcon.purpose || '').split(/\s+/).includes('maskable')) throw new Error('PWA maskable icon missing or invalid');
for (const iconPath of ['/autotax-pwa-v3.svg', '/autotax-pwa-maskable-v3.svg']) {
  const response = await fetch(`${BASE}${iconPath}`);
  if (!response.ok || !String(response.headers.get('content-type') || '').includes('image/svg')) throw new Error(`PWA icon missing or invalid: ${iconPath}`);
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (error) => { throw error; });

async function mobileCheck(route, screenshotName) {
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
  if (!response || response.status() >= 400) throw new Error(`${route}: browser HTTP ${response?.status()}`);
  const state = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, h1: document.querySelectorAll('h1').length, logo: Boolean(document.querySelector('img[src="/autotax-logo.svg"]')), text: document.body?.innerText || '' }));
  if (state.scrollWidth > state.width + 4) throw new Error(`${route}: mobile horizontal overflow ${state.scrollWidth}>${state.width}`);
  if (state.h1 !== 1 || !state.logo || state.text.trim().length < 150) throw new Error(`${route}: incomplete mobile render`);
  await page.screenshot({ path: path.join(OUT, screenshotName), fullPage: true });
}
for (const item of pages) await mobileCheck(item.path, `blog-${item.slug}-mobile-390.png`);

await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
const home = await page.evaluate(() => ({ logo: Boolean(document.querySelector('.landing-brand img[src="/autotax-logo.svg"]')), blogCards: document.querySelectorAll('.landing-blog-card').length, blogLink: Boolean(document.querySelector('a[href="/blog/"]')) }));
if (!home.logo || home.blogCards !== 3 || !home.blogLink) throw new Error(`Homepage knowledge/logo incomplete: ${JSON.stringify(home)}`);
await page.screenshot({ path: path.join(OUT, 'homepage-blog-logo-desktop.png'), fullPage: true });
await browser.close();
console.log(`BLOG SEO + BRAND SMOKE PASSED: ${articleSlugs.length} articles, schemas, sitemap, logo, PWA icons, homepage knowledge hub, mobile 390 for every blog route`);
