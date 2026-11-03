const XLSX = require('xlsx');

const file = 'C:\\Users\\Lumi Pet\\Downloads\\BaoCaoBanHangTheoThoiGian_KV17072026-123503-033.xlsx';
const workbook = XLSX.readFile(file);
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];

const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

console.log("=== FIRST 10 ROWS ===");
rawArray.slice(0, 10).forEach((row, i) => {
  console.log(`Row ${i}:`, row);
});

// Test the logic
const keywords = ['tên', 'sản phẩm', 'hàng hóa', 'doanh thu', 'số lượng', 'thành tiền', 'diễn giải', 'nội dung', 'giao dịch', 'số tiền', 'mã', 'hàng', 'đơn giá', 'tổng'];
let headerRowIdx = 0;
let maxScore = 0;

for (let i = 0; i < Math.min(rawArray.length, 20); i++) {
  const row = rawArray[i];
  if (!Array.isArray(row)) continue;
  
  let score = 0;
  row.forEach(cell => {
    const lowerStr = String(cell).toLowerCase().trim();
    if (lowerStr && keywords.some(k => lowerStr.includes(k))) score++;
  });
  
  if (score > maxScore) {
    maxScore = score;
    headerRowIdx = i;
  }
}
console.log("\nFound Header Row Idx:", headerRowIdx);
console.log("Header Row:", rawArray[headerRowIdx]);
