'use strict';

const fs = require('fs');
const { createHash, timingSafeEqual, X509Certificate } = require('crypto');
const { certificatePem } = require('./certificateTrustVerifier');
const { findImmediateIssuerFromPinnedBundle } = require('./authorityCertificateBundle');

const ALLOWED_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']);
const ALLOWED_HOSTS = new Set(['rootca.gov.vn', 'www.rootca.gov.vn']);

function normalizeHex(value) {
  return String(value || '').replace(/:/g, '').replace(/\s+/g, '').toLowerCase();
}

function normalizeSerial(value) {
  const normalized = normalizeHex(value).replace(/^0+/, '');
  return normalized || '0';
}

function registryResult(overrides = {}) {
  return {
    status: 'NOT_CONFIGURED',
    registry_sha256: null,
    authority_bundle_sha256: null,
    authority_evidence_source: null,
    authority_name: null,
    authority_status: null,
    authority_serial_number: null,
    authority_fingerprint_sha256: null,
    authority_source_url: null,
    immediate_issuer_found: false,
    ...overrides,
  };
}

function validateOfficialUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function parsePinnedRegistry({
  registryFile = process.env.AUTOTAX_XML_CA_AUTHORITY_REGISTRY_FILE || '',
  registrySha256 = process.env.AUTOTAX_XML_CA_AUTHORITY_REGISTRY_SHA256 || '',
} = {}) {
  const filePath = String(registryFile || '').trim();
  if (!filePath) return registryResult();
  if (!fs.existsSync(filePath)) {
    return registryResult({ status: 'REGISTRY_FILE_MISSING' });
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath);
  } catch (error) {
    return registryResult({ status: 'REGISTRY_FILE_UNREADABLE', error_code: error?.code || 'REGISTRY_FILE_UNREADABLE' });
  }

  const actualSha256 = createHash('sha256').update(raw).digest('hex');
  const expectedSha256 = normalizeHex(registrySha256);
  const base = registryResult({ registry_sha256: actualSha256 });
  if (!expectedSha256) return { ...base, status: 'REGISTRY_DIGEST_NOT_CONFIGURED' };
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return { ...base, status: 'REGISTRY_DIGEST_INVALID' };
  if (!timingSafeEqual(Buffer.from(actualSha256, 'hex'), Buffer.from(expectedSha256, 'hex'))) {
    return { ...base, status: 'REGISTRY_DIGEST_MISMATCH' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch {
    return { ...base, status: 'REGISTRY_JSON_INVALID' };
  }

  if (parsed?.schema_version !== 1 || !Array.isArray(parsed?.entries)) {
    return { ...base, status: 'REGISTRY_SCHEMA_UNSUPPORTED' };
  }
  if (!validateOfficialUrl(parsed.source_url)) {
    return { ...base, status: 'REGISTRY_SOURCE_NOT_OFFICIAL' };
  }

  const entries = [];
  const seenFingerprints = new Set();
  for (const entry of parsed.entries) {
    const status = String(entry?.status || '').trim().toUpperCase();
    const serial = normalizeSerial(entry?.serial_number);
    const fingerprint = normalizeHex(entry?.fingerprint_sha256);
    const name = String(entry?.name || '').trim();
    const sourceUrl = String(entry?.source_url || '').trim();
    if (!name || !ALLOWED_STATUSES.has(status) || !/^[a-f0-9]+$/.test(serial) || !/^[a-f0-9]{64}$/.test(fingerprint) || !validateOfficialUrl(sourceUrl)) {
      return { ...base, status: 'REGISTRY_ENTRY_INVALID' };
    }
    if (seenFingerprints.has(fingerprint)) return { ...base, status: 'REGISTRY_DUPLICATE_FINGERPRINT' };
    seenFingerprints.add(fingerprint);
    entries.push({
      name,
      status,
      serial_number: serial,
      fingerprint_sha256: fingerprint,
      source_url: sourceUrl,
    });
  }

  return {
    ...base,
    status: 'READY',
    source_url: parsed.source_url,
    generated_at: parsed.generated_at || null,
    entries,
  };
}

function x509FromBase64(value) {
  return new X509Certificate(certificatePem(value));
}

function findImmediateIssuer(leafCertificateBase64, chainCertificatesBase64 = [], {
  authorityBundleFile = process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_FILE || '',
  authorityBundleSha256 = process.env.AUTOTAX_XML_CA_AUTHORITY_BUNDLE_SHA256 || '',
} = {}) {
  let leaf;
  try {
    leaf = x509FromBase64(leafCertificateBase64);
  } catch {
    return { status: 'LEAF_CERTIFICATE_PARSE_ERROR', issuer: null, authority_bundle_sha256: null, evidence_source: null };
  }

  const embeddedMatches = [];
  for (const encoded of Array.isArray(chainCertificatesBase64) ? chainCertificatesBase64 : []) {
    try {
      const candidate = x509FromBase64(encoded);
      if (!candidate.ca) continue;
      if (!leaf.checkIssued(candidate)) continue;
      if (!leaf.verify(candidate.publicKey)) continue;
      embeddedMatches.push(candidate);
    } catch {}
  }

  if (embeddedMatches.length > 1) {
    return { status: 'AUTHORITY_CERT_AMBIGUOUS', issuer: null, authority_bundle_sha256: null, evidence_source: 'EMBEDDED_XML' };
  }
  if (embeddedMatches.length === 1) {
    return { status: 'FOUND', issuer: embeddedMatches[0], authority_bundle_sha256: null, evidence_source: 'EMBEDDED_XML' };
  }

  const local = findImmediateIssuerFromPinnedBundle(leafCertificateBase64, {
    bundleFile: authorityBundleFile,
    bundleSha256: authorityBundleSha256,
  });
  if (local.status === 'FOUND') {
    return {
      status: 'FOUND',
      issuer: local.issuer,
      authority_bundle_sha256: local.bundle_sha256 || null,
      evidence_source: 'PINNED_LOCAL_BUNDLE',
    };
  }
  if (local.status === 'NOT_CONFIGURED') {
    return { status: 'AUTHORITY_CERT_NOT_EMBEDDED_OR_UNPROVEN', issuer: null, authority_bundle_sha256: null, evidence_source: null };
  }
  return {
    status: local.status,
    issuer: null,
    authority_bundle_sha256: local.bundle_sha256 || null,
    evidence_source: 'PINNED_LOCAL_BUNDLE',
  };
}

function evaluateAuthorityRegistry({
  leafCertificateBase64,
  chainCertificatesBase64 = [],
  registryFile,
  registrySha256,
  authorityBundleFile,
  authorityBundleSha256,
} = {}) {
  const registry = parsePinnedRegistry({ registryFile, registrySha256 });
  if (registry.status !== 'READY') return registry;

  const issuerResult = findImmediateIssuer(leafCertificateBase64, chainCertificatesBase64, {
    authorityBundleFile,
    authorityBundleSha256,
  });
  if (issuerResult.status !== 'FOUND') {
    return {
      ...registryResult({
        registry_sha256: registry.registry_sha256,
        authority_bundle_sha256: issuerResult.authority_bundle_sha256 || null,
        authority_evidence_source: issuerResult.evidence_source || null,
      }),
      status: issuerResult.status,
    };
  }

  const issuer = issuerResult.issuer;
  const serial = normalizeSerial(issuer.serialNumber);
  const fingerprint = normalizeHex(issuer.fingerprint256);
  const matches = registry.entries.filter((entry) => (
    entry.serial_number === serial && entry.fingerprint_sha256 === fingerprint
  ));

  const evidence = {
    registry_sha256: registry.registry_sha256,
    authority_bundle_sha256: issuerResult.authority_bundle_sha256 || null,
    authority_evidence_source: issuerResult.evidence_source || null,
    immediate_issuer_found: true,
    authority_serial_number: issuer.serialNumber || null,
    authority_fingerprint_sha256: issuer.fingerprint256 || null,
  };

  if (matches.length === 0) {
    return registryResult({
      status: 'AUTHORITY_NOT_IN_APPROVED_REGISTRY',
      ...evidence,
    });
  }
  if (matches.length > 1) {
    return registryResult({
      status: 'AUTHORITY_REGISTRY_AMBIGUOUS',
      ...evidence,
    });
  }

  const match = matches[0];
  return registryResult({
    status: match.status === 'ACTIVE' ? 'MATCHED_ACTIVE' : `MATCHED_${match.status}`,
    ...evidence,
    authority_name: match.name,
    authority_status: match.status,
    authority_source_url: match.source_url,
  });
}

module.exports = {
  ALLOWED_STATUSES,
  evaluateAuthorityRegistry,
  findImmediateIssuer,
  normalizeHex,
  normalizeSerial,
  parsePinnedRegistry,
  validateOfficialUrl,
};
