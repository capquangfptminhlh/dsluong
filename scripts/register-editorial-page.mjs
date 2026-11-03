import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const evidence = path.join(root, '.website-os', 'evidence');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const i = arg.indexOf('=');
  return i > 2 && arg.startsWith('--') ? [arg.slice(2, i), arg.slice(i + 1)] : [arg.replace(/^--/, ''), 'true'];
}));

const required = ['slug', 'cluster', 'entity', 'primary-keyword'];
for (const key of required) {
  if (!args[key]) {
    console.error(`Missing --${key}=...`);
    process.exit(2);
  }
}

const slug = args.slug.replace(/^\/+|\/+$/g, '');
const route = `/blog/${slug}/`;
const articlePath = path.join(root, 'frontend', 'public', 'blog', slug, 'index.html');
if (!fs.existsSync(articlePath)) {
  console.error(`Article must exist before registry sync: ${path.relative(root, articlePath)}`);
  process.exit(2);
}

const cluster = args.cluster;
const entity = args.entity;
const primaryKeyword = args['primary-keyword'];
const secondaryKeyword = args['secondary-keyword'] || '';
const intent = args.intent || 'INFORMATIONAL';
const pageType = args['page-type'] || 'supporting_article';
const launchStatus = args['launch-status'] || 'BUILD_POST_LAUNCH';
const evidenceRef = args['evidence-ref'] || 'serp-evidence.csv';
const observedAt = args['observed-at'] || new Date().toISOString();

function file(name) { return path.join(evidence, name); }
function read(name) { return fs.readFileSync(file(name), 'utf8').trimEnd(); }
function write(name, text) { fs.writeFileSync(file(name), `${text.trimEnd()}\n`, 'utf8'); }
function csvSafe(v) {
  if (/[",\n]/.test(v)) return `"${v.replaceAll('"', '""')}"`;
  return v;
}
function rows(text) { return text.split(/\r?\n/); }
function hasRoute(text) { return rows(text).slice(1).some((line) => line.includes(`,${route},`) || line.endsWith(`,${route}`)); }
function append(name, row, uniqueByRoute = true) {
  const text = read(name);
  if (uniqueByRoute && hasRoute(text)) {
    console.log(`KEEP ${name}: ${route} already registered`);
    return;
  }
  write(name, `${text}\n${row}`);
  console.log(`ADD ${name}: ${route}`);
}
function nextId(text, prefix) {
  const nums = [...text.matchAll(new RegExp(`${prefix}-(\\d+)`, 'g'))].map((m) => Number(m[1]));
  return `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}

append('url-ownership-map.csv', [intent, entity, route, 'YES', 'INDEXABLE', 'PASS'].map(csvSafe).join(','));

{
  const text = read('project-scope-matrix.csv');
  if (!hasRoute(text)) {
    const id = nextId(text, 'SCOPE');
    const row = [id, cluster, entity, intent, entity, route, pageType, launchStatus,
      'Qualified editorial page registered atomically; cannibalization must be resolved before publish', evidenceRef]
      .map(csvSafe).join(',');
    write('project-scope-matrix.csv', `${text}\n${row}`);
    console.log(`ADD project-scope-matrix.csv: ${route}`);
  }
}

{
  const text = read('page-inventory.csv');
  if (!hasRoute(text)) {
    const id = nextId(text, 'PAGE');
    const row = [id, route, pageType, primaryKeyword, intent, entity, 'INDEXABLE', launchStatus,
      `frontend/public/blog/${slug}/index.html`, 'IMGSET-SHARED', 'Article+BreadcrumbList', '/blog/', 'YES', 'PASS']
      .map(csvSafe).join(',');
    write('page-inventory.csv', `${text}\n${row}`);
    console.log(`ADD page-inventory.csv: ${route}`);
  }
}

{
  let text = read('keyword-page-coverage.csv');
  const current = rows(text).slice(1).filter((line) => line.includes(`,${route},`));
  if (!current.some((line) => line.startsWith(`${primaryKeyword},`) || line.startsWith(`"${primaryKeyword}"`))) {
    text += `\n${[primaryKeyword, cluster, route, 'PRIMARY_PAGE', launchStatus, 'article', evidenceRef, 'PASS'].map(csvSafe).join(',')}`;
  }
  if (secondaryKeyword && !current.some((line) => line.startsWith(`${secondaryKeyword},`) || line.startsWith(`"${secondaryKeyword}"`))) {
    text += `\n${[secondaryKeyword, cluster, route, 'SECONDARY_SECTION', launchStatus, 'article', evidenceRef, 'PASS'].map(csvSafe).join(',')}`;
  }
  write('keyword-page-coverage.csv', text);
  console.log(`SYNC keyword-page-coverage.csv: ${route}`);
}

{
  let text = read('keyword-universe.csv');
  const current = rows(text).slice(1).filter((line) => line.includes(`,${route},`));
  const addKeyword = (keyword) => {
    if (!keyword) return;
    if (current.some((line) => line.startsWith(`${keyword},`) || line.startsWith(`"${keyword}"`))) return;
    text += `\n${[keyword, intent, cluster, route, observedAt, 'VERIFIED', 'PASS'].map(csvSafe).join(',')}`;
  };
  addKeyword(primaryKeyword);
  addKeyword(secondaryKeyword);
  write('keyword-universe.csv', text);
  console.log(`SYNC keyword-universe.csv: ${route}`);
}

console.log(`EDITORIAL REGISTRY SYNC PASS: ${route}`);
console.log('Next: update cannibalization-register.csv + K0 evidence, blog index, sitemap, then run node scripts/verify-editorial-release.mjs');
