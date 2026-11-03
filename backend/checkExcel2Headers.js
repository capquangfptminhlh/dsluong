const xlsx = require('xlsx');

const workbook = xlsx.readFile('C:\\Users\\Lumi Pet\\Downloads\\ma-so-don-vi-hanh-chinh.xlsx');
const sheetName = workbook.SheetNames[1]; // Phụ lục 2. Cấp xã
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log(data[4]); // Header row
console.log(data[6]); // First data row
