import { createHash } from 'node:crypto';
import type { BloggerPost, GetPostAdminInput, InsertDraftInput } from './client.js';
import { enforceRequiredImage, prepareDraftHtml, type RequiredDraftImage } from './html-policy.js';
import { validateCandidateQuality } from './quality.js';
import type {
  BloggerCandidate,
  BloggerFact,
  BloggerGateResult,
  BloggerLedgerEntry,
  BloggerLedgerIdentity,
  BloggerLedgerStore,
  BloggerSite,
  BloggerTopic,
  BloggerTopicStatus,
  BloggerWorkerReason,
} from './types.js';

export interface WorkerClient {
  insertDraft(input: InsertDraftInput): Promise<BloggerPost>;
  getPostAdmin(input: GetPostAdminInput): Promise<BloggerPost>;
  verifyKnownDraft(input: {
    blogId: string; postId: string; expectedTitle: string; approvedDestination?: string;
    requiredImage: RequiredDraftImage; expectedHtml: string;
  }): Promise<BloggerPost>;
  listPosts(input: { blogId: string }): Promise<BloggerPost[]>;
}

export interface WorkerDependencies {
  sites: BloggerSite[];
  topics: BloggerTopic[];
  generateCandidate(site: BloggerSite, topic: BloggerTopic): Promise<BloggerCandidate>;
  validateConfiguration(site: BloggerSite, topic: BloggerTopic, candidate: BloggerCandidate): void;
  validateFacts(topic: BloggerTopic): BloggerGateResult;
  facts: readonly BloggerFact[];
  checkOriginality(candidate: BloggerCandidate): BloggerGateResult;
  applyHtmlPolicy(html: string, approvedDestination?: string): string;
  resolveRequiredImage(topic: BloggerTopic): RequiredDraftImage;
  ledger: BloggerLedgerStore;
  client: WorkerClient;
  topicStore: {
    setStatus(topic: BloggerTopic, status: BloggerTopicStatus, reason?: BloggerWorkerReason): Promise<void>;
  };
}

export type WorkerResult =
  | { status: 'NO_WORK' }
  | { status: 'HOLD' | 'REGENERATE'; reason: BloggerWorkerReason }
  | { status: 'COMPLETED'; postId: string; reconciled?: true };

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function normalizeTopicField(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/đ/giu, 'd')
    .toLocaleLowerCase('vi-VN').replace(/[^a-z0-9]+/gu, ' ').trim();
}

/**
 * Chọn blog để đăng trong lượt này khi có nhiều blog.
 *
 * Nguyên tắc: blog nào LÂU NHẤT chưa đăng thì được ưu tiên (round-robin theo thời gian
 * thực). Nếu cứ duyệt theo thứ tự khai báo, blog đầu danh sách sẽ hút hết mọi lượt cho
 * đến khi cạn hàng đợi, còn các blog sau im lìm hàng tháng — vừa phí vừa trông bất thường.
 */
function orderSitesByStaleness(sites: readonly BloggerSite[], entries: readonly BloggerLedgerEntry[]): BloggerSite[] {
  const lastPostAt = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status !== 'COMPLETED') continue;
    const at = Date.parse(entry.updatedAt ?? entry.createdAt ?? '');
    if (Number.isNaN(at)) continue;
    lastPostAt.set(entry.siteId, Math.max(lastPostAt.get(entry.siteId) ?? 0, at));
  }
  // Blog chưa đăng bài nào (không có mốc thời gian) được coi là "cũ nhất" → đi trước.
  return [...sites].sort((left, right) => (lastPostAt.get(left.siteId) ?? 0) - (lastPostAt.get(right.siteId) ?? 0));
}

