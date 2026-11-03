const XLSX = require('xlsx');

const fs = require('fs');
const files = fs.readdirSync('C:\\Users\\Lumi Pet\\Downloads').filter(f => f.startsWith('Income'));
if (files.length > 0) {
    const filePath = 'C:\\Users\\Lumi Pet\\Downloads\\' + files[0];
    const workbook = XLSX.readFile(filePath);
    
    const worksheet = workbook.Sheets['Doanh thu'];
    if (worksheet) {
        const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const headers = rawArray[2];
        const orderIdIdx = headers.indexOf('Mã đơn hàng');
        const skuNameIdx = headers.indexOf('Tên sản phẩm');
        const orderTypeIdx = headers.indexOf('Đơn hàng / Sản phẩm');
        const totalPaidIdx = headers.indexOf('Tổng tiền đã thanh toán');
        const productPriceIdx = headers.indexOf('Giá sản phẩm');
        
        let foundMultiSkuOrder = false;
        
        for (let i = 3; i < rawArray.length - 1; i++) {
            if (rawArray[i][orderTypeIdx] === 'Order') {
                // Count how many Sku rows follow this order
                let skuCount = 0;
                let j = i + 1;
                while (j < rawArray.length && rawArray[j][orderTypeIdx] === 'Sku') {
                    skuCount++;
                    j++;
                }
                
                if (skuCount > 1 && !foundMultiSkuOrder) {
                    foundMultiSkuOrder = true;
                    console.log(`Found multi-sku order: ${rawArray[i][orderIdIdx]}`);
                    console.log(`Order Row: Total Paid=${rawArray[i][totalPaidIdx]}, Price=${rawArray[i][productPriceIdx]}`);
                    for (let k = i + 1; k < i + 1 + skuCount; k++) {
                        console.log(`  Sku Row: Name='${rawArray[k][skuNameIdx]}', Total Paid=${rawArray[k][totalPaidIdx]}, Price=${rawArray[k][productPriceIdx]}`);
                    }
                }
            }
        }
    }
}
