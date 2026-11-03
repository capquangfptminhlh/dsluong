const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const KEY_PATH = path.join(__dirname, 'google_credentials.json');
const SITE_URL = 'sc-domain:autotaxpos.com'; // Try domain property first

async function getRankings() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    const webmasters = google.webmasters({ version: 'v3', auth });

    // Format date: YYYY-MM-DD
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = today.toISOString().split('T')[0];

    console.log(`Đang lấy dữ liệu GSC từ ${startDate} đến ${endDate} cho ${SITE_URL}...`);

    let response;
    try {
      response = await webmasters.searchanalytics.query({
        siteUrl: SITE_URL,
        requestBody: {
          startDate: startDate,
          endDate: endDate,
          dimensions: ['query'],
          rowLimit: 20,
        },
      });
    } catch (err) {
      // If sc-domain fails, try URL prefix
      if (err.message.includes('User does not have sufficient permission')) {
        console.log('Thử lại với URL prefix (https://autotaxpos.com/)...');
        response = await webmasters.searchanalytics.query({
          siteUrl: 'https://autotaxpos.com/',
          requestBody: {
            startDate: startDate,
            endDate: endDate,
            dimensions: ['query'],
            rowLimit: 20,
          },
        });
      } else {
        throw err;
      }
    }

    const rows = response.data.rows || [];
    if (rows.length === 0) {
      console.log('Không có dữ liệu từ khóa trong khoảng thời gian này.');
      return;
    }

    console.log('\n--- BÁO CÁO THỨ HẠNG TỪ KHÓA (GSC) ---');
    console.log('Từ khóa | Vị trí TB | Click | Impression | CTR');
    console.log('----------------------------------------------------');
    rows.forEach(row => {
      console.log(`${row.keys[0].padEnd(25)} | ${row.position.toFixed(1).padStart(9)} | ${row.clicks.toString().padStart(5)} | ${row.impressions.toString().padStart(10)} | ${(row.ctr * 100).toFixed(2)}%`);
    });

    // Save to a text report
    const reportPath = path.join(__dirname, 'gsc_report.txt');
    const reportContent = rows.map(r => `${r.keys[0]} | Pos: ${r.position.toFixed(1)} | Clicks: ${r.clicks}`).join('\n');
    fs.writeFileSync(reportPath, reportContent);
    console.log(`\nĐã lưu báo cáo tại: ${reportPath}`);

  } catch (error) {
    console.error('Lỗi khi lấy dữ liệu GSC:', error.message);
    if (error.message.includes('User does not have sufficient permission')) {
       console.log('=> LỖI PHÂN QUYỀN: Hãy chắc chắn bạn đã thêm email Service Account (' + require(KEY_PATH).client_email + ') vào Google Search Console của domain với quyền "Restricted" hoặc "Full".');
    }
  }
}

getRankings();