function selectWork(deps: WorkerDependencies, orderedSites: readonly BloggerSite[]): { site: BloggerSite; topic: BloggerTopic } | undefined {
  for (const site of orderedSites) {
    if (!site.enabled) continue;
    // Chỉ lấy topic của kênh blogger — hàng đợi web chính (channel 'main' hoặc bỏ trống)
    // dành riêng cho pipeline dual-publish, hai bên không giành topic của nhau.
    const topic = deps.topics.find((item) => item.siteId === site.siteId
      && item.channel === 'blogger'
      && (item.status === 'PENDING' || item.status === 'REGENERATE'));
    if (topic) return { site, topic };
  }
  return undefined;
}

function hashTopicField(value: string): string {
  return hashContent(normalizeTopicField(value));
}

function identity(
  site: BloggerSite,
  topic: BloggerTopic,
  html: string,
  candidate?: BloggerCandidate,
): BloggerLedgerIdentity {
  return {
    key: `${site.blogId}:${topic.topicId}:${topic.contentVersion}`,
    siteId: site.siteId,
    blogId: site.blogId,
    topicId: topic.topicId,
    contentVersion: topic.contentVersion,
    contentHash: hashContent(html),
    expectedHtml: html,
    ...(candidate ? {
      titleHash: hashTopicField(candidate.title),
      slugHash: hashTopicField(candidate.slug),
      intentHash: hashTopicField(candidate.intent),
      clusterHash: hashTopicField(candidate.cluster),
      factClaims: candidate.factClaims,
    } : {}),
  };
}

function expectedInput(
  site: BloggerSite,
  candidate: BloggerCandidate,
  html: string,
  requiredImage: RequiredDraftImage,
) {
  return {
    title: candidate.title,
    html,
    labels: candidate.labels ?? [],
    approvedDestination: site.approvedDestination,
    requiredImage,
  };
}

function imageFailureReason(error: unknown): BloggerWorkerReason {
  return error instanceof Error && error.message === 'IMAGE_NOT_FOUND'
    ? 'IMAGE_NOT_FOUND'
    : 'IMAGE_POLICY_FAILED';
}

async function safeOutcome(
  deps: WorkerDependencies,
  site: BloggerSite,
  topic: BloggerTopic,
  candidate: BloggerCandidate,
  status: 'HOLD' | 'REGENERATE',
  reason: BloggerWorkerReason,
): Promise<WorkerResult> {
  const record = identity(site, topic, candidate.body, candidate);
  await deps.ledger.recordOutcome({ ...record, status, reason });
  await deps.topicStore.setStatus(topic, status, reason);
  return { status, reason };
}

async function reconcile(
  deps: WorkerDependencies,
  site: BloggerSite,
  topic: BloggerTopic,
  candidate: BloggerCandidate,
  html: string,
  requiredImage: RequiredDraftImage,
  entry: BloggerLedgerEntry,
): Promise<WorkerResult> {
  if (entry.status === 'COMPLETED' && entry.postId) {
    await deps.topicStore.setStatus(topic, 'COMPLETED');
    return { status: 'COMPLETED', postId: entry.postId, reconciled: true };
  }

  let postId = entry.postId;
  if (!postId) {
    const posts = await deps.client.listPosts({ blogId: site.blogId });
    postId = posts.find((post) => post.id && post.content
      && hashContent(post.content) === entry.contentHash)?.id ?? undefined;
  }
  if (!postId) {
    await deps.ledger.recordOutcome({
      ...entry, status: 'INSERT_STARTED', reason: 'INSERT_RECONCILIATION_REQUIRED',
    });
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'INSERT_RECONCILIATION_REQUIRED');
    throw new Error('INSERT_RECONCILIATION_REQUIRED');
  }

  try {
    const post = await deps.client.getPostAdmin({
      blogId: site.blogId,
      postId,
      expected: expectedInput(site, candidate, html, requiredImage),
    });
    if (validateCandidateQuality({ ...candidate, body: post.content ?? '' }, topic, deps.facts).decision === 'HOLD') {
      throw new Error('VERIFY_FAILED');
    }
  } catch (error) {
    await deps.ledger.recordOutcome({ ...entry, status: 'INSERT_STARTED', postId, reason: 'VERIFY_FAILED' });
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'VERIFY_FAILED');
    throw error;
  }
  await deps.ledger.recordCompleted(entry.key, postId);
  await deps.topicStore.setStatus(topic, 'COMPLETED');
  return { status: 'COMPLETED', postId, reconciled: true };
}

