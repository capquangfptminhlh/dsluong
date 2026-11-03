import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateMinimumAmountRule } = require('./services/legalRuleEngine');
const {
  validateArithmetic,
  buyerTaxCodeMismatch,
  comparePurchaseInventory,
} = require('./services/invoiceValidationEngine');
const { parseSimpleInvoiceXml } = require('./services/simpleInvoiceXml');
const { parseSupportedInvoiceXml } = require('./services/invoiceXmlAdapter');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function assertThrowsCode(fn, code, message) {
  try {
    fn();
  } catch (error) {
    assert(error?.code === code, `${message}: expected ${code}, got ${error?.code || error?.message}`);
    return;
  }
  throw new Error(`${message}: expected throw ${code}`);
}

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  const allowed = expected === undefined ? null : (Array.isArray(expected) ? expected : [expected]);
  if (allowed) assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  else assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  return { status: response.status, data };
}

async function register(phone, name) {
  const { data } = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: ['Audit', 'Compliance', '2026', '!'].join(''), sector: 'retail' },
    expected: 200,
  });
  assert(data?.token, `Register ${phone} missing token`);
  return data;
}

// Pure rule boundary test uses a fake fixture only. This is NOT a production legal rule.
const fakeRule = { parameters: { minimum_amount: 5000000 } };
assert(evaluateMinimumAmountRule({ amount: 4999999, rule: fakeRule }).matched === false, 'Fake rule lower boundary failed');
assert(evaluateMinimumAmountRule({ amount: 5000000, rule: fakeRule }).matched === true, 'Fake rule exact boundary failed');
assert(evaluateMinimumAmountRule({ amount: 5000001, rule: fakeRule }).matched === true, 'Fake rule upper boundary failed');
assert(evaluateMinimumAmountRule({ amount: 5000000, rule: null }).status === 'RULE_NOT_FOUND', 'Missing rule must fail closed');

// Pure invoice checks remain deterministic and do not need legal rules.
assert(validateArithmetic({ subtotal: 90, vat_amount: 10, total_amount: 100 }).ok, 'Invoice arithmetic happy path failed');
assert(!validateArithmetic({ subtotal: 90, vat_amount: 10, total_amount: 102 }).ok, 'Invoice arithmetic mismatch not detected');
assert(buyerTaxCodeMismatch('ABC-001', 'ABC-002'), 'Buyer tax code mismatch not detected');
assert(!buyerTaxCodeMismatch('', 'ABC-002'), 'Missing buyer tax code must not be guessed as mismatch');
assert(comparePurchaseInventory(
  [{ product_id: 1, quantity: 2 }],
  [{ product_id: 1, type: 'IN', quantity: 2 }],
).ok, 'Inventory match helper failed');
assert(!comparePurchaseInventory(
  [{ product_id: 1, quantity: 2 }],
  [{ product_id: 1, type: 'IN', quantity: 1 }],
).ok, 'Inventory mismatch helper failed');

const canonicalXmlFixture = `
<AutoTaxInvoice>
  <SellerTaxCode>XML-SUP</SellerTaxCode>
  <BuyerTaxCode>XML-BUY</BuyerTaxCode>
  <InvoiceNumber>XML-001</InvoiceNumber>
  <InvoiceSymbol>ATX1</InvoiceSymbol>
  <InvoiceDate>2026-08-12</InvoiceDate>
  <Subtotal>9000</Subtotal>
  <VatAmount>1000</VatAmount>
  <TotalAmount>10000</TotalAmount>
  <Currency>VND</Currency>
  <Lines>
    <Line>
      <LineNo>1</LineNo>
      <Description>Canonical XML line</Description>
      <Quantity>1</Quantity>
      <UnitPrice>9000</UnitPrice>
      <Subtotal>9000</Subtotal>
      <VatRate>0</VatRate>
      <VatAmount>1000</VatAmount>
    </Line>
  </Lines>
</AutoTaxInvoice>`;
const parsedXmlFixture = parseSimpleInvoiceXml(canonicalXmlFixture);
assert(parsedXmlFixture.invoice.invoice_number === 'XML-001' && parsedXmlFixture.lines.length === 1, 'Canonical XML parser fixture failed');

