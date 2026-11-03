import { createRequire } from 'module';
import { createHash, X509Certificate } from 'crypto';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { SignedXml } = require('xml-crypto');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(base, pathname, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${base}${pathname}`, {
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
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert(allowed.includes(response.status), `${method} ${pathname}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  return data;
}

function cleanRuntimeDb() {
  for (const file of ['autotax.db', 'autotax.db-wal', 'autotax.db-shm', 'restore-pending.db']) {
    fs.rmSync(path.join(process.cwd(), file), { force: true });
  }
  fs.rmSync(path.join(process.cwd(), 'backups'), { recursive: true, force: true });
  fs.rmSync(path.join(process.cwd(), 'tmp-upload'), { recursive: true, force: true });
}

async function startServer({ port, rootCert, rootSha, registryFile, registrySha }) {
  const output = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: 'authority-registry-api-smoke-secret-not-production',
      WEBHOOK_SECRET: 'authority-registry-api-smoke-webhook',
      AUTOTAX_XML_TRUST_ANCHORS_FILE: rootCert,
      AUTOTAX_XML_TRUST_ANCHORS_SHA256: rootSha,
      AUTOTAX_XML_CA_AUTHORITY_REGISTRY_FILE: registryFile,
      AUTOTAX_XML_CA_AUTHORITY_REGISTRY_SHA256: registrySha,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) throw new Error(`Backend exited early: ${output.join('')}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return { child, base, output };
    } catch {}
    await sleep(250);
  }
  child.kill('SIGTERM');
  throw new Error(`Backend health timeout: ${output.join('')}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 20 && child.exitCode === null; i += 1) await sleep(100);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function registerAndProfile(base, phone) {
  const registered = await call(base, '/auth/register', {
    method: 'POST',
    body: {
      phone,
      name: 'Authority Registry API Smoke',
      password: ['Authority', 'Registry', '2026', '!'].join(''),
      sector: 'retail',
    },
    expected: 200,
  });
  assert(registered?.token, 'Registration token missing');
  await call(base, '/auth/profile', {
    token: registered.token,
    method: 'PUT',
    body: {
      name: 'Authority Registry API Smoke',
      taxCode: 'REG-BUY',
      oldTaxCode: null,
      email: null,
      province: null,
      ward: null,
      address: null,
      taxDepartment: null,
    },
    expected: 200,
  });
  return registered.token;
}

const unsignedXml = `<?xml version="1.0" encoding="UTF-8"?>
<TDiep>
  <MTDiep>200</MTDiep>
  <DLieu>
    <HDon>
      <DLHDon Id="DLH-REGISTRY-API-001">
        <TTChung>
          <PBan>2.0.0</PBan>
          <KHHDon>C26REG</KHHDon>
          <SHDon>910001</SHDon>
          <NLap>2026-08-12</NLap>
          <DVTTe>VND</DVTTe>
          <MCCQT>MCCQT-REGISTRY-SMOKE</MCCQT>
        </TTChung>
        <NDHDon>
          <NBan><Ten>NCC Authority Smoke</Ten><MST>REG-SUP</MST></NBan>
          <NMua><Ten>AutoTax Registry Smoke</Ten><MST>REG-BUY</MST></NMua>
          <DSHHDVu>
            <HHDVu>
              <STT>1</STT><THHDVu>Registry item</THHDVu><SLuong>2</SLuong><DGia>4500</DGia>
              <ThTien>9000</ThTien><TSuat>10%</TSuat><TThue>1000</TThue>
            </HHDVu>
          </DSHHDVu>
          <TToan><TgTCThue>9000</TgTCThue><TgTThue>1000</TgTThue><TgTTTBSo>10000</TgTTTBSo></TToan>
        </NDHDon>
      </DLHDon>
    </HDon>
  </DLieu>
</TDiep>`;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-authority-api-'));
const rootKey = path.join(tempDir, 'root.key');
const rootCert = path.join(tempDir, 'root.pem');
const caKey = path.join(tempDir, 'public-ca.key');
const caCsr = path.join(tempDir, 'public-ca.csr');
const caCert = path.join(tempDir, 'public-ca.pem');
const caExt = path.join(tempDir, 'public-ca.ext');
const leafKey = path.join(tempDir, 'leaf.key');
const leafCsr = path.join(tempDir, 'leaf.csr');
const leafCert = path.join(tempDir, 'leaf.pem');
const leafExt = path.join(tempDir, 'leaf.ext');
const registryFile = path.join(tempDir, 'registry.json');

