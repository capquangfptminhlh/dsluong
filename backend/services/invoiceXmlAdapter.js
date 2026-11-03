'use strict';

const { parseSimpleInvoiceXml } = require('./simpleInvoiceXml');

const MAX_XML_BYTES = 2 * 1024 * 1024;

function xmlError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function decodeXml(value = '') {
  return String(value)
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function openingTag(tag) {
  return `<(?:[A-Za-z_][\\w.-]*:)?${tag}\\b[^>]*>`;
}

function closingTag(tag) {
  return `<\\/(?:[A-Za-z_][\\w.-]*:)?${tag}\\s*>`;
}

function extractBlocks(xml, tag) {
  const pattern = new RegExp(`${openingTag(tag)}([\\s\\S]*?)${closingTag(tag)}`, 'gi');
  const blocks = [];
  let match;
  while ((match = pattern.exec(String(xml || ''))) !== null) blocks.push(match[1]);
  return blocks;
}

function extractBlock(xml, tag) {
  return extractBlocks(xml, tag)[0] || '';
}

function extractText(xml, tag) {
  const block = extractBlock(xml, tag);
  if (block === '') return '';
  if (/<(?:[A-Za-z_][\w.-]*:)?[A-Za-z_][\w.-]*\b/i.test(block)) {
    throw xmlError('XML_UNEXPECTED_NESTED_VALUE', `Trường ${tag} có cấu trúc XML lồng không được hỗ trợ.`);
  }
  return decodeXml(block);
}

function extractNumber(xml, tag, { required = false, fallback = 0 } = {}) {
  const raw = extractText(xml, tag);
  if (raw === '') {
    if (required) throw xmlError('XML_MISSING_FIELD', `Thiếu trường XML bắt buộc: ${tag}`);
    return fallback;
  }
  const value = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(value)) throw xmlError('XML_INVALID_NUMBER', `Trường ${tag} không phải số hợp lệ.`);
  return value;
}

function normalizeXml(xml) {
  let source = String(xml || '').replace(/^\uFEFF/, '').trim();
  if (!source) throw xmlError('XML_EMPTY', 'File XML rỗng.');
  if (Buffer.byteLength(source, 'utf8') > MAX_XML_BYTES) {
    throw xmlError('XML_TOO_LARGE', 'File XML vượt quá giới hạn 2 MB của bước nhập hóa đơn.');
  }
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(source)) {
    throw xmlError('XML_UNSAFE_DECLARATION', 'XML chứa DOCTYPE/ENTITY nên bị từ chối để tránh xử lý không an toàn.');
  }
  source = source.replace(/^<\?xml[\s\S]*?\?>\s*/i, '').trim();
  return source;
}

function hasTag(xml, tag) {
  return new RegExp(openingTag(tag), 'i').test(String(xml || ''));
}

function parseTaxRate(raw) {
  const text = String(raw || '').trim().toUpperCase();
  if (!text || ['KCT', 'KKKNT'].includes(text)) return null;
  const match = text.match(/^(-?\d+(?:\.\d+)?)%?$/);
  return match ? Number(match[1]) : null;
}

function provenanceMetadata(source, { family, version = null } = {}) {
  const wrappedMessage = hasTag(source, 'TDiep');
  const signaturePresent = hasTag(source, 'Signature');
  return {
    family,
    version,
    wrapped_message: wrappedMessage,
    wrapper_type: wrappedMessage ? 'TDIEP' : null,
    message_code: extractText(source, 'MTDiep') || null,
    tax_authority_code: extractText(source, 'MCCQT') || null,
    signature_present: signaturePresent,
    signature_verification_status: signaturePresent ? 'NOT_VERIFIED' : 'NOT_PRESENT',
  };
}

