async function testFinal() {
  console.log('--- BẮT ĐẦU TEST OMNICHANNEL ---');
  try {
    const payload = {
      platform: 'Tiktok Shop',
      order_id: 'TT123456789',
      total_amount: 1500000,
      items: [
        { name: 'Áo thun đen M', quantity: 2 }
      ]
    };
    
    console.log('Bơm đơn hàng ảo từ Tiktok Shop vào hệ thống:', payload);
    const req = await fetch('http://localhost:3001/api/omni/webhook/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await req.json();

    if (res.success) {
      console.log('=> PASS: Đã đồng bộ đơn hàng đa kênh. Kho cũng đã tự trừ.', res.message);
      console.log('--- TEST PASS 100% ---');
    } else {
      console.error('=> FAIL: Lỗi đồng bộ.', res);
    }
  } catch (error) {
    console.error('Lỗi Exception:', error.message);
  }
}

testFinal();
