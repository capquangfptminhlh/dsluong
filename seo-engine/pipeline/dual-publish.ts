import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { type ContentFact } from '../src/content-standard/validate.js';
import { generateStandardArticle } from '../src/content-standard/generate.js';
import { pingIndexingApi } from '../src/indexing/ping.js';

const MAIN_LEDGER = path.resolve(process.cwd(), 'state/main-ledger-local.json');
const BLOGGER_LEDGER = path.resolve(process.cwd(), 'state/blogger-ledger-local.json');
const ERROR_STREAK_FILE = path.resolve(process.cwd(), 'state/alerts/error-streak.json');
const ARTICLES_DIR = path.resolve(process.cwd(), 'src/content/articles');
const TOPICS_PATH = path.resolve(process.cwd(), 'config/topics.json');
const TODAY = new Date().toISOString().split('T')[0];

export function slugify(text: string) {
  // "\u0111" l\u00e0 CH\u1eee C\u00c1I RI\u00caNG trong b\u1ea3ng ch\u1eef c\u00e1i ti\u1ebfng Vi\u1ec7t, kh\u00f4ng ph\u1ea3i d + d\u1ea5u, n\u00ean NFD
  // kh\u00f4ng t\u00e1ch \u0111\u01b0\u1ee3c n\u00f3. Thi\u1ebfu b\u01b0\u1edbc \u0111\u1ed5i \u0111\u2192d th\u00ec "h\u00f3a \u0111\u01a1n \u0111i\u1ec7n t\u1eed" th\u00e0nh "hoa-on-ien-tu":
  // URL sai ch\u00ednh t\u1ea3 v\u00e0 m\u1ea5t lu\u00f4n t\u1eeb kh\u00f3a trong slug.
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function loadJson(p: string, d: any) { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return d; } }
async function saveJson(p: string, data: any) { await fs.mkdir(path.dirname(p), {recursive: true}); await fs.writeFile(p, JSON.stringify(data, null, 2)); }

function getEntries(l: any) { return Array.isArray(l) ? l : (l && Array.isArray(l.entries) ? l.entries : []); }

async function checkCap(p: string) { const raw = await loadJson(p, []); const l = getEntries(raw); return l.some((e:any) => e.date === TODAY && e.status === 'COMPLETED'); }
async function recordLedger(p: string, e: any) { 
  const raw = await loadJson(p, { version: 1, entries: [] }); 
  const l = getEntries(raw);
  const i = l.findIndex((x:any)=>x.topicId===e.topicId); 
  if (i>=0) Object.assign(l[i], e); else l.push(e); 
  if (!Array.isArray(raw)) raw.entries = l;
  await saveJson(p, Array.isArray(raw) ? l : raw); 
}

async function trackError(isError: boolean) {
  const state = await loadJson(ERROR_STREAK_FILE, { streak: 0 });
  if (isError) {
    state.streak += 1;
    await saveJson(ERROR_STREAK_FILE, state);
    console.log(`[ERROR-STREAK] Increased to ${state.streak}`);
  } else if (state.streak > 0) {
    state.streak = 0;
    await saveJson(ERROR_STREAK_FILE, state);
    console.log('[ERROR-STREAK] Reset to 0');
  }
}

async function generateAI(prompt: string, maxRetries = 2) {
  const keys = (process.env.GEMINI_API_KEYS||process.env.GEMINI_API_KEY||'').split(',').map(x=>x.trim()).filter(Boolean);
  if (!keys.length) throw new Error('GEMINI_API_KEY missing');
  let lastErr;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const k of keys) {
      try {
        const ai = new GoogleGenAI({ apiKey: k });
        const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        if (res.text && res.text.length > 100) return res.text;
      } catch (e: any) { lastErr = e; console.warn(`[WARN] Gemini key failed on attempt ${attempt}: ${e.message}`); }
    }
  }
  throw lastErr || new Error('All AI keys failed after retries');
}

async function loadApprovedFacts(sourceFactIds: readonly string[]): Promise<ContentFact[]> {
  const all: ContentFact[] = await loadJson(path.resolve(process.cwd(), 'data/facts.json'), []);
  if (!sourceFactIds.length) return all;
  const picked = all.filter((fact) => sourceFactIds.includes(fact.factId));
  return picked.length > 0 ? picked : all;
}

