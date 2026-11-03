import { describe, expect, it } from 'vitest';
import { createRecommendation } from '../../src/seo-os/recommendations.js';
import type { RecommendationInput } from '../../src/seo-os/types.js';

const now = new Date('2026-08-02T00:00:00.000Z');

function recommendation(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    id: 'rec-title-update', severity: 'HIGH', risk: 'HIGH',
    evidenceRefs: [{ id: 'gsc-123', capturedAt: '2026-08-01T00:00:00.000Z' }],
    evidenceFreshness: { maxAgeDays: 7 }, expectedMetric: 'organic_clicks', baseline: 120,
    proposedChange: 'Clarify the article title for its target query.', owner: 'seo-team',
    rollback: 'Restore the previous title from version history.', ...overrides,
  };
}

describe('SEO recommendation evaluation', () => {
  it('marks a fresh, evidenced recommendation as NEW with HIGH confidence', () => {
    const result = createRecommendation(recommendation(), now.toISOString());
    expect(result.status).toBe('NEW');
    expect(result.confidence).toBe('HIGH');
  });

  it('holds a recommendation without evidence references', () => {
    expect(createRecommendation(recommendation({ evidenceRefs: [] }), now.toISOString()).status).toBe('HOLD');
  });

  it('holds a recommendation with stale evidence', () => {
    const result = createRecommendation(recommendation({
      evidenceRefs: [{ id: 'gsc-123', capturedAt: '2026-07-20T00:00:00.000Z' }],
    }), now.toISOString());
    expect(result.status).toBe('HOLD');
  });

  it('holds a recommendation without a rollback', () => {
    expect(createRecommendation(recommendation({ rollback: null }), now.toISOString()).status).toBe('HOLD');
  });

  it('assigns deterministic priority that risk cannot raise', () => {
    const lowRisk = createRecommendation(recommendation({ risk: 'LOW' }), now.toISOString());
    const highRisk = createRecommendation(recommendation({ risk: 'CRITICAL' }), now.toISOString());
    expect(lowRisk.priority).toBe('P1');
    expect(highRisk.priority).toBe('P3');
  });

  it('rejects malformed, future, and malformed evaluation timestamps with exact evidence holds', () => {
    expect(createRecommendation(recommendation({
      evidenceRefs: [{ id: 'gsc-123', capturedAt: '2026-08-01 00:00:00Z' }],
    }), now.toISOString()).holdReasons).toEqual(['EVIDENCE_STALE']);
    expect(createRecommendation(recommendation({
      evidenceRefs: [{ id: 'gsc-123', capturedAt: '2026-08-03T00:00:00.000Z' }],
    }), now.toISOString()).holdReasons).toEqual(['EVIDENCE_STALE']);
    expect(createRecommendation(recommendation(), 'not-a-timestamp').holdReasons)
      .toEqual(['EVIDENCE_STALE']);
  });

  it('caps priority monotonically as risk increases', () => {
    const priorities = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((risk) => createRecommendation(
      recommendation({ severity: 'CRITICAL', risk }),
      now.toISOString(),
    ).priority);

    expect(priorities).toEqual(['P0', 'P1', 'P2', 'P3']);
  });

  it('clones nested input data and exposes readonly result data', () => {
    const input = recommendation();
    const result = createRecommendation(input, now.toISOString());
    const originalEvidenceId = result.evidenceRefs[0]?.id;
    const originalMaxAge = result.evidenceFreshness.maxAgeDays;

    (input.evidenceRefs as { id: string; capturedAt: string }[])[0]!.id = 'mutated';
    (input.evidenceFreshness as { maxAgeDays: number }).maxAgeDays = 0;

    expect(result.evidenceRefs[0]?.id).toBe(originalEvidenceId);
    expect(result.evidenceFreshness.maxAgeDays).toBe(originalMaxAge);
  });

  it('reports all and only applicable hold reasons in a stable order', () => {
    const result = createRecommendation(recommendation({ evidenceRefs: [], rollback: null }), now.toISOString());

    expect(result.status).toBe('HOLD');
    expect(result.holdReasons).toEqual(['EVIDENCE_MISSING', 'ROLLBACK_MISSING']);
  });
});
