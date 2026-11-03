import { createRequire } from 'module';
import { createHash, X509Certificate } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { SignedXml } = require('xml-crypto');
const { verifyXmlSignature } = require('./services/xmlSignatureVerifier');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const unsignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<TDiep><MTDiep>200</MTDiep><DLieu><HDon><DLHDon Id="DLH-LEAF-ONLY-001">
<TTChung><PBan>2.0.0</PBan><KHHDon>C26LEAF</KHHDon><SHDon>920001</SHDon><NLap>2026-08-12</NLap><DVTTe>VND</DVTTe></TTChung>
<NDHDon><NBan><Ten>NCC Leaf Only</Ten><MST>LEAF-SUP</MST></NBan><NMua><Ten>AutoTax</Ten><MST>LEAF-BUY</MST></NMua>
<DSHHDVu><HHDVu><STT>1</STT><THHDVu>Leaf only</THHDVu><SLuong>1</SLuong><DGia>10000</DGia><ThTien>10000</ThTien><TSuat>10%</TSuat><TThue>1000</TThue></HHDVu></DSHHDVu>
<TToan><TgTCThue>10000</TgTCThue><TgTThue>1000</TgTThue><TgTTTBSo>11000</TgTTTBSo></TToan></NDHDon>
</DLHDon></HDon></DLieu></TDiep>`;

function signXml(xml, privateKey, publicCert) {
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
  signer.computeSignature(xml, { location: { reference: "//*[local-name(.)='HDon']", action: 'append' } });
  return signer.getSignedXml();
}

function configure({ rootCert, authorityBundle, registryFile }) {
  process.env.AUTOTAX_XML_TRUST_ANCHORS_FILE = rootCert;
  process.env.AUTOTAX_XML_TRUST_ANCHORS_SHA256 = sha256File(rootCert);
  process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE = authorityBundle;
  process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256 = sha256File(authorityBundle);
  process.env.AUTOTAX_XML_CA_AUTHORITY_REGISTRY_FILE = registryFile;
  process.env.AUTOTAX_XML_CA_AUTHORITY_REGISTRY_SHA256 = sha256File(registryFile);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-leaf-only-authority-'));
const rootKey = path.join(tempDir, 'root.key');
const rootCert = path.join(tempDir, 'root.pem');
const caKey = path.join(tempDir, 'ca.key');
const caCsr = path.join(tempDir, 'ca.csr');
const caCert = path.join(tempDir, 'ca.pem');
const caExt = path.join(tempDir, 'ca.ext');
const wrongCaKey = path.join(tempDir, 'wrong-ca.key');
const wrongCaCert = path.join(tempDir, 'wrong-ca.pem');
const leafKey = path.join(tempDir, 'leaf.key');
const leafCsr = path.join(tempDir, 'leaf.csr');
const leafCert = path.join(tempDir, 'leaf.pem');
const leafExt = path.join(tempDir, 'leaf.ext');
const authorityBundle = path.join(tempDir, 'authority-bundle.pem');
const wrongAuthorityBundle = path.join(tempDir, 'wrong-authority-bundle.pem');
const registryFile = path.join(tempDir, 'registry.json');

try {
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',rootKey,'-out',rootCert,'-days','1','-subj','/CN=AutoTax Root Leaf-Only Smoke','-addext','basicConstraints=critical,CA:TRUE,pathlen:1','-addext','keyUsage=critical,keyCertSign,cRLSign'], { stdio: 'ignore' });
  execFileSync('openssl', ['req','-newkey','rsa:2048','-nodes','-keyout',caKey,'-out',caCsr,'-subj','/CN=AutoTax Public CA Leaf-Only Smoke'], { stdio: 'ignore' });
  fs.writeFileSync(caExt, 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign,digitalSignature\n');
  execFileSync('openssl', ['x509','-req','-in',caCsr,'-CA',rootCert,'-CAkey',rootKey,'-CAcreateserial','-out',caCert,'-days','1','-sha256','-extfile',caExt], { stdio: 'ignore' });
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',wrongCaKey,'-out',wrongCaCert,'-days','1','-subj','/CN=AutoTax Wrong Public CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'], { stdio: 'ignore' });
  execFileSync('openssl', ['req','-newkey','rsa:2048','-nodes','-keyout',leafKey,'-out',leafCsr,'-subj','/CN=AutoTax Leaf-Only Signer'], { stdio: 'ignore' });
  fs.writeFileSync(leafExt, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n');
  execFileSync('openssl', ['x509','-req','-in',leafCsr,'-CA',caCert,'-CAkey',caKey,'-CAcreateserial','-out',leafCert,'-days','1','-sha256','-extfile',leafExt], { stdio: 'ignore' });

  const caPem = fs.readFileSync(caCert, 'utf8');
  const leafPem = fs.readFileSync(leafCert, 'utf8');
  const privateKey = fs.readFileSync(leafKey, 'utf8');
  fs.writeFileSync(authorityBundle, caPem);
  fs.writeFileSync(wrongAuthorityBundle, fs.readFileSync(wrongCaCert, 'utf8'));

  const caX509 = new X509Certificate(caPem);
  const registry = {
    schema_version: 1,
    source_url: 'https://rootca.gov.vn/',
    generated_at: '2026-08-12T00:00:00Z',
    entries: [{
      name: 'AutoTax Public CA Leaf-Only Smoke',
      status: 'ACTIVE',
      serial_number: String(caX509.serialNumber).replace(/^0+/, '').toLowerCase() || '0',
      fingerprint_sha256: String(caX509.fingerprint256).replace(/:/g, '').toLowerCase(),
      source_url: 'https://rootca.gov.vn/crt/autotax-leaf-only-smoke.p7b',
    }],
  };
  fs.writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`);

  const leafOnlyXml = signXml(unsignedXml, privateKey, leafPem);
  const embeddedChainXml = signXml(unsignedXml, privateKey, `${leafPem}\n${caPem}`);

  configure({ rootCert, authorityBundle, registryFile });
  const leafOnly = verifyXmlSignature(leafOnlyXml);
  assert(leafOnly.status === 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION', `Leaf-only XML must pass using pinned local CA bundle: ${JSON.stringify(leafOnly)}`);
  assert(leafOnly.certificate_chain_verified === true, 'Leaf-only chain was not built through local CA bundle');
  assert(leafOnly.certificate_authority_registry_status === 'MATCHED_ACTIVE', 'Leaf-only CA did not match registry');
  assert(leafOnly.certificate_authority_evidence_source === 'PINNED_LOCAL_BUNDLE', `Expected local bundle evidence, got ${leafOnly.certificate_authority_evidence_source}`);
  assert(leafOnly.certificate_authority_bundle_sha256 === sha256File(authorityBundle), 'Leaf-only authority bundle SHA-256 provenance mismatch');

  const embedded = verifyXmlSignature(embeddedChainXml);
  assert(embedded.status === 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION', `Embedded issuer XML regressed: ${JSON.stringify(embedded)}`);
  assert(embedded.certificate_authority_evidence_source === 'EMBEDDED_XML', `Embedded issuer evidence source mismatch: ${embedded.certificate_authority_evidence_source}`);

  delete process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE;
  delete process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256;
  const missingBundle = verifyXmlSignature(leafOnlyXml);
  assert(missingBundle.status === 'CRYPTO_VALID_AUTHORITY_POLICY_UNVERIFIED', `Leaf-only without local CA bundle must fail closed: ${JSON.stringify(missingBundle)}`);
  assert(missingBundle.certificate_authority_registry_status === 'AUTHORITY_CERT_NOT_EMBEDDED_OR_UNPROVEN', `Unexpected missing-bundle authority status: ${missingBundle.certificate_authority_registry_status}`);

  process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE = authorityBundle;
  process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256 = '0'.repeat(64);
  const badPin = verifyXmlSignature(leafOnlyXml);
  assert(badPin.status === 'CRYPTO_VALID_AUTHORITY_POLICY_UNVERIFIED', `Wrong local CA bundle pin must fail closed: ${JSON.stringify(badPin)}`);
  assert(badPin.certificate_authority_registry_status === 'AUTHORITY_BUNDLE_DIGEST_MISMATCH', `Wrong bundle pin status lost: ${badPin.certificate_authority_registry_status}`);
  assert(badPin.certificate_chain_verified === false, 'Wrong authority bundle pin must not verify chain');

  process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE = wrongAuthorityBundle;
  process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256 = sha256File(wrongAuthorityBundle);
  const wrongBundle = verifyXmlSignature(leafOnlyXml);
  assert(wrongBundle.status === 'CRYPTO_VALID_AUTHORITY_POLICY_UNVERIFIED', `Wrong local CA bundle must fail closed: ${JSON.stringify(wrongBundle)}`);
  assert(wrongBundle.certificate_authority_registry_status === 'AUTHORITY_NOT_FOUND_IN_PINNED_BUNDLE', `Wrong local bundle issuer status mismatch: ${wrongBundle.certificate_authority_registry_status}`);

  configure({ rootCert, authorityBundle, registryFile });
  const unknownRegistry = structuredClone(registry);
  unknownRegistry.entries[0].fingerprint_sha256 = 'f'.repeat(64);
  fs.writeFileSync(registryFile, `${JSON.stringify(unknownRegistry, null, 2)}\n`);
  process.env.AUTOTAX_XML_CA_AUTHORITY_REGISTRY_SHA256 = sha256File(registryFile);
  const unknown = verifyXmlSignature(leafOnlyXml);
  assert(unknown.status === 'CRYPTO_VALID_AUTHORITY_POLICY_UNVERIFIED', `CA missing from registry must fail closed: ${JSON.stringify(unknown)}`);
  assert(unknown.certificate_authority_registry_status === 'AUTHORITY_NOT_IN_APPROVED_REGISTRY', `Unknown registry status mismatch: ${unknown.certificate_authority_registry_status}`);

  console.log('CA AUTHORITY LEAF-ONLY SMOKE PASSED: pinned local public-CA bundle supports leaf-only XMLDSig; embedded issuer preserved; missing/wrong bundle pin and unknown registry fail closed');
} finally {
  for (const key of [
    'AUTOTAX_XML_TRUST_ANCHORS_FILE', 'AUTOTAX_XML_TRUST_ANCHORS_SHA256',
    'AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE', 'AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256',
    'AUTOTAX_XML_CA_AUTHORITY_REGISTRY_FILE', 'AUTOTAX_XML_CA_AUTHORITY_REGISTRY_SHA256',
  ]) delete process.env[key];
  fs.rmSync(tempDir, { recursive: true, force: true });
}
