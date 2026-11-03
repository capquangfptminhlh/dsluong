'use strict';

const { DOMParser } = require('@xmldom/xmldom');
const { SignedXml } = require('xml-crypto');
const { verifyCertificateTrust } = require('./certificateTrustVerifier');
const { evaluateAuthorityRegistry } = require('./caAuthorityRegistry');

const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

function parseXmlDocument(xml) {
  const errors = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message)),
    },
  });
  const doc = parser.parseFromString(String(xml || ''), 'text/xml');
  if (!doc?.documentElement || errors.length > 0) {
    const error = new Error('XML không hợp lệ để xác minh chữ ký.');
    error.code = 'XML_SIGNATURE_PARSE_ERROR';
    throw error;
  }
  return doc;
}

function localName(node) {
  return String(node?.localName || node?.nodeName || '').split(':').pop();
}

function toXmlString(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return String(value || '');
}

function nodesByNamespace(node, namespace, name) {
  if (!node?.getElementsByTagNameNS) return [];
  return Array.from(node.getElementsByTagNameNS(namespace, name) || []);
}

function baseResult(overrides = {}) {
  return {
    status: 'NOT_PRESENT',
    signature_count: 0,
    signed_reference_count: 0,
    certificate_present: false,
    certificate_trust_status: 'NOT_CHECKED',
    certificate_chain_verified: false,
    certificate_fingerprint_sha256: null,
    certificate_subject: null,
    certificate_issuer: null,
    certificate_serial_number: null,
    certificate_valid_from: null,
    certificate_valid_to: null,
    certificate_current_time_status: null,
    certificate_revocation_status: 'NOT_CHECKED',
    certificate_trust_anchor_bundle_sha256: null,
    certificate_authority_bundle_sha256: null,
    certificate_authority_registry_status: 'NOT_CONFIGURED',
    certificate_authority_registry_sha256: null,
    certificate_authority_evidence_source: null,
    certificate_authority_name: null,
    certificate_authority_status: null,
    certificate_authority_serial_number: null,
    certificate_authority_fingerprint_sha256: null,
    certificate_authority_source_url: null,
    authenticated_invoice_xml: null,
    reference_root: null,
    ...overrides,
  };
}