const tctXmlFixture = `<?xml version="1.0" encoding="UTF-8"?>
<TDiep>
  <MTDiep>200</MTDiep>
  <DLieu>
    <HDon>
      <DLHDon>
        <TTChung>
          <PBan>2.0.0</PBan>
          <THDon>Hóa đơn giá trị gia tăng</THDon>
          <KHMSHDon>1</KHMSHDon>
          <KHHDon>C26TCT</KHHDon>
          <SHDon>300001</SHDon>
          <NLap>2026-08-12</NLap>
          <DVTTe>VND</DVTTe>
          <MCCQT>MCCQT-SMOKE-001</MCCQT>
        </TTChung>
        <NDHDon>
          <NBan><Ten>NCC XML TCT</Ten><MST>AUD-PAY-SUP</MST></NBan>
          <NMua><Ten>Audit Compliance A</Ten><MST>TAX-A-001</MST></NMua>
          <DSHHDVu>
            <HHDVu>
              <STT>1</STT>
              <THHDVu>Audit payment A</THHDVu>
              <DVTinh>cái</DVTinh>
              <SLuong>2</SLuong>
              <DGia>4500</DGia>
              <ThTien>9000</ThTien>
              <TSuat>10%</TSuat>
              <TThue>1000</TThue>
            </HHDVu>
          </DSHHDVu>
          <TToan>
            <TgTCThue>9000</TgTCThue>
            <TgTThue>1000</TgTThue>
            <TgTTTBSo>10000</TgTTTBSo>
          </TToan>
        </NDHDon>
      </DLHDon>
    </HDon>
  </DLieu>
</TDiep>`;
const parsedTctFixture = parseSupportedInvoiceXml(tctXmlFixture);
assert(parsedTctFixture.source_type === 'XML_TCT_HDON', 'TCT XML source type detection failed');
assert(parsedTctFixture.schema?.family === 'TCT_HDON', 'TCT XML family detection failed');
assert(parsedTctFixture.schema?.version === '2.0.0', 'TCT XML version metadata failed');
assert(parsedTctFixture.schema?.wrapped_message === true, 'TCT TDiep wrapper detection failed');
assert(parsedTctFixture.schema?.wrapper_type === 'TDIEP', 'TCT wrapper type provenance failed');
assert(parsedTctFixture.schema?.message_code === '200', 'TCT message code provenance failed');
assert(parsedTctFixture.schema?.tax_authority_code === 'MCCQT-SMOKE-001', 'TCT authority code provenance failed');
assert(parsedTctFixture.schema?.signature_present === false, 'Unsigned TCT fixture must not invent signature presence');
assert(parsedTctFixture.schema?.signature_verification_status === 'NOT_PRESENT', 'Unsigned TCT fixture signature status mismatch');
assert(parsedTctFixture.invoice.seller_tax_code === 'AUD-PAY-SUP', 'TCT seller tax code parse failed');
assert(parsedTctFixture.invoice.invoice_number === '300001', 'TCT invoice number parse failed');
assert(parsedTctFixture.invoice.total_amount === 10000, 'TCT total parse failed');
assert(parsedTctFixture.lines.length === 1 && parsedTctFixture.lines[0].quantity === 2, 'TCT line parse failed');
assertThrowsCode(
  () => parseSupportedInvoiceXml('<!DOCTYPE HDon [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><HDon>&xxe;</HDon>'),
  'XML_UNSAFE_DECLARATION',
  'Unsafe XML declaration must fail closed',
);
assertThrowsCode(
  () => parseSupportedInvoiceXml(`${tctXmlFixture}${tctXmlFixture}`),
  'XML_MULTIPLE_INVOICES',
  'Multiple HDon payload must fail closed',
);

const a = await register('0955555555', 'Audit Compliance A');
const b = await register('0966666666', 'Audit Compliance B');

await call('/auth/profile', {
  token: a.token,
  method: 'PUT',
  body: {
    name: 'Audit Compliance A',
    taxCode: 'TAX-A-001',
    oldTaxCode: null,
    email: null,
    province: null,
    ward: null,
    address: null,
    taxDepartment: null,
  },
  expected: 200,
});

