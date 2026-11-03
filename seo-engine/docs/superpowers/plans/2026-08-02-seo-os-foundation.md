# AutoTax SEO Operating System Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first working, read-only foundation of the AutoTax SEO Operating System: evidence/recommendation contracts, a bounded Search Console snapshot reader, crawl observations, an atomic audit ledger, and a report-only CLI.

**Architecture:** New modules live in `src/seo-os/` and only transform explicit inputs into typed snapshots, observations, recommendations and atomic ledger entries. The CLI reads local/site inputs and optional GSC credentials, writes a local report/ledger, and never publishes content, deploys, changes GSC data, or invokes Blogger APIs.

**Tech Stack:** TypeScript, Node.js built-ins, Vitest, `googleapis`, existing Astro project configuration.

---

## File structure

- `src/seo-os/types.ts`: immutable public contracts for evidence, observations, recommendations and run summaries.
- `src/seo-os/recommendations.ts`: evidence/freshness validation and transparent priority calculation.
- `src/seo-os/gsc.ts`: read-only Search Analytics client interface and environment validation.
- `src/seo-os/crawl.ts`: sitemap and HTML-link graph reconciliation plus status/canonical observations.
- `src/seo-os/ledger.ts`: local atomic audit-run ledger; production path is explicit only.
- `src/seo-os/report.ts`: converts observations into deterministic recommendations and a report summary.
- `scripts/seo-os/run-audit.ts`: report-only entrypoint with `--input`, `--output` and `--dry-run`.
- `tests/seo-os/*.test.ts`: contract, GSC, crawl, ledger, report and CLI behavior tests.
- `docs/MASTER_SPEC.md`: append the approved SEO OS architecture, contracts and phased rollout without contradicting BOD-32.

### Task 1: Evidence and recommendation contracts

**Files:**
- Create: `src/seo-os/types.ts`
- Create: `src/seo-os/recommendations.ts`
- Test: `tests/seo-os/recommendations.test.ts`

- [ ] **Step 1: Write failing tests for an evidenced, fresh recommendation and HOLD cases**

```ts
expect(createRecommendation(validInput)).toMatchObject({ status: 'NEW', confidence: 'HIGH' });
expect(createRecommendation({ ...validInput, evidenceRefs: [] }).status).toBe('HOLD');
expect(createRecommendation({ ...validInput, evidenceRefs: ['snapshot:stale'] }).status).toBe('HOLD');
```

- [ ] **Step 2: Run `npm test -- tests/seo-os/recommendations.test.ts` and verify RED**

- [ ] **Step 3: Implement only the typed contracts and `createRecommendation`**

```ts
export type RecommendationStatus = 'NEW' | 'HOLD' | 'APPROVED' | 'IMPLEMENTED' | 'MEASURED' | 'REJECTED';
export function createRecommendation(input: RecommendationInput): Recommendation {
  const missingEvidence = input.evidenceRefs.length === 0 || input.evidenceRefs.some((ref) => input.staleEvidenceRefs.includes(ref));
  return { ...input, status: missingEvidence || !input.rollback ? 'HOLD' : 'NEW', priority: calculatePriority(input) };
}
```

- [ ] **Step 4: Run the focused test and then `npm test`**

- [ ] **Step 5: Commit only Task 1 files**

### Task 2: Read-only Search Console snapshot adapter

**Files:**
- Create: `src/seo-os/gsc.ts`
- Test: `tests/seo-os/gsc.test.ts`

- [ ] **Step 1: Write failing tests for missing configuration, valid property format, and a mocked read-only query**

```ts
expect(readGscConfig({})).toEqual({ ok: false, reason: 'GSC_CONFIG_MISSING' });
expect(readGscConfig({ GSC_SITE_URL: 'sc-domain:autotaxpos.com', GSC_SERVICE_ACCOUNT_JSON: validJson }).ok).toBe(true);
await expect(snapshotGscPerformance(config, fakeClient)).resolves.toMatchObject({ source: 'GSC', rows: [{ clicks: 2 }] });
```

- [ ] **Step 2: Run `npm test -- tests/seo-os/gsc.test.ts` and verify RED**

- [ ] **Step 3: Implement `readGscConfig`, a dependency-injected `GscPerformanceClient`, and `snapshotGscPerformance`**

```ts
export interface GscPerformanceClient { query(request: GscQuery): Promise<GscRow[]>; }
export async function snapshotGscPerformance(config: GscConfig, client: GscPerformanceClient): Promise<GscSnapshot> {
  return { source: 'GSC', queriedAt: new Date().toISOString(), property: config.siteUrl, rows: await client.query(config.query) };
}
```

