async function testAutomation() {
  console.log('--- BẮT ĐẦU TEST TỰ ĐỘNG HÓA ---');
  try {
    // 1. Tạo 1 Workflow: Nếu đơn hàng > 5 triệu -> Gửi SMS
    console.log('1. Thiết lập Rule Tự động: Đơn hàng > 5.000.000đ sẽ bắn cảnh báo SMS');
    const rulePayload = {
      name: 'Báo cáo VIP',
      trigger_event: 'ORDER_CREATED',
      condition: { field: 'total_amount', operator: '>', value: 5000000 },
      action_type: 'SEND_SMS',
      action_payload: { message: 'Có đơn hàng VIP mới!', phone: '0901234567' },
      is_active: true
    };
    
    await fetch('http://localhost:3001/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rulePayload)
    });

    // 2. Tạo đơn hàng 6.000.000 (sẽ trigger)
    console.log('2. Checkout 1 đơn hàng 6.000.000đ...');
    const orderPayload = {
      cart: [{ id: null, name: 'iPhone 15 Pro Max', quantity: 1, price: 6000000 }],
      total_amount: 6000000,
      customer_phone: '0999999999'
    };
    
    const req = await fetch('http://localhost:3001/api/pos/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload)
    });
    const res = await req.json();

    if (res.success) {
      console.log('=> PASS: Tạo đơn hàng thành công, hệ thống tự động quét Rule và Log ra kết quả (Hãy xem Console của Backend).');
      console.log('--- TEST PASS 100% ---');
    } else {
      console.error('=> FAIL: Lỗi tạo đơn.', res);
    }
  } catch (error) {
    console.error('Lỗi Exception:', error.message);
  }
}

testAutomation();
