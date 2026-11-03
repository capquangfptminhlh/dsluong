'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { X509Certificate, createHash, timingSafeEqual } = require('crypto');
const { parsePinnedAuthorityBundle } = require('./authorityCertificateBundle');

function normalizeBase64(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

function certificatePem(base64Der) {
  const value = normalizeBase64(base64Der);
  if (!value) throw new Error('Missing X509 certificate data');
  const chunks = value.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function inspectCertificate(base64Der, now = new Date()) {
  const pem = certificatePem(base64Der);
  const cert = new X509Certificate(pem);
  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);
  let currentTimeStatus = 'UNKNOWN';
  if (Number.isFinite(validFrom.getTime()) && Number.isFinite(validTo.getTime())) {
    if (now < validFrom) currentTimeStatus = 'NOT_YET_VALID_NOW';
    else if (now > validTo) currentTimeStatus = 'EXPIRED_NOW';
    else currentTimeStatus = 'VALID_NOW';
  }

  let selfSigned = false;
  try {
    selfSigned = cert.checkIssued(cert) && cert.verify(cert.publicKey);
  } catch {}

  return {
    pem,
    fingerprint_sha256: cert.fingerprint256 || null,
    serial_number: cert.serialNumber || null,
    subject: cert.subject || null,
    issuer: cert.issuer || null,
    valid_from: Number.isFinite(validFrom.getTime()) ? validFrom.toISOString() : cert.validFrom || null,
    valid_to: Number.isFinite(validTo.getTime()) ? validTo.toISOString() : cert.validTo || null,
    current_time_status: currentTimeStatus,
    is_ca: Boolean(cert.ca),
    self_signed: selfSigned,
  };
}

function normalizeSha256Pin(value) {
  return String(value || '').replace(/:/g, '').replace(/\s+/g, '').toLowerCase();
}

function verifyCertificateTrust({
  certificateBase64,
  chainCertificatesBase64 = [],
  trustAnchorsFile = process.env.AUTOTAX_XML_TRUST_ANCHORS_FILE || '',
  trustAnchorsSha256 = process.env.AUTOTAX_XML_TRUST_ANCHORS_SHA256 || '',
  authorityBundleFile = process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE || '',
  authorityBundleSha256 = process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256 || '',
  opensslBin = process.env.AUTOTAX_OPENSSL_BIN || 'openssl',
} = {}) {
  let metadata;
  try {
    metadata = inspectCertificate(certificateBase64);
  } catch (error) {
    return {
      trust_status: 'CERTIFICATE_PARSE_ERROR',
      chain_verified: false,
      revocation_status: 'NOT_CHECKED',
      time_validation_basis: 'CURRENT_TIME_METADATA_ONLY',
      error_code: error?.code || 'CERTIFICATE_PARSE_ERROR',
    };
  }

  const base = {
    ...metadata,
    trust_status: 'NOT_CONFIGURED',
    chain_verified: false,
    revocation_status: 'NOT_CHECKED',
    time_validation_basis: 'CHAIN_VERIFY_IGNORES_TIME_NO_TRUSTED_SIGNING_TIMESTAMP',
    trust_anchor_bundle_sha256: null,
    authority_bundle_sha256: null,
  };

  const anchorPath = String(trustAnchorsFile || '').trim();
  if (!anchorPath) return base;
  if (!fs.existsSync(anchorPath)) {
    return { ...base, trust_status: 'TRUST_ANCHOR_FILE_MISSING', error_code: 'TRUST_ANCHOR_FILE_MISSING' };
  }

  let anchorBytes;
  try {
    anchorBytes = fs.readFileSync(anchorPath);
  } catch (error) {
    return { ...base, trust_status: 'TRUST_ANCHOR_FILE_UNREADABLE', error_code: error?.code || 'TRUST_ANCHOR_FILE_UNREADABLE' };
  }
  const actualAnchorSha256 = createHash('sha256').update(anchorBytes).digest('hex');
  const pinnedBase = { ...base, trust_anchor_bundle_sha256: actualAnchorSha256 };
  const expectedAnchorSha256 = normalizeSha256Pin(trustAnchorsSha256);
  if (!expectedAnchorSha256) {
    return { ...pinnedBase, trust_status: 'TRUST_ANCHOR_DIGEST_NOT_CONFIGURED', error_code: 'TRUST_ANCHOR_DIGEST_NOT_CONFIGURED' };
  }
  if (!/^[a-f0-9]{64}$/.test(expectedAnchorSha256)) {
    return { ...pinnedBase, trust_status: 'TRUST_ANCHOR_DIGEST_INVALID', error_code: 'TRUST_ANCHOR_DIGEST_INVALID' };
  }
  const digestMatches = timingSafeEqual(Buffer.from(actualAnchorSha256, 'hex'), Buffer.from(expectedAnchorSha256, 'hex'));
  if (!digestMatches) {
    return { ...pinnedBase, trust_status: 'TRUST_ANCHOR_DIGEST_MISMATCH', error_code: 'TRUST_ANCHOR_DIGEST_MISMATCH' };
  }

  const authorityBundle = parsePinnedAuthorityBundle({
    bundleFile: authorityBundleFile,
    bundleSha256: authorityBundleSha256,
  });
  if (authorityBundle.status !== 'NOT_CONFIGURED' && authorityBundle.status !== 'READY') {
    return {
      ...pinnedBase,
      authority_bundle_sha256: authorityBundle.bundle_sha256 || null,
      trust_status: authorityBundle.status,
      error_code: authorityBundle.status,
    };
  }
  const trustBase = {
    ...pinnedBase,
    authority_bundle_sha256: authorityBundle.bundle_sha256 || null,
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotax-cert-trust-'));
  const leafPath = path.join(tempDir, 'leaf.pem');
  const chainPath = path.join(tempDir, 'chain.pem');
  try {
    fs.writeFileSync(leafPath, metadata.pem, { mode: 0o600 });
    const embeddedChainPem = (Array.isArray(chainCertificatesBase64) ? chainCertificatesBase64 : [])
      .filter(Boolean)
      .map((item) => certificatePem(item))
      .join('');
    const chainPem = `${embeddedChainPem}${authorityBundle.status === 'READY' ? authorityBundle.pem_bundle : ''}`;
    if (chainPem) fs.writeFileSync(chainPath, chainPem, { mode: 0o600 });

    const args = [
      'verify',
      '-no-CApath',
      '-no-CAstore',
      '-CAfile', anchorPath,
      '-no_check_time',
      '-purpose', 'any',
    ];
    if (chainPem) args.push('-untrusted', chainPath);
    args.push(leafPath);

    try {
      execFileSync(opensslBin, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
      return {
        ...trustBase,
        trust_status: 'CHAIN_TRUSTED_NO_TIME_OR_REVOCATION',
        chain_verified: true,
      };
    } catch (error) {
      const detail = String(error?.stderr || error?.stdout || error?.message || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      return {
        ...trustBase,
        trust_status: error?.code === 'ENOENT' ? 'OPENSSL_UNAVAILABLE' : 'CHAIN_UNTRUSTED_OR_INVALID',
        error_code: error?.code || 'OPENSSL_VERIFY_FAILED',
        error_detail: detail || null,
      };
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  certificatePem,
  inspectCertificate,
  normalizeSha256Pin,
  verifyCertificateTrust,
};
