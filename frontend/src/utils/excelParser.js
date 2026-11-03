import * as XLSX from 'xlsx';

export const parseExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let bestRawArray = [];
        let headerRowIdx = 0;
        let maxScore = 0;
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
            
            if (score > maxScore) {
              maxScore = score;
              headerRowIdx = i;
              bestRawArray = rawArray;
            }
          }
        }

        if (bestRawArray.length === 0) {
          throw new Error('File Excel không có dữ liệu hoặc không đúng định dạng báo cáo');
        }

        const headerRow = bestRawArray[headerRowIdx] || [];
        const dataRows = bestRawArray.slice(headerRowIdx + 1);
        
        // Build JSON objects using the found header row
        const jsonData = dataRows.map(row => {
          const obj = {};
          headerRow.forEach((colName, idx) => {
             const key = colName ? String(colName).trim() : `__EMPTY_${idx}`;
             obj[key] = row[idx];
          });
          return obj;
        });
        
        if (jsonData.length === 0) {
          throw new Error('Không tìm thấy dữ liệu hợp lệ trong file');
        }

        // 1. Chuẩn hóa tên cột
        const normalizedData = normalizeColumns(jsonData);

        // 2. Lấy danh sách sản phẩm duy nhất và gom nhóm, tính tổng doanh thu
        const { products, mappedData } = extractAndGroupProducts(normalizedData);

        resolve({
          raw: mappedData,
          products: products
        });
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

const normalizeColumns = (data) => {
  const namePriorities = [
    'tên sản phẩm', 'product name', 'tên hàng', 'sản phẩm', 'hàng hóa', 'item', 
    'nội dung chi tiết', 'diễn giải', 'nội dung', 'chi tiết', 'mô tả', 'description', 'giao dịch', 'khách hàng'
  ];
  
  const revenuePriorities = [
    'tổng tiền đã thanh toán', 'tổng thanh toán', 'doanh thu theo giao dịch', 'doanh thu thuần', 'thực thu', 'doanh thu', 'thành tiền', 'tổng tiền theo giao dịch', 'tổng tiền', 'tổng cộng', 'giá sản phẩm', 
    'ghi có', 'credit', 'có', 'tiền vào', 'số tiền'
  ];
  
  const debitColumns = ['ghi nợ', 'nợ', 'debit', 'tiền ra'];
  const quantityColumns = ['số lượng', 'quantity', 'sl'];
  
  const excludeName = ['ngày', 'date', 'thời gian', 'time', 'stt', 'số thứ tự'];
  const excludeRevenue = ['số dư', 'balance', 'dư cuối', 'tiền hàng', 'giá vốn', 'lợi nhuận', 'giảm giá'];

  const sampleRow = data.length > 0 ? data.find(row => Object.keys(row).length > 2) || data[0] : data[0];
  const keys = Object.keys(sampleRow);
  
  let nameCandidates = [];
  let revenueCandidates = [];
  let debitKey = '';
  let qtyKey = '';

  keys.forEach(k => {
    const lowerK = String(k).toLowerCase().trim();
    
    const nameMatchIdx = namePriorities.findIndex(n => lowerK.includes(n));
    if (nameMatchIdx !== -1 && !excludeName.some(e => lowerK.includes(e))) {
      nameCandidates.push({ key: k, priority: nameMatchIdx });
    }
    
    const revMatchIdx = revenuePriorities.findIndex(r => lowerK.includes(r));
    if (revMatchIdx !== -1 && !excludeRevenue.some(e => lowerK.includes(e))) {
      revenueCandidates.push({ key: k, priority: revMatchIdx });
    }

    if (!debitKey && debitColumns.some(d => lowerK.includes(d))) debitKey = k;
    if (!qtyKey && quantityColumns.some(q => lowerK === q || lowerK.includes('số lượng'))) qtyKey = k;
  });

  // Sort candidates by priority (lowest index is best)
  nameCandidates.sort((a, b) => a.priority - b.priority);
  revenueCandidates.sort((a, b) => a.priority - b.priority);

  let nameKey = nameCandidates.length > 0 ? nameCandidates[0].key : '';
  let revenueKey = revenueCandidates.length > 0 ? revenueCandidates[0].key : '';

  // Fallbacks
  if (!nameKey) {
    nameKey = keys.find(k => typeof sampleRow[k] === 'string' && !excludeName.some(e => String(k).toLowerCase().includes(e))) || keys[0];
  }
  if (!revenueKey) {
    revenueKey = keys.find(k => typeof sampleRow[k] === 'number' && !excludeRevenue.some(e => String(k).toLowerCase().includes(e))) || keys[1];
  }

  return data.map(row => {
    // Xử lý doanh thu (Ghi Có)
    // Cần giữ lại dấu '-' nếu có để phân biệt ghi nợ/có chung cột
    let rawStr = String(row[revenueKey] || '0');
    let isNegative = rawStr.includes('-');
    let rawRev = rawStr.replace(/[^\d.]/g, ''); // chỉ giữ số và dấu chấm thập phân
    let revenue = parseFloat(rawRev) || 0;
    if (isNegative) revenue = -revenue;
    
    // Nếu chỉ có cột "số tiền" và giá trị âm, ta loại bỏ (không phải doanh thu)
    if (!debitKey && revenue < 0) {
      revenue = 0;
    }

    let qty = parseFloat(String(row[qtyKey] || '1').replace(/[^\d.-]/g, '')) || 1;

    return {
      ...row,
      normalizedName: String(row[nameKey] || 'Không xác định').trim(),
      normalizedRevenue: revenue,
      normalizedQty: qty
    };
  }).filter(row => row.normalizedRevenue > 0 && row.normalizedName !== '-' && row.normalizedName !== '');
};

const extractAndGroupProducts = (data) => {
  const productMap = new Map();

  data.forEach(item => {
    let name = item.normalizedName;
    if (!name) return;

    // Gom nhóm đơn giản bằng cách lấy 3 từ đầu tiên hoặc cắt trước dấu '-'
    // VD: "Royal Canin Mini" -> "Royal Canin"
    let groupName = name;
    if (name.includes('-')) {
      groupName = name.split('-')[0].trim();
    } else {
      const words = name.split(' ');
      if (words.length > 3) {
        groupName = words.slice(0, 3).join(' ');
      }
    }

    if (!productMap.has(groupName)) {
      productMap.set(groupName, {
        groupName,
        sampleNames: new Set([name]),
        totalRevenue: 0,
        totalQty: 0,
        itemCount: 0,
        category: null // Chưa phân loại
      });
    }

    const group = productMap.get(groupName);
    group.sampleNames.add(name);
    group.totalRevenue += item.normalizedRevenue;
    group.totalQty += item.normalizedQty;
    group.itemCount += 1;
    item.groupName = groupName;
  });

  const products = Array.from(productMap.values()).map(p => ({
    ...p,
    sampleNames: Array.from(p.sampleNames).slice(0, 3), // Giữ 3 tên mẫu
    totalSampleCount: p.sampleNames.size
  }));

  // Sắp xếp theo doanh thu giảm dần
  products.sort((a, b) => b.totalRevenue - a.totalRevenue);

  return { products, mappedData: data };
};
