const XLSX = require('xlsx');

function checkTemplate() {
  const workbook = XLSX.readFile('templates/To-Khai-01-CNKD.xlsx', { cellDates: true, cellText: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = sheet[address];
      const value = cell?.w ?? cell?.v;
      if (value !== undefined && value !== null && String(value).length > 0) {
        console.log(`[R${row + 1}C${col + 1}]: ${String(value).substring(0, 50)}`);
      }
    }
  }
}

try {
  checkTemplate();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