const missingRule = await call('/audit-compliance/rules/VAT_PAYMENT_THRESHOLD?effective_at=2026-08-12', {
  token: a.token,
  expected: 404,
});
assert(missingRule.data?.code === 'RULE_NOT_FOUND', `Production registry must ship empty: ${JSON.stringify(missingRule.data)}`);

const productA = await call('/products', {
  token: a.token,
  method: 'POST',
  body: { name: 'Audit payment A', sku: 'AUD-PAY-A', price: 10000, cost_price: 5000, stock: 0, category: 'Audit' },
  expected: 200,
});
const productB = await call('/products', {
  token: b.token,
  method: 'POST',
  body: { name: 'Audit payment B', sku: 'AUD-PAY-B', price: 10000, cost_price: 5000, stock: 0, category: 'Audit' },
  expected: 200,
});
const supplierA = await call('/suppliers', {
  token: a.token,
  method: 'POST',
  body: { name: 'NCC Audit Payment', phone: '0283333333', tax_code: 'AUD-PAY-SUP' },
  expected: 200,
});

const bankPurchase = await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    supplier_id: supplierA.data.id,
    items: [{ product_id: productA.data.id, quantity: 2, cost_price: 5000 }],
    paid_amount: 10000,
    payment_method: 'bank',
    payment_reference: 'AUDIT-BANK-REF-001',
    note: 'Compliance smoke bank payment',
  },
  expected: 200,
});
assert(bankPurchase.data?.payment_method === 'bank', `Purchase lost bank method: ${JSON.stringify(bankPurchase.data)}`);
assert(bankPurchase.data?.payment_evidence_status === 'RECORDED', 'Bank payment evidence should be RECORDED');

const evidenceA = (await call(`/audit-compliance/payment-evidence?purchase_order_id=${bankPurchase.data.id}`, { token: a.token })).data;
assert(evidenceA.length === 1, `Expected one payment evidence, got ${evidenceA.length}`);
assert(evidenceA[0].payment_method === 'bank', 'Evidence payment method mismatch');
assert(evidenceA[0].transaction_reference === 'AUDIT-BANK-REF-001', 'Evidence reference mismatch');
assert(Number(evidenceA[0].amount) === 10000, 'Evidence amount mismatch');

const detailA = (await call(`/purchases/${bankPurchase.data.id}`, { token: a.token })).data;
assert(Array.isArray(detailA.payment_evidence) && detailA.payment_evidence.length === 1, 'Purchase detail missing payment evidence');
assert(Array.isArray(detailA.input_invoices) && detailA.input_invoices.length === 0, 'New purchase should start without attached input invoices');

const cashA = (await call('/finance/cash-flows', { token: a.token })).data;
assert(cashA.some((flow) => flow.reference_id === bankPurchase.data.code && flow.payment_method === 'bank'), 'Purchase cash flow still hardcodes cash');

const evidenceLeak = (await call(`/audit-compliance/payment-evidence?purchase_order_id=${bankPurchase.data.id}`, { token: b.token })).data;
assert(evidenceLeak.length === 0, 'Payment evidence leaked across tenants');

const goodInvoicePayload = {
  purchase_order_id: bankPurchase.data.id,
  invoice: {
    seller_tax_code: 'AUD-PAY-SUP',
    buyer_tax_code: 'TAX-A-001',
    invoice_number: '000001',
    invoice_symbol: 'C26TAA',
    invoice_date: '2026-08-12',
    subtotal: 9000,
    vat_amount: 1000,
    total_amount: 10000,
    currency: 'VND',
  },
  lines: [
    { line_no: 1, description: 'Audit payment A', quantity: 2, unit_price: 4500, subtotal: 9000, vat_rate: 0, vat_amount: 1000 },
  ],
};
const goodInvoice = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: goodInvoicePayload,
  expected: 201,
});
assert(goodInvoice.data?.checks?.arithmetic_ok === true, 'Matching invoice arithmetic should pass');
assert(goodInvoice.data?.checks?.buyer_tax_code_ok === true, 'Matching buyer tax code should pass');
assert(goodInvoice.data?.checks?.purchase_amount_ok === true, 'Matching invoice/purchase amount should pass');
assert(goodInvoice.data?.checks?.inventory_receipt_ok === true, 'Matching purchase/inventory receipt should pass');
assert(goodInvoice.data?.checks?.legal_rule_status === 'RULE_NOT_EVALUATED', 'Invoice import must not invent a legal rule');
assert(Array.isArray(goodInvoice.data?.findings) && goodInvoice.data.findings.length === 0, 'Clean invoice should not create deterministic findings');