- [ ] **Step 4: Ensure the implementation requests only Search Analytics read scopes; run focused and full tests**

- [ ] **Step 5: Commit only Task 2 files**

### Task 3: Crawl observations and sitemap/link-graph audit

**Files:**
- Create: `src/seo-os/crawl.ts`
- Test: `tests/seo-os/crawl.test.ts`

- [ ] **Step 1: Write failing tests for sitemap-only URLs, link-only URLs, broken internal links and canonical mismatch**

```ts
const result = auditCrawl({ sitemapUrls: ['https://site/a'], pages: [{ url: 'https://site/', links: ['/missing'] }] });
expect(result.observations.map((item) => item.code)).toEqual(expect.arrayContaining(['ORPHAN_URL', 'BROKEN_INTERNAL_LINK']));
```

- [ ] **Step 2: Run `npm test -- tests/seo-os/crawl.test.ts` and verify RED**

- [ ] **Step 3: Implement URL normalization, sitemap/link graph reconciliation and observation records**

```ts
export function auditCrawl(input: CrawlInput): CrawlAuditResult {
  // Build a normalized internal-link set, then emit deterministic observations.
}
```

- [ ] **Step 4: Run focused and full tests**

- [ ] **Step 5: Commit only Task 3 files**

### Task 4: Atomic audit ledger and deterministic report

**Files:**
- Create: `src/seo-os/ledger.ts`
- Create: `src/seo-os/report.ts`
- Test: `tests/seo-os/ledger.test.ts`
- Test: `tests/seo-os/report.test.ts`

- [ ] **Step 1: Write failing tests for atomic ledger replacement, no secret serialization, and recommendation creation from observations**

```ts
await ledger.record(run);
expect(JSON.parse(await readFile(path, 'utf8')).runs).toHaveLength(1);
expect(JSON.stringify(await ledger.entries())).not.toContain('private_key');
expect(buildReport([orphanObservation]).recommendations[0]).toMatchObject({ auditId: 'CRAWL', status: 'NEW' });
```

- [ ] **Step 2: Run the two focused test files and verify RED**

- [ ] **Step 3: Implement locked atomic writes using the existing Blogger ledger pattern and a report-only mapper**

```ts
export function createAuditLedger(path = resolveAuditLedgerPath()): AuditLedger { /* temp file + rename + lock */ }
export function buildReport(observations: Observation[]): AuditReport { /* no network, no mutation */ }
```

- [ ] **Step 4: Run focused and full tests**

- [ ] **Step 5: Commit only Task 4 files**

### Task 5: CLI, documentation integration and final verification

**Files:**
- Create: `scripts/seo-os/run-audit.ts`
- Create: `tests/seo-os/run-audit.test.ts`
- Modify: `package.json`
- Modify: `docs/MASTER_SPEC.md`

- [ ] **Step 1: Write failing CLI tests that assert `--dry-run` writes no ledger, input is required, and output has no secrets**

```ts
await expect(runAuditCli(['--dry-run', '--input', fixturePath])).resolves.toMatchObject({ mode: 'DRY_RUN' });
await expect(runAuditCli([])).rejects.toThrow('AUDIT_INPUT_REQUIRED');
```

- [ ] **Step 2: Run `npm test -- tests/seo-os/run-audit.test.ts` and verify RED**

- [ ] **Step 3: Implement a local JSON-input, report-only CLI and add `seo:audit` npm script**

```json
"seo:audit": "tsx scripts/seo-os/run-audit.ts"
```

- [ ] **Step 4: Append the design’s contracts, audit catalogue, data-plane policy, release gates and phased rollout to `MASTER_SPEC`; explicitly retain BOD-32 as the Blogger authority**

- [ ] **Step 5: Run `npm test`, `npm run build`, and `npm run seo:audit -- --dry-run --input tests/seo-os/fixtures/sample-crawl.json`; inspect output for secrets and mutations**

- [ ] **Step 6: Commit only Task 5 files and the plan checklist updates**

## Plan self-review

- Specification coverage: Tasks 1–5 cover the foundation phase; optional paid providers, deployment enforcement, and autonomous mutations are deliberately deferred by the approved design.
- Placeholder scan: no implementation placeholders are used; each task names files, test behavior, command, and minimal interface.
- Type consistency: `Observation`, `Recommendation`, `GscSnapshot`, `AuditLedger`, and `AuditReport` are introduced in Task 1 and consumed consistently thereafter.
