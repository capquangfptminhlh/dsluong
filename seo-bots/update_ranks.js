/**
 * update_ranks.js — Nối vòng đo lường SEO (P4)
 *
 * Kéo dữ liệu Google Search Console 30 ngày rồi ghi ngược về kho keyword:
 *   seo-engine/data/keywords.json  →  lastRank, clicks, impressions, lastCheckedAt
 * Đồng thời append lịch sử vào seo-bots/rank_history.jsonl để theo dõi xu hướng.
 *
 * Cách chạy:  node update_ranks.js
 * Lịch tuần:  chạy run_update_ranks.bat (hoặc tạo Task Scheduler — xem README_RANKS.md)
 */
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const KEY_PATH = path.join(__dirname, 'google_credentials.json');
const KEYWORDS_PATH = path.join(__dirname, '..', 'seo-engine', 'data', 'keywords.json');
const HISTORY_PATH = path.join(__dirname, 'rank_history.jsonl');
const SITE_URLS = ['sc-domain:autotaxpos.com', 'https://autotaxpos.com/'];

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
}

async function queryGSC(webmasters, siteUrl, startDate, endDate) {
  const res = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: { startDate, endDate, dimensions: ['query'], rowLimit: 1000 },
  });
  return res.data.rows || [];
}

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error('❌ Thiếu google_credentials.json (service account có quyền đọc GSC).');
    process.exit(1);
  }
  if (!fs.existsSync(KEYWORDS_PATH)) {
    console.error('❌ Không tìm thấy kho keyword:', KEYWORDS_PATH);
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  const webmasters = google.webmasters({ version: 'v3', auth });

  const today = new Date();
  const endDate = today.toISOString().split('T')[0];
  const startDate = new Date(today.getTime() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

  let rows = [];
  let lastErr = null;
  for (const siteUrl of SITE_URLS) {
    try {
      console.log(`Đang kéo GSC ${startDate} → ${endDate} cho ${siteUrl}...`);
      rows = await queryGSC(webmasters, siteUrl, startDate, endDate);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.log(`  (thất bại với ${siteUrl}: ${err.message})`);
    }
  }
  if (lastErr) {
    console.error('❌ Không kéo được GSC:', lastErr.message);
    process.exit(1);
  }
  console.log(`✅ GSC trả về ${rows.length} query.`);

  // Map query GSC đã normalize → metrics
  const gscMap = new Map();
  for (const r of rows) {
    gscMap.set(normalize(r.keys[0]), {
      position: Math.round(r.position * 10) / 10,
      clicks: r.clicks,
      impressions: r.impressions,
    });
  }

  const keywords = JSON.parse(fs.readFileSync(KEYWORDS_PATH, 'utf8'));
  const checkedAt = endDate;
  let matched = 0;

  for (const kw of keywords) {
    const target = normalize(kw.keyword);
    // Khớp chính xác trước; nếu không có, lấy query GSC chứa keyword (hoặc ngược lại) có impression cao nhất
    let hit = gscMap.get(target) || null;
    if (!hit) {
      let best = null;
      for (const [q, m] of gscMap) {
        if (q.includes(target) || target.includes(q)) {
          if (!best || m.impressions > best.impressions) best = m;
        }
      }
      hit = best;
    }
    kw.lastCheckedAt = checkedAt;
    if (hit) {
      kw.lastRank = hit.position;
      kw.clicks30d = hit.clicks;
      kw.impressions30d = hit.impressions;
      matched++;
    } else {
      kw.lastRank = null; // chưa vào top 1000 query của site
      kw.clicks30d = 0;
      kw.impressions30d = 0;
    }
    fs.appendFileSync(
      HISTORY_PATH,
      JSON.stringify({ date: checkedAt, keyword: kw.keyword, rank: kw.lastRank, clicks: kw.clicks30d, impressions: kw.impressions30d }) + '\n'
    );
  }

  fs.writeFileSync(KEYWORDS_PATH, JSON.stringify(keywords, null, 2) + '\n', 'utf8');
  console.log(`✅ Đã cập nhật ${KEYWORDS_PATH}`);
  console.log(`   ${matched}/${keywords.length} keyword có dữ liệu GSC; còn lại chưa có impression (bình thường với site mới).`);

  // Cảnh báo bài cần refresh: đã published nhưng rank tụt sâu hoặc mất tích
  const needRefresh = keywords.filter(k => k.status === 'published' && (k.lastRank === null || k.lastRank > 20));
  if (needRefresh.length) {
    console.log('\n⚠️ Bài nên đưa vào hàng đợi REFRESH (published nhưng rank null hoặc >20):');
    needRefresh.forEach(k => console.log(`   - ${k.keyword} (rank: ${k.lastRank ?? 'không có'})`));
  }
}

main();
