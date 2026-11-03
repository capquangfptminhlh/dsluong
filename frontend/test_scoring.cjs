const XLSX = require('xlsx');

const fs = require('fs');
const files = fs.readdirSync('C:\\Users\\Lumi Pet\\Downloads').filter(f => f.startsWith('Income'));
if (files.length > 0) {
    const filePath = 'C:\\Users\\Lumi Pet\\Downloads\\' + files[0];
    const workbook = XLSX.readFile(filePath);
    
    let bestSheetName = '';
    let headerRowIdx = 0;
    let maxScore = 0;
    let bestRawArray = [];
    const keywords = ['tên', 'sản phẩm', 'hàng hóa', 'doanh thu', 'số lượng', 'thành tiền', 'diễn giải', 'nội dung', 'giao dịch', 'số tiền', 'mã', 'hàng', 'đơn giá', 'tổng', 'giá'];

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (rawArray.length === 0) continue;

        for (let i = 0; i < Math.min(rawArray.length, 20); i++) {
            const row = rawArray[i];
            if (!Array.isArray(row)) continue;
            
            let score = 0;
            row.forEach(cell => {
                const lowerStr = String(cell).toLowerCase().trim();
                if (lowerStr && keywords.some(k => lowerStr.includes(k))) score++;
            });
            
            console.log(`Sheet '${sheetName}' Row ${i} score: ${score}`);
            if (score > maxScore) {
                maxScore = score;
                bestSheetName = sheetName;
                headerRowIdx = i;
                bestRawArray = rawArray;
            }
        }
    }
    
    console.log(`\nBest Sheet: ${bestSheetName}, Row: ${headerRowIdx}, Score: ${maxScore}`);
    console.log("Headers:", bestRawArray[headerRowIdx]);
    
} else {
    console.log("File not found");
}
