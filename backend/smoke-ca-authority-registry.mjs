import { createRequire } from 'module';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { X509Certificate } = require('crypto');
const {
  evaluateAuthorityRegistry,
  parsePinnedRegistry,
} = require('./services/caAuthorityRegistry');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const pemToBase64 = (pem) => String(pem)
  .replace(/-----BEGIN CERTIFICATE-----/g, '')
  .replace(/-----END CERTIFICATE-----/g, '')
  .replace(/\s+/g, '');
const sha256File = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-authority-registry-'));
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
const unrelatedKey = path.join(tempDir, 'unrelated.key');
const unrelatedCert = path.join(tempDir, 'unrelated.pem');
const registryFile = path.join(tempDir, 'registry.json');

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', rootKey, '-out', rootCert, '-days', '1',
    '-subj', '/CN=AutoTax National Root Smoke',
    '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:1',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ], { stdio: 'ignore' });

  execFileSync('openssl', [
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', caKey, '-out', caCsr,
    '-subj', '/CN=AutoTax Public CA Smoke',
  ], { stdio: 'ignore' });
  fs.writeFileSync(caExt, [
    'basicConstraints=critical,CA:TRUE,pathlen:0',
    'keyUsage=critical,keyCertSign,cRLSign,digitalSignature',
  ].join('\n'));
  execFileSync('openssl', [
    'x509', '-req', '-in', caCsr,
    '-CA', rootCert, '-CAkey', rootKey, '-CAcreateserial',
    '-out', caCert, '-days', '1', '-sha256', '-extfile', caExt,
  ], { stdio: 'ignore' });

  execFileSync('openssl', [
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', leafKey, '-out', leafCsr,
    '-subj', '/CN=AutoTax Invoice Signer Smoke',
  ], { stdio: 'ignore' });
  fs.writeFileSync(leafExt, [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature',
  ].join('\n'));
  execFileSync('openssl', [
    'x509', '-req', '-in', leafCsr,
    '-CA', caCert, '-CAkey', caKey, '-CAcreateserial',
    '-out', leafCert, '-days', '1', '-sha256', '-extfile', leafExt,
  ], { stdio: 'ignore' });

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', unrelatedKey, '-out', unrelatedCert, '-days', '1',
    '-subj', '/CN=Unrelated CA Smoke',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ], { stdio: 'ignore' });

  const leafBase64 = pemToBase64(fs.readFileSync(leafCert, 'utf8'));
  const caBase64 = pemToBase64(fs.readFileSync(caCert, 'utf8'));
  const unrelatedBase64 = pemToBase64(fs.readFileSync(unrelatedCert, 'utf8'));
  const caX509 = new X509Certificate(fs.readFileSync(caCert));
  const caFingerprint = String(caX509.fingerprint256).replace(/:/g, '').toLowerCase();
  const caSerial = String(caX509.serialNumber).replace(/^0+/, '').toLowerCase() || '0';

  const manifest = {
    schema_version: 1,
    source_url: 'https://rootca.gov.vn/',
    generated_at: '2026-08-12T00:00:00Z',
    entries: [{
      name: 'AutoTax Public CA Smoke',
      status: 'ACTIVE',
      serial_number: caSerial,
      fingerprint_sha256: caFingerprint,
      source_url: 'https://rootca.gov.vn/smoke/public-ca',
    }],
  };
  fs.writeFileSync(registryFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const registrySha = sha256File(registryFile);

  const noRegistry = evaluateAuthorityRegistry({
    leafCertificateBase64: leafBase64,
    chainCertificatesBase64: [caBase64],
    registryFile: '',
    registrySha256: '',
  });
  assert(noRegistry.status === 'NOT_CONFIGURED', `Missing registry must stay NOT_CONFIGURED: ${JSON.stringify(noRegistry)}`);

  const noPin = parsePinnedRegistry({ registryFile, registrySha256: '' });
  assert(noPin.status === 'REGISTRY_DIGEST_NOT_CONFIGURED', `Unpinned registry must fail closed: ${JSON.stringify(noPin)}`);

  const badPin = parsePinnedRegistry({ registryFile, registrySha256: '0'.repeat(64) });
  assert(badPin.status === 'REGISTRY_DIGEST_MISMATCH', `Wrong registry pin must fail closed: ${JSON.stringify(badPin)}`);

  const active = evaluateAuthorityRegistry({
    leafCertificateBase64: leafBase64,
    chainCertificatesBase64: [unrelatedBase64, caBase64],
    registryFile,
    registrySha256: registrySha,
  });
  assert(active.status === 'MATCHED_ACTIVE', `Expected active authority match, got ${JSON.stringify(active)}`);
  assert(active.immediate_issuer_found === true, 'Immediate public CA issuer was not proven');
  assert(active.authority_name === 'AutoTax Public CA Smoke', 'Authority name mismatch');
  assert(String(active.authority_serial_number).replace(/^0+/, '').toLowerCase() === caSerial, 'Authority serial mismatch');
  assert(String(active.authority_fingerprint_sha256).replace(/:/g, '').toLowerCase() === caFingerprint, 'Authority fingerprint mismatch');
  assert(active.registry_sha256 === registrySha, 'Registry provenance SHA-256 mismatch');

  const noEmbeddedIssuer = evaluateAuthorityRegistry({
    leafCertificateBase64: leafBase64,
    chainCertificatesBase64: [unrelatedBase64],
    registryFile,
    registrySha256: registrySha,
  });
  assert(noEmbeddedIssuer.status === 'AUTHORITY_CERT_NOT_EMBEDDED_OR_UNPROVEN', `Missing immediate issuer must fail closed: ${JSON.stringify(noEmbeddedIssuer)}`);

  const unknownManifest = structuredClone(manifest);
  unknownManifest.entries[0].fingerprint_sha256 = 'f'.repeat(64);
  fs.writeFileSync(registryFile, `${JSON.stringify(unknownManifest, null, 2)}\n`);
  const unknownSha = sha256File(registryFile);
  const unknown = evaluateAuthorityRegistry({
    leafCertificateBase64: leafBase64,
    chainCertificatesBase64: [caBase64],
    registryFile,
    registrySha256: unknownSha,
  });
  assert(unknown.status === 'AUTHORITY_NOT_IN_APPROVED_REGISTRY', `Unknown public CA must fail registry match: ${JSON.stringify(unknown)}`);

  const revokedManifest = structuredClone(manifest);
  revokedManifest.entries[0].status = 'REVOKED';
  fs.writeFileSync(registryFile, `${JSON.stringify(revokedManifest, null, 2)}\n`);
  const revokedSha = sha256File(registryFile);
  const revoked = evaluateAuthorityRegistry({
    leafCertificateBase64: leafBase64,
    chainCertificatesBase64: [caBase64],
    registryFile,
    registrySha256: revokedSha,
  });
  assert(revoked.status === 'MATCHED_REVOKED', `Revoked authority status must be preserved: ${JSON.stringify(revoked)}`);

  const badSourceManifest = structuredClone(manifest);
  badSourceManifest.source_url = 'https://example.com/not-official';
  fs.writeFileSync(registryFile, `${JSON.stringify(badSourceManifest, null, 2)}\n`);
  const badSourceSha = sha256File(registryFile);
  const badSource = parsePinnedRegistry({ registryFile, registrySha256: badSourceSha });
  assert(badSource.status === 'REGISTRY_SOURCE_NOT_OFFICIAL', `Non-RootCA source must fail closed: ${JSON.stringify(badSource)}`);

  console.log('CA AUTHORITY REGISTRY SMOKE PASSED: pinned official-source manifest + cryptographically proven immediate issuer + serial/fingerprint match + revoked/unknown/unembedded fail-closed');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