async function main() {
  console.log('=== AUTO PUBLISH 2 KÊNH (MAIN + BLOGGER) ===');
  if (process.env.AUTO_PUBLISH_ENABLED !== 'true') return console.log('[KILL-SWITCH] AUTO_PUBLISH_ENABLED=false. Exiting.');

  const errorState = await loadJson(ERROR_STREAK_FILE, { streak: 0 });
  if (errorState.streak >= 2) return console.log('[KILL-SWITCH] Error streak >= 2. Cron disabled until manual intervention.');

  const mainCap = await checkCap(MAIN_LEDGER);
  const bloggerCap = await checkCap(BLOGGER_LEDGER);
  if (mainCap && bloggerCap) return console.log('[CAP] Reached 1 post/day limit on both channels. Exiting.');

  const topics = await loadJson(TOPICS_PATH, []);
  // Pick the first PENDING topic
  // Hàng đợi web chính: topic không gắn channel 'blogger' (thiếu channel = 'main').
  const topic = topics.find(t => t.status === 'PENDING'
    && t.channel !== 'blogger'
    && t.autoPublishEligible !== false);
  if (!topic) return console.log('[QUEUE] No eligible topic found in PENDING.');

  const slug = slugify(topic.title);
  // Domain live thật là autotaxpos.com (autotax.vn hiện KHÔNG phản hồi — đừng dùng làm
  // backlink/Indexing API, sẽ tạo link chết và trượt gate link-policy của Blogger).
  const mainUrl = `https://autotaxpos.com/blog/${slug}`;
  const coverImage = `https://image.pollinations.ai/prompt/${encodeURIComponent(topic.title + ' AutoTax POS professional software interface')}?width=1200&height=630&nologo=true`;
  console.log(`[PROCESS] Topic: ${topic.title}`);


  // 1. MAIN SITE PUBLISH
  if (!mainCap) {
    console.log('[MAIN] Generating...');
    try {
      const approvedFacts = await loadApprovedFacts(topic.sourceFactIds ?? []);
      const mainBody = await generateStandardArticle(topic.title, approvedFacts, generateAI, { log: (m) => console.log(m.replace("[CONTENT]", "[MAIN]")) });
      const content = `---\ntitle: "${topic.title}"\ndescription: "Hướng dẫn chi tiết về ${topic.title}."\npubDate: "${new Date().toISOString()}"\ncoverImage: "${coverImage}"\n---\n\n${mainBody}`;
      await fs.writeFile(path.join(ARTICLES_DIR, `${slug}.md`), content);
      
      console.log('[MAIN] Building Astro...');
      execSync('npm run build', { stdio: 'inherit' });
      // On VPS, Nginx serves directly from dist/, no need to deploy.
      
      // Dùng khóa trong GSC_SERVICE_ACCOUNT_JSON — đường cũ gọi seo-bots/google_indexer.js
      // không tồn tại trên VPS nên chưa bao giờ chạy được.
      const ping = await pingIndexingApi(mainUrl);
      console.log(ping.ok
        ? `[MAIN] Đã báo Google Indexing API — ${ping.detail}`
        : `[MAIN] Không báo được Indexing API (${ping.detail}) — bỏ qua, sitemap vẫn cập nhật.`);

      await recordLedger(MAIN_LEDGER, { date: TODAY, topicId: slug, status: 'COMPLETED', url: mainUrl, imageId: coverImage });
      
      const tIndex = topics.findIndex((t: any) => t.topicId === topic.topicId);
      if (tIndex >= 0) {
        topics[tIndex].status = 'COMPLETED';
        await saveJson(TOPICS_PATH, topics);
      }

      await trackError(false); // Reset streak on success
      console.log('[MAIN] PUBLISHED SUCCESSFULLY.');
    } catch (e: any) {
      console.error('[MAIN] FAILED:', e.message);
      await recordLedger(MAIN_LEDGER, { date: TODAY, topicId: slug, status: 'HOLD', reason: e.message });
      const tIndex = topics.findIndex((t: any) => t.topicId === topic.topicId);
      if (tIndex >= 0) {
        topics[tIndex].status = 'HOLD';
        await saveJson(TOPICS_PATH, topics);
      }
      await trackError(true);
      // KHÔNG return: hai kênh có hàng đợi riêng, nội dung riêng và backlink không còn
      // phụ thuộc URL bài web chính. Web chính trượt gate là chuyện của web chính —
      // chặn luôn Blogger chỉ làm mất thêm một ngày đăng bài mà không được gì.
    }
  }

  // 2. BLOGGER PUBLISH — chạy độc lập với kết quả của web chính
  if (!bloggerCap) {
    console.log('[BLOGGER] Starting worker for independent content...');
    try {
      // Backlink phải đúng approvedDestination trong config/blogger-sites.json (origin + path)
      // và đủ 3 tham số UTM, nếu không html-policy sẽ reject cả bài. Không trỏ thẳng URL bài
      // vừa đăng vì pathname khác "/" sẽ trượt gate.
      const workerEnv = {
        ...process.env,
        AUTOTAX_BLOGGER_BACKLINK: `https://autotaxpos.com/?utm_source=blogger&utm_medium=referral&utm_campaign=${slug}`,
      };
      
      const result = spawnSync('npx', ['tsx', 'scripts/blogger/run-worker.ts'], { env: workerEnv as any, stdio: 'inherit' });
      if (result.status !== 0) {
        throw new Error(`Worker failed with status ${result.status}`);
      }

      await trackError(false); // Reset streak
      console.log('[BLOGGER] FINISHED WORKER SCRIPT.');
    } catch (e: any) {
      console.error('[BLOGGER] FAILED:', e.message);
      await trackError(true);
    }
  }
}

main().catch(async (e) => {
  console.error('[FATAL]', e);
  await trackError(true);
  process.exit(1);
});