let server;
try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', rootKey, '-out', rootCert,
    '-days', '1', '-subj', '/CN=AutoTax National Root API Smoke',
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:1',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ], { stdio: 'ignore' });
  execFileSync('openssl', [
    'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', caKey, '-out', caCsr,
    '-subj', '/CN=AutoTax Public CA API Smoke',
  ], { stdio: 'ignore' });
  fs.writeFileSync(caExt, 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign,digitalSignature\n');
  execFileSync('openssl', [
    'x509', '-req', '-in', caCsr, '-CA', rootCert, '-CAkey', rootKey, '-CAcreateserial',
    '-out', caCert, '-days', '1', '-sha256', '-extfile', caExt,
  ], { stdio: 'ignore' });
  execFileSync('openssl', [
    'req', '-newkey', 'rsa:2048', '-nodes', '-keyout', leafKey, '-out', leafCsr,
    '-subj', '/CN=AutoTax Invoice Signer API Smoke',
  ], { stdio: 'ignore' });
  fs.writeFileSync(leafExt, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n');
  execFileSync('openssl', [
    'x509', '-req', '-in', leafCsr, '-CA', caCert, '-CAkey', caKey, '-CAcreateserial',
    '-out', leafCert, '-days', '1', '-sha256', '-extfile', leafExt,
  ], { stdio: 'ignore' });

  const leafPem = fs.readFileSync(leafCert, 'utf8');
  const caPem = fs.readFileSync(caCert, 'utf8');
  const privateKey = fs.readFileSync(leafKey, 'utf8');
  const caX509 = new X509Certificate(caPem);
  const caSerial = String(caX509.serialNumber).replace(/^0+/, '').toLowerCase() || '0';
  const caFingerprint = String(caX509.fingerprint256).replace(/:/g, '').toLowerCase();
  const rootSha = sha256File(rootCert);

  const signer = new SignedXml({
    privateKey,
    publicCert: `${leafPem}\n${caPem}`,
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
    location: { reference: "//*[local-name(.)='HDon']", action: 'append' },
  });
  const signedXml = signer.getSignedXml();

  const manifest = {
    schema_version: 1,
    source_url: 'https://rootca.gov.vn/',
    generated_at: '2026-08-12T00:00:00Z',
    entries: [{
      name: 'AutoTax Public CA API Smoke',
      status: 'ACTIVE',
      serial_number: caSerial,
      fingerprint_sha256: caFingerprint,
      source_url: 'https://rootca.gov.vn/smoke/public-ca-api',
    }],
  };

  fs.writeFileSync(registryFile, `${JSON.stringify(manifest, null, 2)}\n`);
  cleanRuntimeDb();
  server = await startServer({
    port: 3012,
    rootCert,
    rootSha,
    registryFile,
    registrySha: sha256File(registryFile),
  });
  const activeToken = await registerAndProfile(server.base, '0979000012');
  const imported = await call(server.base, '/audit-compliance/input-invoices', {
    token: activeToken,
    method: 'POST',
    body: { xml: signedXml },
    expected: 201,
  });
  assert(imported?.xml_schema?.signature_verification_status === 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION', `Active registry did not produce approved status: ${JSON.stringify(imported?.xml_schema)}`);
  assert(imported?.xml_schema?.certificate_authority_registry_status === 'MATCHED_ACTIVE', 'Active registry match status missing');
  assert(imported?.xml_schema?.certificate_authority_name === 'AutoTax Public CA API Smoke', 'Approved authority name missing');
  assert(imported?.xml_schema?.certificate_authority_registry_sha256 === sha256File(registryFile), 'Registry SHA-256 missing from response');
  assert(imported?.xml_schema?.certificate_authority_fingerprint_sha256?.replace(/:/g, '').toLowerCase() === caFingerprint, 'Approved authority fingerprint mismatch');

  const detail = await call(server.base, `/audit-compliance/input-invoices/${imported.id}`, {
    token: activeToken,
    expected: 200,
  });
  assert(detail?.xml_provenance?.certificate_authority_registry_status === 'MATCHED_ACTIVE', 'Persisted registry status mismatch');
  assert(detail?.xml_provenance?.certificate_authority_name === 'AutoTax Public CA API Smoke', 'Persisted authority name mismatch');
  assert(detail?.xml_provenance?.certificate_authority_registry_sha256 === sha256File(registryFile), 'Persisted registry SHA-256 mismatch');

  await stopServer(server.child);
  server = null;

  manifest.entries[0].status = 'REVOKED';
  fs.writeFileSync(registryFile, `${JSON.stringify(manifest, null, 2)}\n`);
  cleanRuntimeDb();
  server = await startServer({
    port: 3013,
    rootCert,
    rootSha,
    registryFile,
    registrySha: sha256File(registryFile),
  });
  const revokedToken = await registerAndProfile(server.base, '0979000013');
  const rejected = await call(server.base, '/audit-compliance/input-invoices', {
    token: revokedToken,
    method: 'POST',
    body: { xml: signedXml },
    expected: 400,
  });
  assert(rejected?.code === 'XML_CERTIFICATE_AUTHORITY_UNVERIFIED', `Revoked CA must fail authority policy: ${JSON.stringify(rejected)}`);
  assert(rejected?.detail?.authority_registry_status === 'MATCHED_REVOKED', `Revoked CA evidence missing: ${JSON.stringify(rejected)}`);
  const ledger = await call(server.base, '/audit-compliance/input-invoices', { token: revokedToken, expected: 200 });
  assert(Array.isArray(ledger) && ledger.length === 0, `Rejected revoked-CA XML must not create invoice rows: ${JSON.stringify(ledger)}`);

  console.log('CA AUTHORITY API SMOKE PASSED: ACTIVE public CA accepted with persisted pinned registry provenance; REVOKED public CA rejected fail-closed with zero ledger writes');
} finally {
  if (server?.child) await stopServer(server.child).catch(() => {});
  cleanRuntimeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
}
