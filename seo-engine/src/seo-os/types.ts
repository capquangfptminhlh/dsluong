export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type RecommendationStatus = 'NEW' | 'HOLD' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';

export type RecommendationPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface EvidenceReference {
  readonly id: string;
  readonly capturedAt: string;
}

export interface EvidenceFreshness {
  readonly maxAgeDays: number;
}

export interface Observation {
  readonly code: string;
  readonly auditId: string;
  readonly sourceUrls: readonly string[];
  readonly severity: Severity;
  readonly evidenceRefs: readonly EvidenceReference[];
}

export interface RecommendationInput {
  readonly id: string;
  readonly severity: Severity;
  readonly risk: Severity;
  readonly evidenceRefs: readonly EvidenceReference[];
  readonly evidenceFreshness: EvidenceFreshness;
  readonly expectedMetric: string;
  readonly baseline: number;
  readonly proposedChange: string;
  readonly owner: string;
  readonly rollback: string | null;
}

export type HoldReason = 'EVIDENCE_MISSING' | 'EVIDENCE_STALE' | 'ROLLBACK_MISSING';

export interface Recommendation extends RecommendationInput {
  readonly status: RecommendationStatus;
  readonly confidence: Confidence;
  readonly priority: RecommendationPriority;
  readonly holdReasons: readonly HoldReason[];
}

export interface AuditRecommendation extends Recommendation {
  readonly auditId: string;
  readonly observationCode: string;
  readonly sourceUrls: readonly string[];
}

export interface AuditSummary {
  readonly observations: number;
  readonly recommendations: number;
  readonly statuses: Readonly<Record<'NEW' | 'HOLD', number>>;
  readonly severities: Readonly<Record<Severity, number>>;
}

export interface AuditReport {
  readonly observations: readonly Observation[];
  readonly recommendations: readonly AuditRecommendation[];
  readonly summary: AuditSummary;
}

export interface AuditRun {
  readonly id: string;
  readonly mode: 'LOCAL';
  readonly inputPath: string;
  readonly outputPath?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly summary: AuditSummary;
}

export interface AuditLedger {
  record(run: AuditRun): Promise<void>;
  entries(): Promise<readonly AuditRun[]>;
}
