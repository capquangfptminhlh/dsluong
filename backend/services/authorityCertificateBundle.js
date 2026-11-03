'use strict';

const fs = require('fs');
const { createHash, timingSafeEqual, X509Certificate } = require('crypto');

function normalizeHex(value) {
  return String(value || '').replace(/:/g, '').replace(/\s+/g, '').toLowerCase();
}

function certificatePemFromBase64(value) {
  const normalized = String(value || '').replace(/\s+/g, '').trim();
  if (!normalized) throw new Error('Missing X509 certificate data');
  const chunks = normalized.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function baseResult(overrides = {}) {
  return {
    status: 'NOT_CONFIGURED',
    bundle_sha256: null,
    certificate_count: 0,
    pem_bundle: null,
    certificates: [],
    ...overrides,
  };
}

function parsePinnedAuthorityBundle({
  bundleFile = process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE || '',
  bundleSha256 = process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256 || '',
} = {}) {
  const filePath = String(bundleFile || '').trim();
  if (!filePath) return baseResult();
  if (!fs.existsSync(filePath)) return baseResult({ status: 'AUTHORITY_BUNDLE_FILE_MISSING' });

  let raw;
  try {
    raw = fs.readFileSync(filePath);
  } catch (error) {
    return baseResult({
      status: 'AUTHORITY_BUNDLE_FILE_UNREADABLE',
      error_code: error?.code || 'AUTHORITY_BUNDLE_FILE_UNREADABLE',
    });
  }

  const actualSha256 = createHash('sha256').update(raw).digest('hex');
  const expectedSha256 = normalizeHex(bundleSha256);
  const base = baseResult({ bundle_sha256: actualSha256 });
  if (!expectedSha256) return { ...base, status: 'AUTHORITY_BUNDLE_DIGEST_NOT_CONFIGURED' };
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return { ...base, status: 'AUTHORITY_BUNDLE_DIGEST_INVALID' };
  if (!timingSafeEqual(Buffer.from(actualSha256, 'hex'), Buffer.from(expectedSha256, 'hex'))) {
    return { ...base, status: 'AUTHORITY_BUNDLE_DIGEST_MISMATCH' };
  }

  const text = raw.toString('utf8');
  const blocks = text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  if (blocks.length === 0) return { ...base, status: 'AUTHORITY_BUNDLE_EMPTY_OR_NON_PEM' };

  const certificates = [];
  const seen = new Set();
  for (const pem of blocks) {
    let cert;
    try {
      cert = new X509Certificate(`${pem}\n`);
    } catch {
      return { ...base, status: 'AUTHORITY_BUNDLE_CERTIFICATE_PARSE_ERROR' };
    }
    if (!cert.ca) return { ...base, status: 'AUTHORITY_BUNDLE_CONTAINS_NON_CA' };
    const fingerprint = normalizeHex(cert.fingerprint256);
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) return { ...base, status: 'AUTHORITY_BUNDLE_FINGERPRINT_INVALID' };
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    certificates.push({
      cert,
      pem: `${pem}\n`,
      fingerprint_sha256: fingerprint,
      serial_number: cert.serialNumber || null,
      subject: cert.subject || null,
      issuer: cert.issuer || null,
    });
  }

  if (certificates.length === 0) return { ...base, status: 'AUTHORITY_BUNDLE_EMPTY' };
  return {
    ...base,
    status: 'READY',
    certificate_count: certificates.length,
    pem_bundle: certificates.map((item) => item.pem).join(''),
    certificates,
  };
}

function findImmediateIssuerFromPinnedBundle(leafCertificateBase64, options = {}) {
  let leaf;
  try {
    leaf = new X509Certificate(certificatePemFromBase64(leafCertificateBase64));
  } catch {
    return {
      status: 'LEAF_CERTIFICATE_PARSE_ERROR',
      issuer: null,
      bundle_sha256: null,
    };
  }

  const bundle = parsePinnedAuthorityBundle(options);
  if (bundle.status !== 'READY') {
    return {
      status: bundle.status,
      issuer: null,
      bundle_sha256: bundle.bundle_sha256 || null,
    };
  }

  const matches = [];
  for (const item of bundle.certificates) {
    try {
      if (!leaf.checkIssued(item.cert)) continue;
      if (!leaf.verify(item.cert.publicKey)) continue;
      matches.push(item);
    } catch {}
  }

  if (matches.length === 0) {
    return {
      status: 'AUTHORITY_NOT_FOUND_IN_PINNED_BUNDLE',
      issuer: null,
      bundle_sha256: bundle.bundle_sha256,
    };
  }
  if (matches.length > 1) {
    return {
      status: 'AUTHORITY_BUNDLE_ISSUER_AMBIGUOUS',
      issuer: null,
      bundle_sha256: bundle.bundle_sha256,
    };
  }
  return {
    status: 'FOUND',
    issuer: matches[0].cert,
    bundle_sha256: bundle.bundle_sha256,
  };
}

module.exports = {
  certificatePemFromBase64,
  findImmediateIssuerFromPinnedBundle,
  normalizeHex,
  parsePinnedAuthorityBundle,
};
