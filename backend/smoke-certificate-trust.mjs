import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

const require = createRequire(import.meta.url);
const { inspectCertificate, verifyCertificateTrust } = require('./services/certificateTrustVerifier');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const pemToBase64 = (pem) => String(pem)
  .replace(/-----BEGIN CERTIFICATE-----/g, '')
  .replace(/-----END CERTIFICATE-----/g, '')
  .replace(/\s+/g, '');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-cert-chain-smoke-'));
const rootKey = path.join(tempDir, 'root.key');
const rootCert = path.join(tempDir, 'root.pem');
const leafKey = path.join(tempDir, 'leaf.key');
const leafCsr = path.join(tempDir, 'leaf.csr');
const leafCert = path.join(tempDir, 'leaf.pem');
const leafExt = path.join(tempDir, 'leaf.ext');
const wrongRootKey = path.join(tempDir, 'wrong-root.key');
const wrongRootCert = path.join(tempDir, 'wrong-root.pem');

try {
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', rootKey,
    '-out', rootCert,
    '-days', '1',
    '-subj', '/CN=AutoTax Trust Smoke Root',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ], { stdio: 'ignore' });

  execFileSync('openssl', [
    'req', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', leafKey,
    '-out', leafCsr,
    '-subj', '/CN=AutoTax XML Signer Smoke',
  ], { stdio: 'ignore' });
  fs.writeFileSync(leafExt, [
    'basicConstraints=critical,CA:FALSE',
    'keyUsage=critical,digitalSignature',
  ].join('\n'));
  execFileSync('openssl', [
    'x509', '-req',
    '-in', leafCsr,
    '-CA', rootCert,
    '-CAkey', rootKey,
    '-CAcreateserial',
    '-out', leafCert,
    '-days', '1',
    '-sha256',
    '-extfile', leafExt,
  ], { stdio: 'ignore' });

  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', wrongRootKey,
    '-out', wrongRootCert,
    '-days', '1',
    '-subj', '/CN=AutoTax Wrong Root',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
  ], { stdio: 'ignore' });

  const leafBase64 = pemToBase64(fs.readFileSync(leafCert, 'utf8'));
  const metadata = inspectCertificate(leafBase64);
  assert(metadata.fingerprint_sha256, 'Leaf fingerprint SHA-256 missing');
  assert(metadata.subject?.includes('AutoTax XML Signer Smoke'), `Unexpected leaf subject: ${metadata.subject}`);
  assert(metadata.issuer?.includes('AutoTax Trust Smoke Root'), `Unexpected leaf issuer: ${metadata.issuer}`);
  assert(metadata.current_time_status === 'VALID_NOW', `Expected VALID_NOW, got ${metadata.current_time_status}`);
  assert(metadata.self_signed === false, 'Leaf must not be self-signed');

  const noTrustConfig = verifyCertificateTrust({ certificateBase64: leafBase64, trustAnchorsFile: '' });
  assert(noTrustConfig.trust_status === 'NOT_CONFIGURED', `Missing trust bundle must stay NOT_CONFIGURED: ${JSON.stringify(noTrustConfig)}`);
  assert(noTrustConfig.chain_verified === false, 'No trust bundle must not verify chain');
  assert(noTrustConfig.revocation_status === 'NOT_CHECKED', 'Revocation must not be implied');

  const rootSha256 = createHash('sha256').update(fs.readFileSync(rootCert)).digest('hex');
  const wrongRootSha256 = createHash('sha256').update(fs.readFileSync(wrongRootCert)).digest('hex');

  const unpinned = verifyCertificateTrust({ certificateBase64: leafBase64, trustAnchorsFile: rootCert });
  assert(unpinned.trust_status === 'TRUST_ANCHOR_DIGEST_NOT_CONFIGURED', `Configured CA file without SHA-256 pin must fail closed: ${JSON.stringify(unpinned)}`);
  assert(unpinned.chain_verified === false, 'Unpinned CA bundle must not verify chain');
  assert(unpinned.trust_anchor_bundle_sha256 === rootSha256, 'Unpinned CA bundle must still expose observed SHA-256 for audit');

  const badPin = verifyCertificateTrust({
    certificateBase64: leafBase64,
    trustAnchorsFile: rootCert,
    trustAnchorsSha256: '0'.repeat(64),
  });
  assert(badPin.trust_status === 'TRUST_ANCHOR_DIGEST_MISMATCH', `Wrong CA bundle pin must fail closed: ${JSON.stringify(badPin)}`);
  assert(badPin.chain_verified === false, 'Wrong CA bundle pin must not verify chain');

  const trusted = verifyCertificateTrust({ certificateBase64: leafBase64, trustAnchorsFile: rootCert, trustAnchorsSha256: rootSha256 });
  assert(trusted.trust_status === 'CHAIN_TRUSTED_NO_TIME_OR_REVOCATION', `Expected trusted chain without time/revocation, got ${JSON.stringify(trusted)}`);
  assert(trusted.chain_verified === true, 'Pinned configured root should verify chain');
  assert(trusted.trust_anchor_bundle_sha256 === rootSha256, 'Trusted result lost CA bundle SHA-256 provenance');
  assert(trusted.revocation_status === 'NOT_CHECKED', 'Trusted chain must still say revocation NOT_CHECKED');
  assert(trusted.time_validation_basis === 'CHAIN_VERIFY_IGNORES_TIME_NO_TRUSTED_SIGNING_TIMESTAMP', 'Time validation caveat missing');

  const wrongAnchor = verifyCertificateTrust({ certificateBase64: leafBase64, trustAnchorsFile: wrongRootCert, trustAnchorsSha256: wrongRootSha256 });
  assert(wrongAnchor.trust_status === 'CHAIN_UNTRUSTED_OR_INVALID', `Wrong root must fail chain trust: ${JSON.stringify(wrongAnchor)}`);
  assert(wrongAnchor.chain_verified === false, 'Wrong root must not verify chain');

  const missingOpenSsl = verifyCertificateTrust({
    certificateBase64: leafBase64,
    trustAnchorsFile: rootCert,
    trustAnchorsSha256: rootSha256,
    opensslBin: path.join(tempDir, 'openssl-does-not-exist'),
  });
  assert(missingOpenSsl.trust_status === 'OPENSSL_UNAVAILABLE', `Missing OpenSSL must fail closed: ${JSON.stringify(missingOpenSsl)}`);

  console.log('CERTIFICATE TRUST SMOKE PASSED: metadata + SHA-256 pinned trust anchor + pin mismatch + wrong anchor + OpenSSL unavailable + no time/revocation overclaim');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
