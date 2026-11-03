export type BloggerTopicStatus =
  | 'PENDING'
  | 'GENERATED'
  | 'COMPLETED'
  | 'HOLD'
  | 'REGENERATE';

export interface BloggerSite {
  siteId: string;
  blogId: string;
  enabled: boolean;
  charter: string;
  cadenceDays: number;
  approvedDestination?: string;
}

export interface BloggerTopic {
  topicId: string;
  siteId: string;
  /** Kênh tiêu thụ topic; thiếu = 'main' (hàng đợi web chính). */
  channel?: 'main' | 'blogger';
  title: string;
  intent: string;
  cluster: string;
  sourceFactIds: string[];
  contentVersion: string;
  status: BloggerTopicStatus;
  forbiddenPrimarySlugs?: string[];
}

export type BloggerGateDecision = 'PASS' | 'HOLD';

export type BloggerGateReason =
  | 'FACT_NOT_FOUND'
  | 'FACT_EXPIRED'
  | 'FACT_EVIDENCE_MISSING'
  | 'FACT_EVIDENCE_INVALID'
  | 'FACT_CLAIM_UNDECLARED'
  | 'QUALITY_GATE_FAILED'
  | 'PRIMARY_TOPIC_COLLISION'
  | 'LEDGER_TOPIC_COLLISION'
  | 'SIMILARITY_HOLD';

export interface BloggerGateResult {
  decision: BloggerGateDecision;
  reason?: BloggerGateReason;
}

export interface BloggerFact {
  factId: string;
  reviewByDate: string;
  [key: string]: unknown;
}

export interface BloggerCandidate {
  title: string;
  slug: string;
  intent: string;
  cluster: string;
  body: string;
  labels?: string[];
  /** Each rendered factual claim must name its supporting approved fact. */
  factClaims?: BloggerFactClaim[];
}

export interface BloggerFactClaim {
  factId: string;
  claim: string;
}

export type BloggerLedgerStatus =
  | 'INSERT_STARTED'
  | 'COMPLETED'
  | 'HOLD'
  | 'REGENERATE';

export type BloggerWorkerReason = BloggerGateReason
  | 'HTML_POLICY_FAILED'
  | 'IMAGE_POLICY_FAILED'
  | 'IMAGE_NOT_FOUND'
  | 'IDEMPOTENCY_BLOCKED'
  | 'INSERT_RECONCILIATION_REQUIRED'
  | 'BLOGGER_INSERT_FAILED'
  | 'VERIFY_FAILED'
  | 'GENERATION_INVALID';

export interface BloggerLedgerIdentity {
  key: string;
  siteId: string;
  blogId: string;
  topicId: string;
  contentVersion: string;
  contentHash: string;
  expectedHtml?: string;
  factClaims?: BloggerFactClaim[];
  titleHash?: string;
  slugHash?: string;
  intentHash?: string;
  clusterHash?: string;
}

export interface BloggerLedgerEntry extends BloggerLedgerIdentity {
  status: BloggerLedgerStatus;
  createdAt: string;
  updatedAt: string;
  postId?: string;
  reason?: BloggerWorkerReason;
}

export interface BloggerLedgerStore {
  get(key: string): Promise<BloggerLedgerEntry | undefined>;
  entries(): Promise<BloggerLedgerEntry[]>;
  canInsert(key: string): Promise<boolean>;
  reserveInsert(entry: BloggerLedgerIdentity): Promise<boolean>;
  recordInsertStarted(entry: BloggerLedgerIdentity): Promise<void>;
  recordPostId(key: string, postId: string): Promise<void>;
  recordCompleted(key: string, postId: string): Promise<void>;
  recordOutcome(
    entry: BloggerLedgerIdentity & {
      status: BloggerLedgerStatus;
      reason?: BloggerWorkerReason;
      postId?: string;
    },
  ): Promise<void>;
}

export interface OriginalityRecord extends BloggerCandidate {}

export interface SemanticComparison {
  modelId?: string;
  metric?: string;
  similarity?: number;
  threshold?: number;
}

export type SemanticComparator = (
  candidate: BloggerCandidate,
  corpus: readonly OriginalityRecord[],
) => SemanticComparison | undefined;
