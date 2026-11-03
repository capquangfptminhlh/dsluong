import type { BloggerCandidate, BloggerFact, BloggerGateResult, BloggerTopic } from './types.js';

function plainText(html: string): string {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function hasDirectOpening(html: string): boolean {
  const firstBlock = html.match(/^\s*<p\b[^>]*>([\s\S]*?)<\/p>/iu);
  return Boolean(firstBlock && plainText(firstBlock[1]).length >= 30);
}

function hasThreeGuidanceSections(html: string): boolean {
  const sections = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|$)/giu)];
  return sections.filter((section) => {
    const guidance = [...section[2].matchAll(/<(?:p|li)\b[^>]*>([\s\S]*?)<\/(?:p|li)>/giu)]
      .some((block) => plainText(block[1]).length >= 20);
    return plainText(section[1]).length >= 8 && guidance;
  }).length >= 3;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/gu, ' ').trim();
}

function isConservativelyFactLike(value: string): boolean {
  const safeText = value.replace(/(?:bước|phần|mục)\s+\d+/giu, '');
  if (/\b\d[\d.,]*\b|\*\d{2,}#|\b(?:sms|soạn|đăng\s+ký|hủy|gb|mb|ưu\s+đãi|miễn\s+phí|cam\s+kết|bảo\s+đảm|khuyến\s+mại)\b/iu.test(safeText)) {
    return true;
  }
  const hasPriceOrDateWord = /\b(?:giá|phí|cước|tháng|năm|ngày|giờ|vnd|vnđ|trăm|nghìn|triệu|tỷ)\b/iu.test(safeText);
  const hasNumberOrUnit = /\d|\b(?:vnd|vnđ|trăm|nghìn|triệu|tỷ)\b/iu.test(safeText);
  return hasPriceOrDateWord && hasNumberOrUnit;
}

function isFactLike(value: string): boolean {
  return /\b\d[\d.,]*\b|\b(?:gia|phi|cuoc|thang|nam|ngay|gio|vnd|vnđ|sms|soan|dang ky|huy|gb|mb)\b|\*\d{2,}#/iu.test(value);
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/u).map((value) => value.trim()).filter(Boolean);
}

function hasGroundedClaim(claim: string, fact: BloggerFact): boolean {
  const normalizedClaim = normalized(claim);
  const normalizedStatement = normalized(String(fact.statement ?? ''));
  if (normalizedClaim.length < 12 || normalizedStatement.length === 0) return false;
  return normalizedClaim === normalizedStatement;
}

/**
 * Enforces the minimum reviewable draft contract with explicit, rendered fact
 * claims. Ambiguous factual-looking text fails closed instead of relying on NLP.
 */
export function validateCandidateQuality(
  candidate: BloggerCandidate,
  topic: BloggerTopic,
  facts: readonly BloggerFact[],
): BloggerGateResult {
  if (!hasDirectOpening(candidate.body) || !hasThreeGuidanceSections(candidate.body)) {
    return { decision: 'HOLD', reason: 'QUALITY_GATE_FAILED' };
  }

  const claims = candidate.factClaims ?? [];
  const bodyText = plainText(candidate.body);
  const hasSources = topic.sourceFactIds.length > 0;
  const hasClaims = claims.length > 0;
  if (hasSources !== hasClaims) return { decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' };
  if (!hasSources) {
    return sentences(bodyText).some(isConservativelyFactLike)
      ? { decision: 'HOLD', reason: 'FACT_CLAIM_UNDECLARED' }
      : { decision: 'PASS' };
  }
  for (const declaration of claims) {
    if (!declaration || typeof declaration.factId !== 'string' || typeof declaration.claim !== 'string'
      || declaration.factId.trim().length === 0 || declaration.claim.trim().length === 0
      || !topic.sourceFactIds.includes(declaration.factId)
      || !bodyText.includes(declaration.claim)) {
      return { decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' };
    }
    const fact = facts.find((item) => item.factId === declaration.factId);
    if (!fact || !hasGroundedClaim(declaration.claim, fact)) {
      return { decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' };
    }
  }
  const unclaimedText = claims.reduce(
    (remaining, declaration) => remaining.split(declaration.claim).join(''),
    bodyText,
  );
  if (sentences(unclaimedText).some(isConservativelyFactLike)) {
    return { decision: 'HOLD', reason: 'FACT_CLAIM_UNDECLARED' };
  }
  if (claims.some((declaration) => !topic.sourceFactIds.includes(declaration.factId))) {
    return { decision: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' };
  }
  return { decision: 'PASS' };
}
