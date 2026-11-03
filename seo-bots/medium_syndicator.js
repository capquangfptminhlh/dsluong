// D:\AutoTax\seo-bots\medium_syndicator.js
const axios = require('axios');

// ==========================================
// CẤU HÌNH BOT MEDIUM (XÂY DỰNG BACKLINK)
// ==========================================
// 1. Vào Medium.com -> Settings -> Security and apps -> Integration tokens
// 2. Điền mã Token vào đây:
const MEDIUM_API_TOKEN = 'YOUR_MEDIUM_INTEGRATION_TOKEN_HERE';

async function autoSyndicateToMedium(title, contentHtml, canonicalUrl) {
  try {
    if (MEDIUM_API_TOKEN === 'YOUR_MEDIUM_INTEGRATION_TOKEN_HERE') {
      console.error('❌ LỖI: Bạn chưa cấu hình MEDIUM_API_TOKEN.');
      return;
    }

    console.log('📡 Đang lấy thông tin User từ Medium...');
    // Lấy User ID
    const userRes = await axios.get('https://api.medium.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${MEDIUM_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    const userId = userRes.data.data.id;
    console.log(`👤 Đã nhận diện User ID: ${userId}`);

    // Bổ sung Backlink dưới cùng bài viết
    const seoContent = `
      ${contentHtml}
      <hr>
      <p><em>Bài viết được xuất bản lần đầu tại <a href="${canonicalUrl}">AutoTax POS - Phần mềm quản lý bán hàng</a>. Đăng ký sử dụng miễn phí ngay hôm nay!</em></p>
    `;

    console.log('🚀 Đang tự động đăng bài lên Medium...');
    const postRes = await axios.post(`https://api.medium.com/v1/users/${userId}/posts`, {
      title: title,
      contentFormat: 'html',
      content: seoContent,
      canonicalUrl: canonicalUrl,
      tags: ['phan mem ban hang', 'ke toan', 'pos', 'kinh doanh'],
      publishStatus: 'public' // Đăng công khai luôn
    }, {
      headers: {
        'Authorization': `Bearer ${MEDIUM_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log('✅ THÀNH CÔNG! Bài viết đã được đồng bộ lên Medium. Bạn đã có 1 Backlink xịn!');
    console.log('🔗 Link bài viết:', postRes.data.data.url);
  } catch (error) {
    console.error('❌ Lỗi khi đăng Medium:', error.response ? error.response.data : error.message);
  }
}

// Chạy Script
const postTitle = process.argv[2];
const postUrl = process.argv[3];

if (!postTitle || !postUrl) {
  console.log('Cách dùng: node medium_syndicator.js "Tiêu đề bài viết" "https://url-goc.com"');
} else {
  // Demo nội dung (Thực tế sẽ lấy từ Database)
  const dummyHtml = `<h1>${postTitle}</h1><p>Đây là nội dung chia sẻ về cách dùng phần mềm hiệu quả để tính thuế...</p>`;
  autoSyndicateToMedium(postTitle, dummyHtml, postUrl);
}
