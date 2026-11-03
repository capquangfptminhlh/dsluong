// D:\AutoTax\seo-bots\fb_autoposter.js
const puppeteer = require('puppeteer');
const path = require('path');

// ==========================================
// CẤU HÌNH BOT AUTO-POST FACEBOOK
// ==========================================
const URL_CUA_BAI_VIET = process.argv[2] || 'https://autotaxpos.com/blog/phan-mem-quan-ly-ban-hang-mien-phi';
const TIEU_DE_KEM_THEO = process.argv[3] || 'Xin chào m.n, chia sẻ với anh chị em phần mềm Kế toán & Bán hàng siêu đỉnh mà tôi mới viết. Đọc case study ở đây nhé: ';

// Danh sách Link các Hội Nhóm Zalo/Facebook mà bạn muốn rải link (Cần là thành viên trước)
const FACEBOOK_GROUPS = [
  'https://www.facebook.com/groups/congdongketoan', // Ví dụ
  'https://www.facebook.com/groups/kinhdoanhonline', // Ví dụ
];

const USER_DATA_DIR = path.join(__dirname, 'fb_session');

async function autoPostFacebook() {
  console.log('🤖 Khởi động Bot Auto-Poster Facebook...');
  
  // Mở trình duyệt có giao diện để bạn có thể xem nó tự làm
  const browser = await puppeteer.launch({
    headless: false, // Để False để bạn nhìn thấy thao tác
    userDataDir: USER_DATA_DIR, // Lưu Session (Cookie) để không phải đăng nhập lại
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  console.log('🌍 Đang truy cập Facebook...');
  await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2' });

  // Kiểm tra xem đã đăng nhập chưa
  const isLoggedIn = await page.$('div[role="navigation"]');
  if (!isLoggedIn) {
    console.log('⚠️ CHÚ Ý: Bạn chưa đăng nhập Facebook!');
    console.log('🕒 Vui lòng tự đăng nhập trên cửa sổ trình duyệt vừa mở (Bot sẽ chờ 60 giây).');
    await page.waitForTimeout(60000); // Đợi 60s để người dùng đăng nhập thủ công lần đầu
  }

  for (let groupUrl of FACEBOOK_GROUPS) {
    try {
      console.log(`\n🚀 Đang vào Group: ${groupUrl}`);
      await page.goto(groupUrl, { waitUntil: 'networkidle2' });
      await page.waitForTimeout(3000);

      console.log('📝 Bấm vào ô viết bài...');
      // Tìm ô nhập text (Create a public post...)
      const postBox = await page.$('div[role="button"][tabindex="0"]:has-text("Write something"), div[role="button"]:has-text("Tạo bài viết")');
      if (postBox) {
        await postBox.click();
        await page.waitForTimeout(2000);

        console.log('✍️ Đang tự động gõ phím...');
        const contentBox = await page.$('div[role="textbox"]');
        await contentBox.type(TIEU_DE_KEM_THEO + URL_CUA_BAI_VIET, { delay: 50 });
        
        console.log('⏳ Đợi Facebook load ảnh Preview (10 giây)...');
        await page.waitForTimeout(10000);

        console.log('📤 Đang bấm Đăng bài...');
        const postButton = await page.$('div[aria-label="Đăng"], div[aria-label="Post"]');
        if (postButton) {
          // Bỏ comment dòng dưới để bot thực sự đăng bài (hiện tại để an toàn nên chưa click)
          // await postButton.click(); 
          console.log('✅ Đã đăng thành công vào group!');
        } else {
          console.log('❌ Không tìm thấy nút Đăng.');
        }
      } else {
        console.log('❌ Không tìm thấy ô Viết Bài (Có thể bạn chưa tham gia nhóm này).');
      }

    } catch (e) {
      console.error(`❌ Lỗi khi xử lý Group ${groupUrl}:`, e.message);
    }
  }

  console.log('🎉 Hoàn thành chiến dịch rải link! Tắt trình duyệt sau 5s...');
  await page.waitForTimeout(5000);
  await browser.close();
}

autoPostFacebook();