function parseTctInvoiceXml(source) {
  const invoiceBlocks = extractBlocks(source, 'HDon');
  if (invoiceBlocks.length !== 1) {
    if (invoiceBlocks.length === 0) throw xmlError('XML_UNSUPPORTED_SCHEMA', 'Không tìm thấy thẻ HDon của hóa đơn điện tử.');
    throw xmlError('XML_MULTIPLE_INVOICES', 'File chứa nhiều hơn một HDon; hãy nhập từng hóa đơn riêng để tránh ghép nhầm dữ liệu.');
  }

  const hdon = invoiceBlocks[0];
  const dlhDon = extractBlock(hdon, 'DLHDon');
  const ttChung = extractBlock(dlhDon, 'TTChung');
  const ndhDon = extractBlock(dlhDon, 'NDHDon');
  if (!dlhDon || !ttChung || !ndhDon) {
    throw xmlError('XML_UNSUPPORTED_SCHEMA', 'HDon không có đủ DLHDon/TTChung/NDHDon theo family TCT_HDON.');
  }

  const seller = extractBlock(ndhDon, 'NBan');
  const buyer = extractBlock(ndhDon, 'NMua');
  const payment = extractBlock(ndhDon, 'TToan');
  if (!seller || !payment) {
    throw xmlError('XML_UNSUPPORTED_SCHEMA', 'Hóa đơn thiếu NBan hoặc TToan nên AutoTax không thể chuẩn hóa an toàn.');
  }

  const sellerTaxCode = extractText(seller, 'MST');
  const buyerTaxCode = buyer ? extractText(buyer, 'MST') : '';
  const invoiceNumber = extractText(ttChung, 'SHDon');
  const invoiceSymbol = extractText(ttChung, 'KHHDon');
  const invoiceDate = extractText(ttChung, 'NLap') || extractText(ttChung, 'TDLap');
  const currency = extractText(ttChung, 'DVTTe');
  const version = extractText(ttChung, 'PBan') || null;

  if (!sellerTaxCode) throw xmlError('XML_MISSING_FIELD', 'Thiếu MST người bán trong NBan.');
  if (!invoiceNumber) throw xmlError('XML_MISSING_FIELD', 'Thiếu số hóa đơn SHDon.');
  if (!invoiceDate) throw xmlError('XML_MISSING_FIELD', 'Thiếu ngày lập hóa đơn NLap/TDLap.');
  if (!currency) throw xmlError('XML_MISSING_FIELD', 'Thiếu đơn vị tiền tệ DVTTe.');

  const subtotal = extractNumber(payment, 'TgTCThue', { required: true });
  const vatAmount = extractNumber(payment, 'TgTThue', { fallback: 0 });
  const totalAmount = extractNumber(payment, 'TgTTTBSo', { required: true });

  const lineContainer = extractBlock(ndhDon, 'DSHHDVu');
  const lineBlocks = lineContainer ? extractBlocks(lineContainer, 'HHDVu') : [];
  const lines = lineBlocks.map((line, index) => {
    const rateRaw = extractText(line, 'TSuat');
    return {
      line_no: Number(extractText(line, 'STT')) || index + 1,
      description: extractText(line, 'THHDVu') || extractText(line, 'Ten'),
      quantity: extractNumber(line, 'SLuong', { fallback: 0 }),
      unit_price: extractNumber(line, 'DGia', { fallback: 0 }),
      subtotal: extractNumber(line, 'ThTien', { fallback: 0 }),
      vat_rate: parseTaxRate(rateRaw),
      vat_amount: extractNumber(line, 'TThue', { fallback: 0 }),
    };
  });

  return {
    schema: provenanceMetadata(source, { family: 'TCT_HDON', version }),
    invoice: {
      seller_tax_code: sellerTaxCode,
      buyer_tax_code: buyerTaxCode,
      invoice_number: invoiceNumber,
      invoice_symbol: invoiceSymbol,
      invoice_date: invoiceDate,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      currency,
    },
    lines,
  };
}

function parseSupportedInvoiceXml(xml) {
  const source = normalizeXml(xml);

  if (hasTag(source, 'AutoTaxInvoice')) {
    const parsed = parseSimpleInvoiceXml(source);
    return {
      ...parsed,
      schema: provenanceMetadata(source, { family: 'AUTOTAX_CANONICAL', version: '1' }),
      source_type: 'XML_CANONICAL_V1',
      raw_xml: String(xml || ''),
    };
  }

  if (hasTag(source, 'HDon')) {
    const parsed = parseTctInvoiceXml(source);
    return {
      ...parsed,
      source_type: 'XML_TCT_HDON',
      raw_xml: String(xml || ''),
    };
  }

  throw xmlError('XML_UNSUPPORTED_SCHEMA', 'XML chưa thuộc schema hóa đơn mà AutoTax nhận diện chắc chắn.');
}

module.exports = {
  MAX_XML_BYTES,
  parseSupportedInvoiceXml,
  parseTctInvoiceXml,
};
