const axios = require('axios');

async function testWebhook() {
  const orderCode = process.argv[2] || 'ORD-1234'; // Pass order code as arg, e.g. node test-vietqr.js ORD-1721245
  console.log(`[BANK SIMULATOR] Nhận được tiền vào tài khoản. Nội dung: "Thanh toan don hang ${orderCode}"`);
  
  const payload = {
    data: [
      {
        description: `Thanh toan don hang ${orderCode}`,
        amount: 50000,
        tid: "BANK-999999"
      }
    ]
  };

  try {
    const res = await axios.post('http://localhost:3001/api/pos/vietqr-webhook', payload);
    console.log('[BANK SIMULATOR] Gửi Webhook về hệ thống ERP thành công!', res.data);
  } catch (err) {
    console.error('[BANK SIMULATOR] Lỗi gửi webhook:', err.message);
  }
}

testWebhook();