const goodInvoiceDetail = (await call(`/audit-compliance/input-invoices/${goodInvoice.data.id}`, { token: a.token })).data;
assert(goodInvoiceDetail.lines.length === 1, 'Invoice line was not persisted');
assert(goodInvoiceDetail.relations.some((relation) => relation.relation_type === 'PURCHASE_ORDER' && relation.match_status === 'MATCHED'), 'Invoice purchase relation missing');
assert(goodInvoiceDetail.xml_provenance === null, 'Manual invoice must not invent XML provenance');

const duplicateInvoice = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: goodInvoicePayload,
  expected: 409,
});
assert(duplicateInvoice.data?.code === 'DUPLICATE_INVOICE', 'Duplicate invoice was not blocked');
assert(Number(duplicateInvoice.data?.existing_invoice_id) === Number(goodInvoice.data.id), 'Duplicate invoice did not point to original record');

const badInvoice = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: {
    purchase_order_id: bankPurchase.data.id,
    invoice: {
      seller_tax_code: 'AUD-PAY-SUP',
      buyer_tax_code: 'WRONG-TAX-CODE',
      invoice_number: '000002',
      invoice_symbol: 'C26TAA',
      invoice_date: '2026-08-12',
      subtotal: 9000,
      vat_amount: 1000,
      total_amount: 11000,
      currency: 'VND',
    },
  },
  expected: 201,
});
assert(badInvoice.data?.checks?.arithmetic_ok === false, 'Bad arithmetic was not detected');
assert(badInvoice.data?.checks?.buyer_tax_code_ok === false, 'Buyer tax code mismatch was not detected');
assert(badInvoice.data?.checks?.purchase_amount_ok === false, 'Invoice/purchase amount mismatch was not detected');
assert(badInvoice.data?.checks?.inventory_receipt_ok === true, 'Inventory check should remain independently valid');
const badCodes = new Set((badInvoice.data.findings || []).map((finding) => finding.code));
assert(badCodes.has('INV_ARITHMETIC_MISMATCH'), 'Arithmetic finding missing');
assert(badCodes.has('INV_BUYER_TAX_CODE_MISMATCH'), 'Buyer tax code finding missing');
assert(badCodes.has('INV_PURCHASE_AMOUNT_MISMATCH'), 'Purchase amount finding missing');

const casesA = (await call('/audit-compliance/cases', { token: a.token })).data;
const arithmeticCase = casesA.find((auditCase) => auditCase.subject_type === 'invoice' && auditCase.subject_id === String(badInvoice.data.id) && auditCase.finding_code === 'INV_ARITHMETIC_MISMATCH');
assert(arithmeticCase, 'Audit case missing for bad invoice');
await call(`/audit-compliance/cases/${arithmeticCase.id}/status`, {
  token: a.token,
  method: 'PATCH',
  body: { status: 'NEED_DOCUMENT', note: 'Smoke needs evidence' },
  expected: 200,
});
await call(`/audit-compliance/cases/${arithmeticCase.id}/status`, {
  token: a.token,
  method: 'PATCH',
  body: { status: 'RESOLVED', note: 'Smoke resolved' },
  expected: 200,
});
const resolvedFindingsA = (await call('/audit-compliance/findings?status=RESOLVED', { token: a.token })).data;
assert(resolvedFindingsA.some((finding) => finding.id === arithmeticCase.finding_id), 'Resolving audit case did not resolve finding');

