'use strict';

function unescapeXml(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function extractTag(xml, tag) {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = String(xml || '').match(pattern);
  return match ? unescapeXml(match[1]) : '';
}

function extractNumber(xml, tag) {
  const raw = extractTag(xml, tag);
  if (raw === '') return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`XML_INVALID_NUMBER:${tag}`);
  return value;
}

function parseSimpleInvoiceXml(xml) {
  const source = String(xml || '').trim();
  if (!/^<AutoTaxInvoice[\s>]/i.test(source)) {
    const error = new Error('XML schema chưa được hỗ trợ. Sprint A chỉ nhận canonical AutoTaxInvoice v1.');
    error.code = 'XML_UNSUPPORTED_SCHEMA';
    throw error;
  }

  const invoice = {
    seller_tax_code: extractTag(source, 'SellerTaxCode'),
    buyer_tax_code: extractTag(source, 'BuyerTaxCode'),
    invoice_number: extractTag(source, 'InvoiceNumber'),
    invoice_symbol: extractTag(source, 'InvoiceSymbol'),
    invoice_date: extractTag(source, 'InvoiceDate'),
    subtotal: extractNumber(source, 'Subtotal'),
    vat_amount: extractNumber(source, 'VatAmount'),
    total_amount: extractNumber(source, 'TotalAmount'),
    currency: extractTag(source, 'Currency') || 'VND',
  };

  const lines = [];
  const lineRegex = /<Line>([\s\S]*?)<\/Line>/gi;
  let match;
  let lineNo = 0;
  while ((match = lineRegex.exec(source)) !== null) {
    lineNo += 1;
    const block = match[1];
    lines.push({
      line_no: Number(extractTag(block, 'LineNo')) || lineNo,
      description: extractTag(block, 'Description'),
      quantity: extractNumber(block, 'Quantity'),
      unit_price: extractNumber(block, 'UnitPrice'),
      subtotal: extractNumber(block, 'Subtotal'),
      vat_rate: extractTag(block, 'VatRate') === '' ? null : extractNumber(block, 'VatRate'),
      vat_amount: extractNumber(block, 'VatAmount'),
    });
  }

  return { invoice, lines };
}

module.exports = { parseSimpleInvoiceXml };
