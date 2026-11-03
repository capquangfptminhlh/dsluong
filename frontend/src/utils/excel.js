import * as XLSX from 'xlsx';

/**
 * Xuất một bảng ra file Excel.
 *
 * @param {Array<Object>} rows  Dữ liệu thô
 * @param {Array<{key:string,label:string,format?:Function}>} cols  Cột cần xuất
 * @param {string} tenFile      Tên file (không cần .xlsx)
 * @param {string} tenSheet     Tên sheet
 */
export function xuatExcel(rows, cols, tenFile, tenSheet = 'Dữ liệu') {
  if (!rows || rows.length === 0) {
    alert('Không có dữ liệu để xuất!');
    return;
  }
  const data = rows.map((r) => {
    const o = {};
    cols.forEach((c) => {
      const v = r[c.key];
      o[c.label] = c.format ? c.format(v, r) : (v ?? '');
    });
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  // Ước lượng độ rộng cột theo nội dung dài nhất
  ws['!cols'] = cols.map((c) => {
    const dai = Math.max(
      c.label.length,
      ...data.map((d) => String(d[c.label] ?? '').length)
    );
    return { wch: Math.min(Math.max(dai + 2, 10), 45) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tenSheet.slice(0, 31));
  const ngay = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${tenFile}-${ngay}.xlsx`);
}

/** Định dạng tiền cho cột Excel (giữ dạng số để còn tính toán được) */
export const tien = (v) => Number(v || 0);

/** Cắt phần giờ, chỉ giữ ngày */
export const chiNgay = (v) => (v ? String(v).replace('T', ' ').split(' ')[0] : '');