const xmlInvoice = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: { xml: canonicalXmlFixture },
  expected: 201,
});
assert(xmlInvoice.data?.source_type === 'XML_CANONICAL_V1', 'Canonical XML source type mismatch');
assert(xmlInvoice.data?.xml_schema?.family === 'AUTOTAX_CANONICAL', 'Canonical XML schema metadata missing');
assert(xmlInvoice.data?.xml_schema?.signature_present === false, 'Canonical fixture should not invent signature presence');
assert(xmlInvoice.data?.xml_schema?.signature_verification_status === 'NOT_PRESENT', 'Canonical unsigned XML status mismatch');
assert(xmlInvoice.data?.checks?.legal_rule_status === 'RULE_NOT_EVALUATED', 'XML import must not evaluate missing legal rule');
const canonicalDetail = (await call(`/audit-compliance/input-invoices/${xmlInvoice.data.id}`, { token: a.token })).data;
assert(canonicalDetail.xml_provenance?.schema_family === 'AUTOTAX_CANONICAL', 'Canonical XML provenance was not persisted');
assert(canonicalDetail.xml_provenance?.signature_verification_status === 'NOT_PRESENT', 'Canonical provenance signature status mismatch');

const tctInvoice = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: { purchase_order_id: bankPurchase.data.id, xml: tctXmlFixture },
  expected: 201,
});
assert(tctInvoice.data?.source_type === 'XML_TCT_HDON', 'TCT XML API source type mismatch');
assert(tctInvoice.data?.xml_schema?.family === 'TCT_HDON', 'TCT XML API family metadata missing');
assert(tctInvoice.data?.xml_schema?.version === '2.0.0', 'TCT XML API version metadata missing');
assert(tctInvoice.data?.xml_schema?.signature_present === false, 'Unsigned TCT API response must not claim a signature');
assert(tctInvoice.data?.xml_schema?.signature_verification_status === 'NOT_PRESENT', 'Unsigned TCT API signature status mismatch');
assert(tctInvoice.data?.checks?.arithmetic_ok === true, 'TCT arithmetic check failed');
assert(tctInvoice.data?.checks?.buyer_tax_code_ok === true, 'TCT buyer tax code check failed');
assert(tctInvoice.data?.checks?.purchase_amount_ok === true, 'TCT purchase amount check failed');
assert(tctInvoice.data?.checks?.inventory_receipt_ok === true, 'TCT inventory match check failed');
assert(tctInvoice.data?.checks?.legal_rule_status === 'RULE_NOT_EVALUATED', 'TCT XML import must not evaluate missing legal rule');
assert(Array.isArray(tctInvoice.data?.findings) && tctInvoice.data.findings.length === 0, 'Clean TCT XML should not create findings');

const tctInvoiceDetail = (await call(`/audit-compliance/input-invoices/${tctInvoice.data.id}`, { token: a.token })).data;
assert(tctInvoiceDetail.xml_provenance?.schema_family === 'TCT_HDON', 'TCT XML provenance was not persisted');
assert(tctInvoiceDetail.xml_provenance?.schema_version === '2.0.0', 'TCT provenance version mismatch');
assert(tctInvoiceDetail.xml_provenance?.wrapper_type === 'TDIEP', 'TCT provenance wrapper mismatch');
assert(tctInvoiceDetail.xml_provenance?.message_code === '200', 'TCT provenance message code mismatch');
assert(tctInvoiceDetail.xml_provenance?.tax_authority_code === 'MCCQT-SMOKE-001', 'TCT provenance authority code mismatch');
assert(Number(tctInvoiceDetail.xml_provenance?.signature_present) === 0, 'Unsigned TCT provenance signature presence mismatch');
assert(tctInvoiceDetail.xml_provenance?.signature_verification_status === 'NOT_PRESENT', 'Unsigned TCT provenance signature status mismatch');

const purchaseWithInvoices = (await call(`/purchases/${bankPurchase.data.id}`, { token: a.token })).data;
assert(Array.isArray(purchaseWithInvoices.input_invoices), 'Purchase detail missing persisted input invoice list');
const attachedManual = purchaseWithInvoices.input_invoices.find((invoice) => Number(invoice.id) === Number(goodInvoice.data.id));
const attachedTct = purchaseWithInvoices.input_invoices.find((invoice) => Number(invoice.id) === Number(tctInvoice.data.id));
assert(attachedManual?.source_type === 'MANUAL' && attachedManual?.match_status === 'MATCHED', 'Manual attached invoice not visible/matched on purchase detail');
assert(attachedTct?.source_type === 'XML_TCT_HDON' && attachedTct?.match_status === 'MATCHED', 'TCT attached invoice not visible/matched on purchase detail');
assert(attachedTct?.schema_family === 'TCT_HDON', 'Attached TCT invoice missing provenance family');
assert(Number(attachedTct?.signature_present) === 0 && attachedTct?.signature_verification_status === 'NOT_PRESENT', 'Purchase detail unsigned TCT signature status mismatch');
await call(`/purchases/${bankPurchase.data.id}`, { token: b.token, expected: 404 });

