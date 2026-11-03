async function testAIAssistant() {
  console.log('--- BẮT ĐẦU TEST AI ASSISTANT ---');
  try {
    const payload = {
      query: 'Hãy cho tôi biết hôm nay doanh thu bao nhiêu và có bao nhiêu khách hàng?'
    };

    console.log(`1. Gửi câu hỏi cho AI: "${payload.query}"`);
    const req = await fetch('http://localhost:3001/api/ai/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!req.ok) {
      console.error('=> FAIL: Gọi API thất bại', await req.text());
      return;
    }

    const data = await req.json();

    if (data.reply) {
      console.log('=> PASS: Nhận được câu trả lời từ AI:\n');
      console.log('\x1b[36m%s\x1b[0m', data.reply);
      console.log('\n--- TEST PASS 100% ---');
    } else {
      console.error('=> FAIL: Không có câu trả lời.', data);
    }
  } catch (error) {
    console.error('Lỗi Exception:', error.message);
  }
}

testAIAssistant();
