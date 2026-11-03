import type {
  Confidence,
  HoldReason,
  Recommendation,
  RecommendationInput,
  RecommendationPriority,
  Severity,
} from './types.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const priorityBySeverity: Readonly<Record<Severity, RecommendationPriority>> = {
  CRITICAL: 'P0',
  HIGH: 'P1',
  MEDIUM: 'P2',
  LOW: 'P3',
};

const priorityCapByRisk: Readonly<Record<Severity, RecommendationPriority>> = {
  LOW: 'P0',
  MEDIUM: 'P1',
  HIGH: 'P2',
  CRITICAL: 'P3',
};

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function timestampMilliseconds(timestamp: string): number | null {
  if (!ISO_TIMESTAMP_PATTERN.test(timestamp)) return null;

  const milliseconds = Date.parse(timestamp);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === timestamp
    ? milliseconds
    : null;
}

function priorityIndex(priority: RecommendationPriority): number {
  return Number(priority.slice(1));
}

function priorityFromIndex(index: number): RecommendationPriority {
  return `P${index}` as RecommendationPriority;
}

function isStale(capturedAt: string, maxAgeDays: number, evaluatedAtMilliseconds: number | null): boolean {
  const capturedAtMilliseconds = timestampMilliseconds(capturedAt);

  return capturedAtMilliseconds === null
    || evaluatedAtMilliseconds === null
    || !Number.isFinite(maxAgeDays)
    || maxAgeDays < 0
    || capturedAtMilliseconds > evaluatedAtMilliseconds
    || evaluatedAtMilliseconds - capturedAtMilliseconds > maxAgeDays * MILLISECONDS_PER_DAY;
}

export function createRecommendation(
  input: RecommendationInput,
  evaluatedAt: string,
): Recommendation {
  const holdReasons: HoldReason[] = [];
  const evaluatedAtMilliseconds = timestampMilliseconds(evaluatedAt);

  if (input.evidenceRefs.length === 0) {
    holdReasons.push('EVIDENCE_MISSING');
  } else if (input.evidenceRefs.some((evidence) => isStale(
    evidence.capturedAt,
    input.evidenceFreshness.maxAgeDays,
    evaluatedAtMilliseconds,
  ))) {
    holdReasons.push('EVIDENCE_STALE');
  }

  if (input.rollback === null || input.rollback.trim().length === 0) {
    holdReasons.push('ROLLBACK_MISSING');
  }

  const status = holdReasons.length > 0 ? 'HOLD' : 'NEW';
  const confidence: Confidence = status === 'NEW' ? 'HIGH' : 'LOW';
  const priority = priorityFromIndex(Math.max(
    priorityIndex(priorityBySeverity[input.severity]),
    priorityIndex(priorityCapByRisk[input.risk]),
  ));

  return {
    ...input,
    evidenceRefs: input.evidenceRefs.map((evidence) => ({ ...evidence })),
    evidenceFreshness: { ...input.evidenceFreshness },
    status,
    confidence,
    priority,
    holdReasons: [...holdReasons],
  };
}