async function reconcileKnownInsert(
  deps: WorkerDependencies,
  site: BloggerSite,
  topic: BloggerTopic,
  entry: BloggerLedgerEntry,
): Promise<WorkerResult> {
  if (!entry.postId) throw new Error('INSERT_RECONCILIATION_REQUIRED');
  if (!entry.expectedHtml || !entry.factClaims) {
    await deps.ledger.recordOutcome({ ...entry, status: 'HOLD', reason: 'QUALITY_GATE_FAILED' });
    await deps.topicStore.setStatus(topic, 'HOLD', 'QUALITY_GATE_FAILED');
    return { status: 'HOLD', reason: 'QUALITY_GATE_FAILED' };
  }
  const expectedCandidate: BloggerCandidate = {
    title: topic.title, slug: topic.topicId, intent: topic.intent, cluster: topic.cluster,
    body: entry.expectedHtml, factClaims: entry.factClaims,
  };
  const expectedQuality = validateCandidateQuality(expectedCandidate, topic, deps.facts);
  if (expectedQuality.decision === 'HOLD') {
    const reason = expectedQuality.reason ?? 'QUALITY_GATE_FAILED';
    await deps.ledger.recordOutcome({ ...entry, status: 'HOLD', reason });
    await deps.topicStore.setStatus(topic, 'HOLD', reason);
    return { status: 'HOLD', reason };
  }
  let requiredImage: RequiredDraftImage;
  try {
    requiredImage = deps.resolveRequiredImage(topic);
  } catch (error) {
    const reason = imageFailureReason(error);
    await deps.ledger.recordOutcome({ ...entry, status: 'HOLD', reason });
    await deps.topicStore.setStatus(topic, 'HOLD', reason);
    return { status: 'HOLD', reason };
  }
  try {
    const post = await deps.client.verifyKnownDraft({
      blogId: site.blogId,
      postId: entry.postId,
      expectedTitle: topic.title,
      approvedDestination: site.approvedDestination,
      requiredImage,
      expectedHtml: entry.expectedHtml,
    });
    if (validateCandidateQuality({ ...expectedCandidate, body: post.content ?? '' }, topic, deps.facts).decision === 'HOLD') {
      throw new Error('VERIFY_FAILED');
    }
  } catch (error) {
    await deps.ledger.recordOutcome({ ...entry, status: 'INSERT_STARTED', reason: 'VERIFY_FAILED' });
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'VERIFY_FAILED');
    throw error;
  }
  await deps.ledger.recordCompleted(entry.key, entry.postId);
  await deps.topicStore.setStatus(topic, 'COMPLETED');
  return { status: 'COMPLETED', postId: entry.postId, reconciled: true };
}

