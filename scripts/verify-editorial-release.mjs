import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const blogRoot = path.join(root, 'frontend', 'public', 'blog');
const evidenceRoot = path.join(root, '.website-os', 'evidence');
const blogIndexPath = path.join(blogRoot, 'index.html');
const sitemapPath = path.join(root, 'frontend', 'public', 'sitemap.xml');

const requiredEvidence = [
  'url-ownership-map.csv',
  'project-scope-matrix.csv',
  'page-inventory.csv',
  'keyword-page-coverage.csv',
  'keyword-universe.csv',
  'cannibalization-register.csv',
  'k0-decision-record.yml',
];

function fail(message) {
  console.error(`EDITORIAL PREFLIGHT FAIL: ${message}`);
  process.exitCode = 1;
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`missing required file ${path.relative(root, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function count(re, text) {
  return [...text.matchAll(re)].length;
}

function csvRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(header.map((key, i) => [key, values[i] ?? '']));
  });
}

function parseCsvLine(line) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      out.push(cell);
      cell = '';
    } else cell += ch;
  }
  out.push(cell);
  return out;
}

for (const name of requiredEvidence) read(path.join(evidenceRoot, name));
const blogIndex = read(blogIndexPath);
const sitemap = read(sitemapPath);
const ownership = read(path.join(evidenceRoot, 'url-ownership-map.csv'));
const scope = read(path.join(evidenceRoot, 'project-scope-matrix.csv'));
const inventory = read(path.join(evidenceRoot, 'page-inventory.csv'));
const coverage = read(path.join(evidenceRoot, 'keyword-page-coverage.csv'));
const universe = read(path.join(evidenceRoot, 'keyword-universe.csv'));
const cannibalization = read(path.join(evidenceRoot, 'cannibalization-register.csv'));
const k0 = read(path.join(evidenceRoot, 'k0-decision-record.yml'));

const ownershipRows = csvRows(ownership);
const scopeRows = csvRows(scope);
const inventoryRows = csvRows(inventory);
const coverageRows = csvRows(coverage);
const universeRows = csvRows(universe);

if (!/decision:\s*PASS/i.test(k0) && !/k0[^\n]*:\s*PASS/i.test(k0) && !/status:\s*PASS/i.test(k0)) {
  fail('k0-decision-record.yml does not contain an explicit PASS decision/status');
}

if (!fs.existsSync(blogRoot)) fail('frontend/public/blog directory is missing');
const slugs = fs.existsSync(blogRoot)
  ? fs.readdirSync(blogRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

if (slugs.length === 0) fail('no blog article directories found');

for (const slug of slugs) {
  const route = `/blog/${slug}/`;
  const canonical = `https://autotaxpos.com${route}`;
  const articlePath = path.join(blogRoot, slug, 'index.html');
  const html = read(articlePath);

  const h1Count = count(/<h1(?:\s|>)/gi, html);
  if (h1Count !== 1) fail(`${route} expected exactly one H1, found ${h1Count}`);

  const canonicalCount = count(new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'), html);
  if (canonicalCount !== 1) fail(`${route} expected exactly one canonical ${canonical}, found ${canonicalCount}`);

  if (!/"@type"\s*:\s*"Article"/i.test(html)) fail(`${route} missing Article JSON-LD`);
  if (!/"@type"\s*:\s*"BreadcrumbList"/i.test(html)) fail(`${route} missing BreadcrumbList JSON-LD`);
  if (!/autotax-logo\.svg/i.test(html)) fail(`${route} missing AutoTax logo reference`);

  if (!blogIndex.includes(`href="${route}"`) && !blogIndex.includes(`href='${route}'`)) fail(`${route} is not linked from blog index`);
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) fail(`${route} is missing from sitemap`);

  const owners = ownershipRows.filter((row) => row.target_url === route);
  const scopes = scopeRows.filter((row) => row.target_url === route);
  const pages = inventoryRows.filter((row) => row.target_url === route);
  const covered = coverageRows.filter((row) => row.target_url === route);
  const keywords = universeRows.filter((row) => row.target_url === route);

  if (owners.length !== 1) fail(`${route} must have exactly one URL ownership row, found ${owners.length}`);
  if (scopes.length !== 1) fail(`${route} must have exactly one project scope row, found ${scopes.length}`);
  if (pages.length !== 1) fail(`${route} must have exactly one page inventory row, found ${pages.length}`);
  if (!covered.length) fail(`${route} is missing from keyword-page-coverage.csv`);
  if (!keywords.length) fail(`${route} is missing from keyword-universe.csv`);

  const owner = owners[0];
  const scopeRow = scopes[0];
  const page = pages[0];
  if (owner && !(owner.canonical_owner === 'YES' && owner.indexability === 'INDEXABLE' && owner.status === 'PASS')) {
    fail(`${route} ownership row is not canonical/indexable/PASS`);
  }
  if (scopeRow && page && scopeRow.primary_intent !== page.primary_intent) fail(`${route} intent mismatch between scope and inventory`);

  const primaryCoverage = covered.filter((row) => row.coverage_type === 'PRIMARY_PAGE' || row.coverage_type === 'COMPARISON_PAGE');
  if (page && !primaryCoverage.some((row) => row.keyword === page.primary_keyword)) {
    fail(`${route} primary keyword ${page.primary_keyword} is not registered as PRIMARY_PAGE/COMPARISON_PAGE in keyword-page-coverage.csv`);
  }
  if (scopeRow && covered.some((row) => row.cluster_id !== scopeRow.cluster_id)) fail(`${route} cluster mismatch between project-scope-matrix.csv and keyword-page-coverage.csv`);
  if (scopeRow && keywords.some((row) => row.cluster_id !== scopeRow.cluster_id)) fail(`${route} cluster mismatch between project-scope-matrix.csv and keyword-universe.csv`);
  if (page && !keywords.some((row) => row.keyword === page.primary_keyword && row.status === 'PASS')) {
    fail(`${route} primary keyword ${page.primary_keyword} is missing/PASS mismatch in keyword-universe.csv`);
  }
}

const canonicalRoutes = ownershipRows
  .map((row) => row.target_url)
  .filter((route) => route?.startsWith('/blog/') && route !== '/blog/');
for (const route of canonicalRoutes) {
  const slug = route.split('/').filter(Boolean).at(-1);
  if (!slugs.includes(slug)) fail(`${route} has ownership but no article directory`);
}

const cannibalizationFails = cannibalization
  .split(/\r?\n/)
  .slice(1)
  .filter((line) => /(?:,FAIL,|,HOLD,|,BLOCKED,|,UNRESOLVED,)/i.test(`,${line},`));
if (cannibalizationFails.length) fail(`cannibalization register contains unresolved blocking rows: ${cannibalizationFails.length}`);

if (process.exitCode) process.exit(process.exitCode);
console.log(`EDITORIAL PREFLIGHT PASS: ${slugs.length} article routes; article contract + index + sitemap + K0 + ownership/scope/inventory/coverage/universe consistent.`);
