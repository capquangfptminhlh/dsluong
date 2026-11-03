const xlsx = require('xlsx');
const fs = require('fs');

const workbook = xlsx.readFile('C:\\Users\\Lumi Pet\\Downloads\\ma-so-don-vi-hanh-chinh.xlsx');
const sheetName = workbook.SheetNames[1]; // Phụ lục 2. Cấp xã
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const locations = {};

for (let i = 5; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length < 4) continue;
  
  const ward = (row[2] || '').toString().trim();
  let province = (row[3] || '').toString().trim();
  
  if (province.startsWith('Thành phố ')) province = province.replace('Thành phố ', '');
  if (province.startsWith('Tỉnh ')) province = province.replace('Tỉnh ', '');
  if (!ward || !province) continue;

  if (!locations[province]) {
    locations[province] = { wards: [] };
  }
  
  locations[province].wards.push({
    name: ward,
    taxOffice: `Cơ quan Thuế Khu vực ${province}`
  });
}

fs.writeFileSync(
  'C:\\Users\\Lumi Pet\\.gemini\\antigravity\\scratch\\autotax\\frontend\\src\\data\\locations.json',
  JSON.stringify(locations, null, 2),
  'utf8'
);
console.log('Locations generated successfully!');
