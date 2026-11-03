const XLSX = require('xlsx');

const fs = require('fs');
const files = fs.readdirSync('C:\\Users\\Lumi Pet\\Downloads').filter(f => f.startsWith('Income'));
if (files.length > 0) {
    const filePath = 'C:\\Users\\Lumi Pet\\Downloads\\' + files[0];
    const workbook = XLSX.readFile(filePath);
    
    const worksheet = workbook.Sheets['Doanh thu'];
    if (worksheet) {
        const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        // Print rows 3, 4, 5, 6, 7
        for (let i = 3; i < 8; i++) {
            console.log(`Sheet Doanh thu Row ${i}:`, rawArray[i].slice(0, 15)); // print first 15 columns to avoid clutter
        }
    } else {
        console.log("Sheet Doanh thu not found");
    }
} else {
    console.log("File not found");
}
