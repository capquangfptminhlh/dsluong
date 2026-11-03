import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { SignedXml } = require('xml-crypto');
const { verifyXmlSignature } = require('./services/xmlSignatureVerifier');
const { parseSupportedInvoiceXml } = require('./services/invoiceXmlAdapter');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function call(pathname, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const allowed = expected === undefined ? null : (Array.isArray(expected) ? expected : [expected]);
  if (allowed) assert(allowed.includes(response.status), `${method} ${pathname}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  else assert(response.ok, `${method} ${pathname}: HTTP ${response.status}: ${text}`);
  return { status: response.status, data };
}

const unsignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<TDiep>
  <MTDiep>200</MTDiep>
  <DLieu>
    <HDon>
      <DLHDon Id="DLH-SMOKE-001">
        <TTChung>
          <PBan>2.0.0</PBan>
          <KHHDon>C26SIG</KHHDon>
          <SHDon>900001</SHDon>
          <NLap>2026-08-12</NLap>
          <DVTTe>VND</DVTTe>
          <MCCQT>MCCQT-SIGN-SMOKE</MCCQT>
        </TTChung>
        <NDHDon>
          <NBan><Ten>NCC Signature Smoke</Ten><MST>SIG-SUP</MST></NBan>
          <NMua><Ten>AutoTax Smoke</Ten><MST>SIG-BUY</MST></NMua>
          <DSHHDVu>
            <HHDVu>
              <STT>1</STT>
              <THHDVu>Signed item</THHDVu>
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

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-xmldsig-'));
const keyPath = path.join(tempDir, 'key.pem');
const certPath = path.join(tempDir, 'cert.pem');

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath,
    '-out', certPath,
    '-days', '1',
    '-subj', '/CN=AutoTax XMLDSig Smoke',
  ], { stdio: 'ignore' });

  const privateKey = fs.readFileSync(keyPath, 'utf8');
  const publicCert = fs.readFileSync(certPath, 'utf8');
  const signer = new SignedXml({
    privateKey,
    publicCert,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });
  signer.addReference({
    xpath: "//*[local-name(.)='DLHDon']",
    transforms: ['http://www.w3.org/2001/10/xml-exc-c14n#'],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  });
  signer.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
  signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
  signer.computeSignature(unsignedXml, {
    location: {
      reference: "//*[local-name(.)='HDon']",
      action: 'append',
    },
  });
  const signedXml = signer.getSignedXml();

  const verified = verifyXmlSignature(signedXml);
  assert(verified.status === 'CRYPTO_VALID_UNTRUSTED_CERT', `Expected crypto-valid status, got ${JSON.stringify(verified)}`);
  assert(verified.signature_count === 1, 'Expected one XML signature');
  assert(verified.signed_reference_count === 1, 'Expected one authenticated reference');
  assert(verified.certificate_present === true, 'Embedded X509 certificate was not detected');
  assert(verified.certificate_trust_status === 'NOT_CONFIGURED', 'Smoke must not imply certificate-chain trust without configured anchors');
  assert(verified.certificate_chain_verified === false, 'Unconfigured trust anchors must not verify certificate chain');
  assert(verified.certificate_fingerprint_sha256, 'XMLDSig verifier did not expose certificate SHA-256 fingerprint');
  assert(verified.certificate_subject?.includes('AutoTax XMLDSig Smoke'), `Unexpected certificate subject: ${verified.certificate_subject}`);
  assert(verified.certificate_revocation_status === 'NOT_CHECKED', 'XMLDSig verifier must not imply revocation checking');
  assert(verified.certificate_authority_registry_status === 'NOT_CONFIGURED', 'Unconfigured authority registry must remain additive');
  assert(verified.certificate_authority_registry_sha256 === null, 'Unconfigured authority registry must not invent a registry hash');
  assert(verified.reference_root === 'DLHDon', `Expected signed DLHDon reference, got ${verified.reference_root}`);
  assert(verified.authenticated_invoice_xml, 'Verified signature did not return authenticated invoice XML');

  const authenticatedInvoice = parseSupportedInvoiceXml(verified.authenticated_invoice_xml);
  assert(authenticatedInvoice.invoice.invoice_number === '900001', 'Authenticated reference invoice number mismatch');
  assert(authenticatedInvoice.invoice.total_amount === 10000, 'Authenticated reference total mismatch');
  assert(authenticatedInvoice.invoice.seller_tax_code === 'SIG-SUP', 'Authenticated reference seller mismatch');

  const tamperedXml = signedXml.replace('<TgTTTBSo>10000</TgTTTBSo>', '<TgTTTBSo>10001</TgTTTBSo>');
  const tampered = verifyXmlSignature(tamperedXml);
  assert(tampered.status === 'INVALID', `Tampered signed XML must be INVALID, got ${JSON.stringify(tampered)}`);
  assert(!tampered.authenticated_invoice_xml, 'Invalid signature must never return authenticated invoice XML');

  const unsigned = verifyXmlSignature(unsignedXml);
  assert(unsigned.status === 'NOT_PRESENT', 'Unsigned XML must be NOT_PRESENT');

  const signatureOnly = '<Root><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo/></Signature></Root>';
  const noCert = verifyXmlSignature(signatureOnly);
  assert(noCert.status === 'NO_EMBEDDED_CERT_UNVERIFIED', `Signature without X509 cert must stay unverified: ${JSON.stringify(noCert)}`);

  // Integration: the backend is already running when this smoke executes in the quality workflow.
  const registered = await call('/auth/register', {
    method: 'POST',
    body: {
      phone: '0979000001',
      name: 'XMLDSig Audit Smoke',
      password: ['Xml', 'Signature', '2026', '!'].join(''),
      sector: 'retail',
    },
    expected: 200,
  });
  const token = registered.data?.token;
  assert(token, 'XMLDSig API smoke registration missing token');

  await call('/auth/profile', {
    token,
    method: 'PUT',
    body: {
      name: 'XMLDSig Audit Smoke',
      taxCode: 'SIG-BUY',
      oldTaxCode: null,
      email: null,
      province: null,
      ward: null,
      address: null,
      taxDepartment: null,
    },
    expected: 200,
  });

  const imported = await call('/audit-compliance/input-invoices', {
    token,
    method: 'POST',
    body: { xml: signedXml },
    expected: 201,
  });
  assert(imported.data?.source_type === 'XML_TCT_HDON', 'Signed XML API source type mismatch');
  assert(imported.data?.xml_schema?.signature_present === true, 'Signed XML API lost signature presence');
  assert(imported.data?.xml_schema?.signature_verification_status === 'CRYPTO_VALID_UNTRUSTED_CERT', 'Signed XML API did not persist crypto-valid status');
  assert(imported.data?.xml_schema?.signature_reference_root === 'DLHDon', 'Signed XML API reference root mismatch');
  assert(imported.data?.xml_schema?.certificate_trust_status === 'NOT_CONFIGURED', 'Signed XML API must report trust anchors as not configured');
  assert(imported.data?.xml_schema?.certificate_chain_verified === false, 'Signed XML API must not claim chain verification without trust anchors');
  assert(imported.data?.xml_schema?.certificate_fingerprint_sha256 === verified.certificate_fingerprint_sha256, 'Signed XML API certificate fingerprint mismatch');
  assert(imported.data?.xml_schema?.certificate_revocation_status === 'NOT_CHECKED', 'Signed XML API must not claim revocation checking');
  assert(imported.data?.xml_schema?.certificate_trust_anchor_bundle_sha256 === null, 'Unconfigured CA bundle must not invent trust-anchor provenance');
  assert(imported.data?.xml_schema?.certificate_authority_registry_status === 'NOT_CONFIGURED', 'Default API import must keep authority registry unconfigured');
  assert(imported.data?.xml_schema?.certificate_authority_registry_sha256 === null, 'Default API import must not invent authority registry provenance');
  assert(imported.data?.checks?.arithmetic_ok === true, 'Signed XML arithmetic check failed');
  assert(imported.data?.checks?.buyer_tax_code_ok === true, 'Signed XML buyer tax code check failed');

  const detail = (await call(`/audit-compliance/input-invoices/${imported.data.id}`, { token })).data;
  assert(detail.xml_provenance?.schema_family === 'TCT_HDON', 'Signed XML provenance family missing');
  assert(Number(detail.xml_provenance?.signature_present) === 1, 'Signed XML provenance presence mismatch');
  assert(detail.xml_provenance?.signature_verification_status === 'CRYPTO_VALID_UNTRUSTED_CERT', 'Signed XML provenance status mismatch');
  assert(detail.xml_provenance?.certificate_trust_status === 'NOT_CONFIGURED', 'Signed XML provenance trust status mismatch');
  assert(Number(detail.xml_provenance?.certificate_chain_verified) === 0, 'Signed XML provenance must not claim chain verification');
  assert(detail.xml_provenance?.certificate_fingerprint_sha256 === verified.certificate_fingerprint_sha256, 'Signed XML provenance fingerprint mismatch');
  assert(detail.xml_provenance?.certificate_subject?.includes('AutoTax XMLDSig Smoke'), `Signed XML provenance subject mismatch: ${detail.xml_provenance?.certificate_subject}`);
  assert(detail.xml_provenance?.certificate_revocation_status === 'NOT_CHECKED', 'Signed XML provenance must keep revocation NOT_CHECKED');
  assert(detail.xml_provenance?.certificate_trust_anchor_bundle_sha256 === null, 'Signed XML provenance must not invent CA bundle hash when trust is unconfigured');
  assert(detail.xml_provenance?.certificate_authority_registry_status === 'NOT_CONFIGURED', 'Signed XML provenance must keep authority registry unconfigured by default');
  assert(detail.xml_provenance?.certificate_authority_registry_sha256 === null, 'Signed XML provenance must not invent authority registry hash');
  assert(Number(detail.total_amount) === 10000, 'Signed XML persisted total must come from authenticated reference');

  const rejectedTamper = await call('/audit-compliance/input-invoices', {
    token,
    method: 'POST',
    body: { xml: tamperedXml },
    expected: 400,
  });
  assert(rejectedTamper.data?.code === 'XML_SIGNATURE_INVALID', `Tampered API import must fail closed: ${JSON.stringify(rejectedTamper.data)}`);

  const noCertXml = unsignedXml.replace(
    '</HDon>',
    '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo/></ds:Signature></HDon>',
  );
  const rejectedNoCert = await call('/audit-compliance/input-invoices', {
    token,
    method: 'POST',
    body: { xml: noCertXml },
    expected: 400,
  });
  assert(rejectedNoCert.data?.code === 'XML_SIGNATURE_UNVERIFIED', `No-cert signed XML must fail closed: ${JSON.stringify(rejectedNoCert.data)}`);
  assert(rejectedNoCert.data?.detail?.signature_status === 'NO_EMBEDDED_CERT_UNVERIFIED', 'No-cert rejection lost signature status evidence');

  const ledger = (await call('/audit-compliance/input-invoices', { token })).data;
  assert(ledger.filter((invoice) => Number(invoice.id) === Number(imported.data.id)).length === 1, 'Valid signed invoice missing from ledger');
  assert(ledger.length === 1, `Rejected signed XML must not create ledger rows: ${JSON.stringify(ledger)}`);

  console.log('XML SIGNATURE SMOKE PASSED: real DLHDon signature + certificate provenance persistence + authenticated-reference API import + tamper/no-cert rejection + no rejected ledger writes');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