export async function runWorker(deps: WorkerDependencies): Promise<WorkerResult> {
  const priorEntries = await deps.ledger.entries();
  const work = selectWork(deps, orderSitesByStaleness(deps.sites, priorEntries));
  if (!work) return { status: 'NO_WORK' };
  const { site, topic } = work;
  const known = await deps.ledger.get(`${site.blogId}:${topic.topicId}:${topic.contentVersion}`);
  if (known?.status === 'INSERT_STARTED' && known.postId) {
    return reconcileKnownInsert(deps, site, topic, known);
  }
  let candidate: BloggerCandidate;
  try {
    candidate = await deps.generateCandidate(site, topic);
  } catch {
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'GENERATION_INVALID');
    return { status: 'REGENERATE', reason: 'GENERATION_INVALID' };
  }

  deps.validateConfiguration(site, topic, candidate);
  const facts = deps.validateFacts(topic);
  if (facts.decision === 'HOLD') {
    return safeOutcome(deps, site, topic, candidate, 'HOLD', facts.reason ?? 'FACT_NOT_FOUND');
  }
  const originality = deps.checkOriginality(candidate);
  if (originality.decision === 'HOLD') {
    const reason = originality.reason ?? 'SIMILARITY_HOLD';
    const status = reason === 'SIMILARITY_HOLD' ? 'REGENERATE' : 'HOLD';
    return safeOutcome(deps, site, topic, candidate, status, reason);
  }

  let requiredImage: RequiredDraftImage;
  try {
    requiredImage = deps.resolveRequiredImage(topic);
  } catch (error) {
    return safeOutcome(deps, site, topic, candidate, 'HOLD', imageFailureReason(error));
  }

  let preparedHtml: string;
  try {
    preparedHtml = prepareDraftHtml(candidate.body, requiredImage, site.approvedDestination ?? 'https://autotaxpos.com/');
  } catch {
    return safeOutcome(deps, site, topic, candidate, 'HOLD', 'IMAGE_POLICY_FAILED');
  }

  let html: string;
  try {
    html = deps.applyHtmlPolicy(preparedHtml, site.approvedDestination);
    enforceRequiredImage(html, requiredImage);
  } catch (error) {
    const reason = error instanceof Error && /screenshot|image/i.test(error.message)
      ? 'IMAGE_POLICY_FAILED'
      : 'HTML_POLICY_FAILED';
    return safeOutcome(deps, site, topic, candidate, 'HOLD', reason);
  }
  const finalCandidate = { ...candidate, body: html };
  const quality = validateCandidateQuality(finalCandidate, topic, deps.facts);
  if (quality.decision === 'HOLD') {
    return safeOutcome(deps, site, topic, finalCandidate, 'HOLD', quality.reason ?? 'FACT_EVIDENCE_MISSING');
  }

  const record = identity(site, topic, html, finalCandidate);
  if (!await deps.ledger.reserveInsert(record)) {
    const entry = await deps.ledger.get(record.key);
    if (!entry) throw new Error('IDEMPOTENCY_BLOCKED');
    return reconcile(deps, site, topic, candidate, html, requiredImage, entry);
  }

  let inserted: BloggerPost;
  try {
    inserted = await deps.client.insertDraft({
      blogId: site.blogId,
      ...expectedInput(site, candidate, html, requiredImage),
    });
  } catch (error) {
    await deps.ledger.recordOutcome({ ...record, status: 'INSERT_STARTED', reason: 'BLOGGER_INSERT_FAILED' });
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'BLOGGER_INSERT_FAILED');
    throw error;
  }
  if (!inserted.id) {
    await deps.ledger.recordOutcome({
      ...record, status: 'INSERT_STARTED', reason: 'VERIFY_FAILED',
    });
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'VERIFY_FAILED');
    throw new Error('VERIFY_FAILED');
  }
  await deps.ledger.recordPostId(record.key, inserted.id);
  try {
    const post = await deps.client.getPostAdmin({
      blogId: site.blogId,
      postId: inserted.id,
      expected: expectedInput(site, candidate, html, requiredImage),
    });
    if (validateCandidateQuality({ ...finalCandidate, body: post.content ?? '' }, topic, deps.facts).decision === 'HOLD') {
      throw new Error('VERIFY_FAILED');
    }
  } catch (error) {
    await deps.ledger.recordOutcome({
      ...record, status: 'INSERT_STARTED', postId: inserted.id, reason: 'VERIFY_FAILED',
    });
    await deps.topicStore.setStatus(topic, 'REGENERATE', 'VERIFY_FAILED');
    throw error;
  }
  await deps.ledger.recordCompleted(record.key, inserted.id);
  await deps.topicStore.setStatus(topic, 'COMPLETED');
  return { status: 'COMPLETED', postId: inserted.id };
}