const unsafeXml = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: { xml: '<!DOCTYPE HDon [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><HDon>&xxe;</HDon>' },
  expected: 400,
});
assert(unsafeXml.data?.code === 'XML_UNSAFE_DECLARATION', 'Unsafe XML must fail closed at API boundary');

const unsupportedXml = await call('/audit-compliance/input-invoices', {
  token: a.token,
  method: 'POST',
  body: { xml: '<Invoice><InvoiceNumber>NOPE</InvoiceNumber></Invoice>' },
  expected: 400,
});
assert(unsupportedXml.data?.code === 'XML_UNSUPPORTED_SCHEMA', 'Unsupported vendor XML must fail closed');

const invoicesA = (await call('/audit-compliance/input-invoices', { token: a.token })).data;
const invoicesB = (await call('/audit-compliance/input-invoices', { token: b.token })).data;
assert(invoicesA.some((invoice) => invoice.id === goodInvoice.data.id) && invoicesA.some((invoice) => invoice.id === badInvoice.data.id), 'Tenant A invoice list missing records');
assert(invoicesA.some((invoice) => invoice.id === tctInvoice.data.id && invoice.source_type === 'XML_TCT_HDON'), 'TCT invoice was not persisted with source type');
assert(!invoicesB.some((invoice) => invoice.id === goodInvoice.data.id || invoice.id === badInvoice.data.id || invoice.id === tctInvoice.data.id), 'Invoice ledger leaked across tenants');

const oldClientPurchase = await call('/purchases', {
  token: b.token,
  method: 'POST',
  body: {
    items: [{ product_id: productB.data.id, quantity: 1, cost_price: 1000 }],
    paid_amount: 1000,
    note: 'Old client without payment method',
  },
  expected: 200,
});
assert(oldClientPurchase.data?.payment_method === 'unknown', 'Old client missing method must become unknown');
assert(oldClientPurchase.data?.payment_evidence_status === 'NEEDS_METHOD', 'Old client should create NEEDS_METHOD evidence');

const evidenceB = (await call(`/audit-compliance/payment-evidence?purchase_order_id=${oldClientPurchase.data.id}`, { token: b.token })).data;
assert(evidenceB.length === 1 && evidenceB[0].payment_method === 'unknown', 'Unknown evidence not persisted');
assert(evidenceB[0].status === 'NEEDS_METHOD', 'Unknown evidence status mismatch');

const findingsB = (await call('/audit-compliance/findings?status=OPEN', { token: b.token })).data;
const missingMethodFinding = findingsB.find((finding) => finding.code === 'PAYMENT_METHOD_MISSING' && finding.subject_id === String(oldClientPurchase.data.id));
assert(missingMethodFinding, 'Missing payment method finding was not created');
const openFindingsA = (await call('/audit-compliance/findings?status=OPEN', { token: a.token })).data;
assert(!openFindingsA.some((finding) => finding.id === missingMethodFinding.id), 'Compliance finding leaked across tenants');

const casesB = (await call('/audit-compliance/cases', { token: b.token })).data;
assert(casesB.some((auditCase) => auditCase.finding_id === missingMethodFinding.id && auditCase.status === 'OPEN'), 'Audit case not created for missing payment method');

await call('/purchases', {
  token: a.token,
  method: 'POST',
  body: {
    items: [{ product_id: productA.data.id, quantity: 1, cost_price: 1000 }],
    paid_amount: -1,
  },
  expected: 400,
});

console.log('AUDIT COMPLIANCE SMOKE PASSED: empty legal registry + fake boundary fixture + payment evidence + unsigned canonical/TCT XML adapters + persisted provenance + duplicate/math/MST/PO/inventory checks + XML safety + case lifecycle + tenant isolation');
