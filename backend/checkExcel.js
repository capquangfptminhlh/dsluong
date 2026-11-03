const xlsx = require('xlsx');

const workbook = xlsx.readFile('C:\\Users\\Lumi Pet\\Downloads\\ma-so-don-vi-hanh-chinh.xlsx');
console.log(workbook.SheetNames);
