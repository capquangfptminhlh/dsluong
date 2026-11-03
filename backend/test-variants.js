async function testVariants() {
  console.log('--- BẮT ĐẦU TEST SẢN PHẨM ĐA BIẾN THỂ ---');
  try {
    const payload = {
      name: 'Áo khoác gió thể thao',
      category: 'Thời trang',
      variants: [
        { sku: 'AKG-DEN-M', attributes: { color: 'Đen', size: 'M' }, price: 350000, cost_price: 200000, stock: 10 },
        { sku: 'AKG-DEN-L', attributes: { color: 'Đen', size: 'L' }, price: 350000, cost_price: 200000, stock: 15 },
        { sku: 'AKG-DEN-XL', attributes: { color: 'Đen', size: 'XL' }, price: 350000, cost_price: 200000, stock: 5 },
        { sku: 'AKG-TRANG-M', attributes: { color: 'Trắng', size: 'M' }, price: 350000, cost_price: 200000, stock: 20 },
        { sku: 'AKG-TRANG-L', attributes: { color: 'Trắng', size: 'L' }, price: 350000, cost_price: 200000, stock: 25 },
        { sku: 'AKG-TRANG-XL', attributes: { color: 'Trắng', size: 'XL' }, price: 350000, cost_price: 200000, stock: 8 }
      ]
    };

    console.log('1. Gửi request tạo sản phẩm với 6 biến thể (2 màu x 3 size)...');
    const createReq = await fetch('http://localhost:3001/api/products/with-variants', {
      method: 'POST',
      headers: { 
        'x-user-id': 'default_user',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const createData = await createReq.json();

    if (createData.success && createData.variants_created === 6) {
      console.log('=> PASS: Tạo thành công. Product ID:', createData.product_id);
    } else {
      console.error('=> FAIL: Lỗi tạo biến thể.', createData);
      return;
    }

    console.log('2. Lấy danh sách sản phẩm để kiểm tra mapping...');
    const getReq = await fetch('http://localhost:3001/api/products', {
      headers: { 'x-user-id': 'default_user' }
    });
    const getData = await getReq.json();

    const createdProduct = getData.find(p => p.id === createData.product_id);
    if (!createdProduct) {
      console.error('=> FAIL: Không tìm thấy sản phẩm vừa tạo trong DB.');
      return;
    }

    if (createdProduct.variants && createdProduct.variants.length === 6) {
      console.log('=> PASS: Lấy được mảng variants đính kèm. Số lượng đúng 6.');
      console.log('   Ví dụ Variant 1:', createdProduct.variants[0].sku, createdProduct.variants[0].attributes);
    } else {
      console.error('=> FAIL: Mảng variants bị sai lệch.', createdProduct.variants);
      return;
    }

    console.log('--- TEST PASS 100% ---');
  } catch (error) {
    console.error('Lỗi Exception:', error.message);
  }
}

testVariants();
