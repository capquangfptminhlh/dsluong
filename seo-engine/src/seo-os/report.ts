import { createRecommendation } from './recommendations.js';
import type {
  AuditRecommendation,
  AuditReport,
  AuditSummary,
  Observation,
  RecommendationInput,
  Severity,
} from './types.js';

interface RecommendationTemplate {
  readonly expectedMetric: string;
  readonly proposedChange: string;
  readonly rollback: string;
}

const templates: Readonly<Record<string, RecommendationTemplate>> = {
  ORPHAN_URL: {
    expectedMetric: 'internally_linked_urls',
    proposedChange: 'Add an appropriate internal link to the orphan URL.',
    rollback: 'Remove the added internal link.',
  },
  UNDECLARED_URL: {
    expectedMetric: 'sitemap_coverage',
    proposedChange: 'Review the linked URL and add it to the sitemap if it should be indexed.',
    rollback: 'Restore the previous sitemap.',
  },
  BROKEN_INTERNAL_LINK: {
    expectedMetric: 'broken_internal_links',
    proposedChange: 'Repair or remove the broken internal link.',
    rollback: 'Restore the previous internal link target.',
  },
  HTTP_ERROR: {
    expectedMetric: 'successful_http_responses',
    proposedChange: 'Investigate and restore a successful response for the affected URL.',
    rollback: 'Restore the previous route or server configuration.',
  },
  CANONICAL_MISMATCH: {
    expectedMetric: 'self_consistent_canonicals',
    proposedChange: 'Review and align the canonical URL with the intended indexable URL.',
    rollback: 'Restore the previous canonical declaration.',
  },
};

function sortObservations(observations: readonly Observation[]): Observation[] {
  return observations.map((item) => ({
    ...item,
    sourceUrls: [...item.sourceUrls].sort(),
    evidenceRefs: item.evidenceRefs
      .map((evidence) => ({ ...evidence }))
      .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt) || left.id.localeCompare(right.id)),
  })).sort((left, right) => left.auditId.localeCompare(right.auditId)
    || left.code.localeCompare(right.code)
    || left.sourceUrls.join('|').localeCompare(right.sourceUrls.join('|'))
    || left.evidenceRefs.map((evidence) => `${evidence.capturedAt}:${evidence.id}`).join('|')
      .localeCompare(right.evidenceRefs.map((evidence) => `${evidence.capturedAt}:${evidence.id}`).join('|')));
}

function evaluatedAt(observation: Observation): string {
  return observation.evidenceRefs
    .map((evidence) => evidence.capturedAt)
    .sort()
    .at(-1) ?? '1970-01-01T00:00:00.000Z';
}

function recommendationFrom(observation: Observation): AuditRecommendation {
  const template = templates[observation.code] ?? {
    expectedMetric: 'audit_observation_count',
    proposedChange: `Review and address the ${observation.code} observation.`,
    rollback: 'Restore the previous configuration.',
  };
  const input: RecommendationInput = {
    id: `recommendation:${observation.auditId.toLowerCase()}:${observation.code.toLowerCase()}:${observation.evidenceRefs.map((evidence) => evidence.id).join('|') || 'missing-evidence'}`,
    severity: observation.severity,
    risk: observation.severity,
    evidenceRefs: observation.evidenceRefs,
    evidenceFreshness: { maxAgeDays: 0 },
    expectedMetric: template.expectedMetric,
    baseline: 1,
    proposedChange: template.proposedChange,
    owner: 'seo-review',
    rollback: template.rollback,
  };
  return {
    ...createRecommendation(input, evaluatedAt(observation)),
    auditId: observation.auditId,
    observationCode: observation.code,
    sourceUrls: [...observation.sourceUrls],
  };
}

function summary(observations: readonly Observation[], recommendations: readonly AuditRecommendation[]): AuditSummary {
  const statuses = { NEW: 0, HOLD: 0 };
  const severities: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const recommendation of recommendations) {
    if (recommendation.status === 'NEW' || recommendation.status === 'HOLD') statuses[recommendation.status] += 1;
  }
  for (const observation of observations) severities[observation.severity] += 1;
  return {
    observations: observations.length,
    recommendations: recommendations.length,
    statuses,
    severities,
  };
}

export function buildReport(input: readonly Observation[]): AuditReport {
  const observations = sortObservations(input);
  const recommendations = observations.map(recommendationFrom);
  return { observations, recommendations, summary: summary(observations, recommendations) };
}
