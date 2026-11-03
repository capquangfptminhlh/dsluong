// D:\AutoTax\seo-bots\google_indexer.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ==========================================
// CẤU HÌNH BOT GOOGLE INDEX
// ==========================================
// 1. Tải file Service Account JSON từ Google Cloud Console
// 2. Lưu tên file thành 'service_account.json' và để cùng thư mục với file này.
const KEY_PATH = path.join(__dirname, 'service_account.json');

async function notifyGoogle(url) {
  try {
    if (!fs.existsSync(KEY_PATH)) {
      console.error('❌ LỖI: Không tìm thấy file service_account.json!');
      console.log('Vui lòng tạo Service Account trên Google Cloud và tải file JSON về để vào thư mục seo-bots.');
      return;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    const client = await auth.getClient();
    const indexing = google.indexing({ version: 'v3', auth: client });

    console.log(`🚀 Đang bắn tín hiệu ép Google Index cho URL: ${url}...`);

    const res = await indexing.urlNotifications.publish({
      requestBody: {
        url: url,
        type: 'URL_UPDATED'
      }
    });

    console.log('✅ THÀNH CÔNG! Google đã ghi nhận yêu cầu. Bot sẽ thu thập dữ liệu sớm nhất.');
    console.log(res.data);
  } catch (error) {
    console.error('❌ Thất bại:', error.message);
  }
}

// Chạy Bot
const urlToUpdate = process.argv[2];
if (!urlToUpdate) {
  console.log('Cách dùng: node google_indexer.js <URL_CUA_BAI_VIET>');
  console.log('Ví dụ: node google_indexer.js https://autotaxpos.com/blog/phan-mem-quan-ly-ban-hang-mien-phi');
} else {
  notifyGoogle(urlToUpdate);
}
