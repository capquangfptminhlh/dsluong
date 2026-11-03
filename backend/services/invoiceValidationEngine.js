'use strict';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeTaxCode(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function validateArithmetic(invoice, tolerance = 1) {
  const subtotal = toNumber(invoice.subtotal);
  const vat = toNumber(invoice.vat_amount);
  const total = toNumber(invoice.total_amount);
  const expected = subtotal + vat;
  const difference = total - expected;
  return {
    ok: Math.abs(difference) <= tolerance,
    subtotal,
    vat_amount: vat,
    total_amount: total,
    expected_total: expected,
    difference,
  };
}

function buyerTaxCodeMismatch(invoiceBuyerTaxCode, expectedBuyerTaxCode) {
  const actual = normalizeTaxCode(invoiceBuyerTaxCode);
  const expected = normalizeTaxCode(expectedBuyerTaxCode);
  if (!actual || !expected) return false;
  return actual !== expected;
}

function comparePurchaseAmount(invoiceTotal, purchaseTotal, tolerance = 1) {
  const invoice = toNumber(invoiceTotal);
  const purchase = toNumber(purchaseTotal);
  const difference = invoice - purchase;
  return {
    ok: Math.abs(difference) <= tolerance,
    invoice_total: invoice,
    purchase_total: purchase,
    difference,
  };
}

function comparePurchaseInventory(items = [], logs = []) {
  const received = new Map();
  for (const log of logs) {
    if (String(log.type || '').toUpperCase() !== 'IN') continue;
    const productId = String(log.product_id);
    received.set(productId, (received.get(productId) || 0) + toNumber(log.quantity));
  }

  const mismatches = [];
  for (const item of items) {
    const productId = String(item.product_id);
    const expected = toNumber(item.quantity);
    const actual = received.get(productId) || 0;
    if (Math.abs(actual - expected) > 0.000001) {
      mismatches.push({ product_id: item.product_id, product_name: item.product_name, expected, actual });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

module.exports = {
  validateArithmetic,
  buyerTaxCodeMismatch,
  comparePurchaseAmount,
  comparePurchaseInventory,
};