function verifyXmlSignature(xml) {
  const source = String(xml || '');
  const doc = parseXmlDocument(source);
  const signatures = nodesByNamespace(doc, XMLDSIG_NS, 'Signature');

  if (signatures.length === 0) return baseResult();

  if (signatures.length !== 1) {
    return baseResult({
      status: 'MULTIPLE_SIGNATURES_UNVERIFIED',
      signature_count: signatures.length,
    });
  }

  const signature = signatures[0];
  const embeddedCert = nodesByNamespace(signature, XMLDSIG_NS, 'X509Certificate');
  const embeddedCertValues = embeddedCert
    .map((node) => String(node?.textContent || '').replace(/\s+/g, '').trim())
    .filter(Boolean);
  const certificatePresent = embeddedCertValues.length > 0;
  if (!certificatePresent) {
    return baseResult({
      status: 'NO_EMBEDDED_CERT_UNVERIFIED',
      signature_count: 1,
    });
  }

  try {
    const verifier = new SignedXml({
      getCertFromKeyInfo: SignedXml.getCertFromKeyInfo,
    });
    verifier.loadSignature(signature);
    const valid = verifier.checkSignature(source);
    if (!valid) {
      return baseResult({
        status: 'INVALID',
        signature_count: 1,
        certificate_present: true,
      });
    }

    const signedReferences = verifier.getSignedReferences().map(toXmlString).filter(Boolean);
    if (signedReferences.length !== 1) {
      return baseResult({
        status: 'CRYPTO_VALID_REFERENCE_UNSUPPORTED',
        signature_count: 1,
        signed_reference_count: signedReferences.length,
        certificate_present: true,
      });
    }

    const signedReference = signedReferences[0];
    const authenticatedDoc = parseXmlDocument(signedReference);
    const root = localName(authenticatedDoc.documentElement);
    let authenticatedInvoiceXml = null;
    if (root === 'HDon') authenticatedInvoiceXml = signedReference;
    else if (root === 'DLHDon') authenticatedInvoiceXml = `<HDon>${signedReference}</HDon>`;
    else {
      return baseResult({
        status: 'CRYPTO_VALID_REFERENCE_UNSUPPORTED',
        signature_count: 1,
        signed_reference_count: 1,
        certificate_present: true,
        reference_root: root || null,
      });
    }

    const chainCertificatesBase64 = embeddedCertValues.slice(1);
    const certificateTrust = verifyCertificateTrust({
      certificateBase64: embeddedCertValues[0],
      chainCertificatesBase64,
    });
    const authorityRegistry = evaluateAuthorityRegistry({
      leafCertificateBase64: embeddedCertValues[0],
      chainCertificatesBase64,
    });
    const authorityPolicyConfigured = authorityRegistry.status !== 'NOT_CONFIGURED';
    const authorityApproved = certificateTrust.chain_verified && authorityRegistry.status === 'MATCHED_ACTIVE';
    const verificationStatus = authorityPolicyConfigured
      ? (authorityApproved
        ? 'CRYPTO_VALID_TRUSTED_CHAIN_AUTHORITY_APPROVED_NO_TIME_OR_REVOCATION'
        : 'CRYPTO_VALID_AUTHORITY_POLICY_UNVERIFIED')
      : (certificateTrust.chain_verified
        ? 'CRYPTO_VALID_TRUSTED_CHAIN_NO_TIME_OR_REVOCATION'
        : 'CRYPTO_VALID_UNTRUSTED_CERT');
    return baseResult({
      status: verificationStatus,
      signature_count: 1,
      signed_reference_count: 1,
      certificate_present: true,
      certificate_trust_status: certificateTrust.trust_status || 'NOT_CHECKED',
      certificate_chain_verified: Boolean(certificateTrust.chain_verified),
      certificate_fingerprint_sha256: certificateTrust.fingerprint_sha256 || null,
      certificate_subject: certificateTrust.subject || null,
      certificate_issuer: certificateTrust.issuer || null,
      certificate_serial_number: certificateTrust.serial_number || null,
      certificate_valid_from: certificateTrust.valid_from || null,
      certificate_valid_to: certificateTrust.valid_to || null,
      certificate_current_time_status: certificateTrust.current_time_status || null,
      certificate_revocation_status: certificateTrust.revocation_status || 'NOT_CHECKED',
      certificate_trust_anchor_bundle_sha256: certificateTrust.trust_anchor_bundle_sha256 || null,
      certificate_authority_bundle_sha256: authorityRegistry.authority_bundle_sha256 || certificateTrust.authority_bundle_sha256 || null,
      certificate_authority_registry_status: authorityRegistry.status || 'NOT_CONFIGURED',
      certificate_authority_registry_sha256: authorityRegistry.registry_sha256 || null,
      certificate_authority_evidence_source: authorityRegistry.authority_evidence_source || null,
      certificate_authority_name: authorityRegistry.authority_name || null,
      certificate_authority_status: authorityRegistry.authority_status || null,
      certificate_authority_serial_number: authorityRegistry.authority_serial_number || null,
      certificate_authority_fingerprint_sha256: authorityRegistry.authority_fingerprint_sha256 || null,
      certificate_authority_source_url: authorityRegistry.authority_source_url || null,
      authenticated_invoice_xml: authenticatedInvoiceXml,
      reference_root: root,
    });
  } catch (error) {
    const message = String(error?.message || '');
    return baseResult({
      status: message.startsWith('invalid signature:') ? 'INVALID' : 'UNSUPPORTED_OR_ERROR',
      signature_count: 1,
      certificate_present: true,
      error_code: error?.code || null,
    });
  }
}

module.exports = {
  XMLDSIG_NS,
  verifyXmlSignature,
};
