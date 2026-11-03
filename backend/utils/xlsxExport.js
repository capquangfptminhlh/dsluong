'use strict';

const XLSX = require('xlsx');

function buildWorkbookBuffer({ sheetName, headers, rows, widths = [] }) {
  const data = [headers, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  if (widths.length) sheet['!cols'] = widths.map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, String(sheetName || 'Data').slice(0, 31));
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
}

function sendXlsx(res, options) {
  const buffer = buildWorkbookBuffer(options);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${options.filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}

module.exports = { buildWorkbookBuffer, sendXlsx };
