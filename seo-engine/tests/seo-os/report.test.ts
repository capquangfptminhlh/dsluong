import { describe, expect, it } from 'vitest';
import { buildReport } from '../../src/seo-os/report.js';
import type { Observation } from '../../src/seo-os/types.js';

const capturedAt = '2026-08-02T00:00:00.000Z';

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    code: 'ORPHAN_URL',
    auditId: 'CRAWL',
    sourceUrls: ['https://site.test/orphan'],
    severity: 'MEDIUM',
    evidenceRefs: [{ id: 'crawl:orphan-url:https://site.test/orphan', capturedAt }],
    ...overrides,
  };
}

describe('SEO audit report', () => {
  it('turns a crawl observation into a deterministic evidence-backed recommendation', () => {
    const first = buildReport([observation()]);
    const second = buildReport([observation()]);

    expect(first).toEqual(second);
    expect(first.recommendations[0]).toMatchObject({
      auditId: 'CRAWL',
      observationCode: 'ORPHAN_URL',
      status: 'NEW',
      confidence: 'HIGH',
      evidenceRefs: [{ id: 'crawl:orphan-url:https://site.test/orphan', capturedAt }],
      proposedChange: 'Add an appropriate internal link to the orphan URL.',
    });
  });

  it('applies Task 1 evidence freshness logic and emits stable summary counts', () => {
    const report = buildReport([
      observation(),
      observation({
        code: 'HTTP_ERROR',
        severity: 'HIGH',
        sourceUrls: ['https://site.test/error'],
        evidenceRefs: [],
      }),
    ]);

    expect(report.summary).toEqual({
      observations: 2,
      recommendations: 2,
      statuses: { NEW: 1, HOLD: 1 },
      severities: { LOW: 0, MEDIUM: 1, HIGH: 1, CRITICAL: 0 },
    });
    expect(report.recommendations.find((item) => item.observationCode === 'HTTP_ERROR')).toMatchObject({
      observationCode: 'HTTP_ERROR',
      status: 'HOLD',
      holdReasons: ['EVIDENCE_MISSING'],
    });
  });

  it('sorts observations before mapping so input order cannot change output order', () => {
    const canonical = observation({
      code: 'CANONICAL_MISMATCH',
      sourceUrls: ['https://site.test/a', 'https://site.test/b'],
      evidenceRefs: [
        { id: 'crawl:canonical-mismatch:a|b:2', capturedAt },
        { id: 'crawl:canonical-mismatch:a|b:1', capturedAt },
      ],
    });
    const reversedCanonical = {
      ...canonical,
      sourceUrls: [...canonical.sourceUrls].reverse(),
      evidenceRefs: [...canonical.evidenceRefs].reverse(),
    };

    expect(buildReport([observation(), canonical]).recommendations)
      .toEqual(buildReport([reversedCanonical, observation()]).recommendations);
  });
});
