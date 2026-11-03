# AutoTax Blogger Draft Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build an isolated VPS worker that creates at most one verified Blogger draft per run from a site-specific topic queue, while blocking content that overlaps AutoTax's primary blog.

**Architecture:** The existing Astro primary-blog pipeline remains unchanged. New Blogger modules validate configuration and facts, compare a fresh candidate against primary AutoTax articles and Blogger history, sanitize HTML, create only a Blogger draft, and read it back through the admin API view. Its durable ledger is outside the deploy archive and the cron job has an independent lock.

**Tech Stack:** Node.js 22, TypeScript/tsx, Astro content collections, googleapis, Zod, sanitize-html, Vitest, Linux cron, flock.

---

## File structure

| File | Responsibility |
| --- | --- |
| config/blogger-sites.json | Non-secret configuration for up to three Blogger sites and independent editorial charters. |
| config/topics.json | Blogger-only topic queue. |
| src/blogger/types.ts | Shared site, topic, candidate, ledger, and result-code types. |
| src/blogger/config.ts | Zod schemas and JSON loaders. |
| src/blogger/facts.ts | Validates references to data/facts.json. |
| src/blogger/originality.ts | Compares candidates with src/content/articles and the ledger. |
| src/blogger/html-policy.ts | Sanitization and one-contextual-link enforcement. |
| src/blogger/auth.ts | OAuth client construction without secret logging. |
| src/blogger/client.ts | Narrow Blogger API adapter: insert, get, list only. |
| src/blogger/ledger.ts | Atomic external ledger persistence and idempotency. |
| src/blogger/worker.ts | Gate orchestration and draft/read-back flow. |
| scripts/blogger/run-worker.ts | Exit-code-safe CLI entry point. |
| scripts/blogger/cron.sh | Production flock wrapper. |
| tests/blogger/*.test.ts | Unit and orchestration regressions. |
| docs/blogger-draft-operations.md | OAuth, pilot, review, and recovery runbook. |

### Task 1: Establish test tooling and safe configuration

**Files:**
- Modify: D:/AutoTax/seo-engine/package.json
- Modify: D:/AutoTax/seo-engine/.env.example
- Modify: D:/AutoTax/seo-engine/.gitignore
- Create: D:/AutoTax/seo-engine/config/blogger-sites.json
- Create: D:/AutoTax/seo-engine/config/topics.json
- Create: D:/AutoTax/seo-engine/src/blogger/types.ts
- Create: D:/AutoTax/seo-engine/src/blogger/config.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/config.test.ts

- [ ] **Step 1: Write failing schema tests.**

~~~
import { describe, expect, it } from 'vitest';
import { parseBloggerSites, parseTopics } from '../../src/blogger/config.js';

describe('Blogger configuration', () => {
  it('rejects more than three sites', () => {
    expect(() => parseBloggerSites({ sites: Array.from({ length: 4 }, (_, i) => ({
      siteId: 'site-' + i, blogId: String(i), enabled: false, charter: 'Info',
      cadenceDays: 7, approvedDestination: 'https://autotaxpos.com/'
    })) })).toThrow(/maximum of 3/i);
  });

  it('rejects a topic whose site is absent', () => {
    expect(() => parseTopics([{ topicId: 't1', siteId: 'missing', title: 'Title',
      intent: 'guide', cluster: 'pos', sourceFactIds: ['fact_001'],
      contentVersion: 'v1', status: 'PENDING' }], new Set(['site-a']))).toThrow(/siteId/i);
  });
});
~~~

- [ ] **Step 2: Verify RED.**

Run: npm exec vitest run tests/blogger/config.test.ts

Expected: FAIL because Vitest and config modules do not exist.

- [ ] **Step 3: Add dependencies and scripts.**

Run: npm install zod sanitize-html

Run: npm install --save-dev vitest @types/sanitize-html

Add these package scripts:

~~~
"test": "vitest run",
"test:blogger": "vitest run tests/blogger"
~~~

Add only these variable names to .env.example: BLOGGER_OAUTH_CLIENT_ID, BLOGGER_OAUTH_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN, BLOGGER_LEDGER_PATH, BLOGGER_SIMILARITY_THRESHOLD. Add .blogger-oauth.json to .gitignore.

- [ ] **Step 4: Implement configuration parsing.**

Use Zod to enforce a maximum of three unique siteId/blogId pairs, cadenceDays from 1 to 90, HTTPS approvedDestination, non-empty charter, and the five topic states PENDING, GENERATED, COMPLETED, HOLD, REGENERATE. Require every topic siteId to exist.

~~~
export function parseTopics(value: unknown, siteIds: Set<string>) {
  const topics = topicArraySchema.parse(value);
  for (const topic of topics) {
    if (!siteIds.has(topic.siteId)) throw new Error('Unknown siteId: ' + topic.siteId);
  }
  return topics;
}
~~~

Create disabled site and PENDING topic examples. Never commit real Blogger IDs or OAuth values.

- [ ] **Step 5: Verify GREEN and commit.**

Run: npm run test:blogger -- config.test.ts

Expected: PASS.

~~~
git add package.json package-lock.json .env.example .gitignore config/blogger-sites.json config/topics.json src/blogger tests/blogger
git commit -m "feat(blogger): add safe draft configuration"
~~~

### Task 2: Add fact validation and no-duplicate gates

**Files:**
- Create: D:/AutoTax/seo-engine/src/blogger/facts.ts
- Create: D:/AutoTax/seo-engine/src/blogger/originality.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/facts.test.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/originality.test.ts

- [ ] **Step 1: Write failing fact/originality tests.**

~~~
it('holds an expired fact', () => {
  expect(validateFacts(['fact_1'], [{ factId: 'fact_1', reviewByDate: '2020-01-01T00:00:00Z' }], new Date('2026-08-01')))
    .toMatchObject({ decision: 'HOLD', reason: 'FACT_EXPIRED' });
});

it('holds an exact primary-blog title or intent collision', () => {
  expect(checkOriginality(candidate('Quản lý kho', 'inventory guide'), [article('Quản lý kho', 'inventory guide')], []))
    .toMatchObject({ decision: 'HOLD', reason: 'PRIMARY_TOPIC_COLLISION' });
});
~~~

- [ ] **Step 2: Verify RED.**

Run: npm exec vitest run tests/blogger/facts.test.ts tests/blogger/originality.test.ts

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement fact and corpus loading.**

Load data/facts.json; each referenced fact must exist and its reviewByDate must not be before the run time. Parse every primary-blog Markdown file in src/content/articles/**/*.md, including frontmatter and body. Do not use src/content/blog because it does not exist in AutoTax.

- [ ] **Step 4: Implement originality decisions.**

Normalize Vietnamese title and slug text; hold on exact title, slug, intent, cluster, or SHA-256 body match. Compare against primary articles and ledger entries. Semantic similarity is model-specific: if its metric or threshold is missing, return SIMILARITY_HOLD; otherwise hold when it is at or above BLOGGER_SIMILARITY_THRESHOLD. No duplicate or ambiguous candidate may call Blogger.

~~~
if (sameTitle || sameSlug || sameIntent || sameCluster || sameHash) {
  return { decision: 'HOLD', reason: 'PRIMARY_TOPIC_COLLISION' };
}
if (similarity === undefined || similarity >= threshold) {
  return { decision: 'HOLD', reason: 'SIMILARITY_HOLD' };
}
return { decision: 'PASS' };
~~~

- [ ] **Step 5: Verify GREEN and commit.**

Run: npm exec vitest run tests/blogger/facts.test.ts tests/blogger/originality.test.ts

Expected: PASS.

~~~
git add src/blogger/facts.ts src/blogger/originality.ts tests/blogger
git commit -m "feat(blogger): gate facts and duplicate content"
~~~

### Task 3: Sanitize draft HTML and enforce referral policy

**Files:**
- Create: D:/AutoTax/seo-engine/src/blogger/html-policy.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/html-policy.test.ts

- [ ] **Step 1: Write failing policy tests.**

~~~
it('removes scripts and event attributes', () => {
  expect(sanitizeDraftHtml('<p onclick="x()">Safe</p><script>alert(1)</script>')).toBe('<p>Safe</p>');
});

it('rejects a second referral link', () => {
  const html = '<a href="https://autotaxpos.com/?utm_source=blogger&utm_medium=referral&utm_campaign=x">one</a>'
    + '<a href="https://autotaxpos.com/?utm_source=blogger&utm_medium=referral&utm_campaign=x">two</a>';
  expect(() => enforceLinks(html, 'https://autotaxpos.com/')).toThrow(/one/i);
});
~~~

- [ ] **Step 2: Verify RED.**

Run: npm exec vitest run tests/blogger/html-policy.test.ts

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement policy.**

Use sanitize-html rather than DOMPurify so the Node worker does not need jsdom. Allow semantic text tags and a only; strip scripts, styles, iframes, images, and all event attributes. Permit zero or one link. The one link must use HTTPS, remain within approvedDestination, include utm_source, utm_medium, utm_campaign, and have the exact rel value nofollow noopener noreferrer. Reject malformed links; do not silently repair them.

- [ ] **Step 4: Verify GREEN and commit.**

Run: npm exec vitest run tests/blogger/html-policy.test.ts

Expected: PASS.

~~~
git add src/blogger/html-policy.ts tests/blogger/html-policy.test.ts
git commit -m "feat(blogger): enforce HTML and link policy"
~~~

### Task 4: Add draft-only Blogger client and read-back verification

**Files:**
- Create: D:/AutoTax/seo-engine/src/blogger/auth.ts
- Create: D:/AutoTax/seo-engine/src/blogger/client.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/client.test.ts

- [ ] **Step 1: Write the failing draft-boundary test.**

~~~
it('always passes literal isDraft true', async () => {
  const calls: unknown[] = [];
  const client = createBloggerClient({ insert: async (request: unknown) => {
    calls.push(request); return { data: { id: 'p1' } };
  }} as any);
  await client.insertDraft({ blogId: 'b1', title: 'T', html: '<p>x</p>', labels: [] });
  expect(calls).toEqual([expect.objectContaining({ isDraft: true })]);
  expect(JSON.stringify(calls)).not.toContain('publish');
});
~~~

- [ ] **Step 2: Verify RED.**

Run: npm exec vitest run tests/blogger/client.test.ts

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement OAuth and a narrow adapter.**

Build Google OAuth2 from the three required environment variables. Throw generic configuration errors without printing values. Expose insertDraft, getPostAdmin, and listPosts only; do not create publish, update, revert, or delete wrappers. insertDraft calls posts.insert with literal isDraft: true. getPostAdmin calls posts.get with view: ADMIN, then verifies status equals DRAFT, matching title/content, labels, and policy-compliant links.

- [ ] **Step 4: Add the failing/read-back test, verify GREEN, and commit.**

Add a test that a LIVE status or a changed title produces VERIFY_FAILED. Run: npm exec vitest run tests/blogger/client.test.ts. Expected: PASS.

~~~
git add src/blogger/auth.ts src/blogger/client.ts tests/blogger/client.test.ts
git commit -m "feat(blogger): create and verify drafts only"
~~~

### Task 5: Add external atomic ledger and gated worker

**Files:**
- Create: D:/AutoTax/seo-engine/src/blogger/ledger.ts
- Create: D:/AutoTax/seo-engine/src/blogger/worker.ts
- Create: D:/AutoTax/seo-engine/scripts/blogger/run-worker.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/ledger.test.ts
- Test: D:/AutoTax/seo-engine/tests/blogger/worker.test.ts

- [ ] **Step 1: Write failing idempotency and failure tests.**

~~~
it('does not insert again after INSERT_STARTED', async () => {
  const ledger = await createTempLedger([{ key: 'b1:t1:v1', status: 'INSERT_STARTED' }]);
  expect(await ledger.canInsert('b1:t1:v1')).toBe(false);
});

it('does not complete a topic when read-back fails', async () => {
  await expect(runWorker(depsWithReadBack({ status: 'LIVE' }))).rejects.toThrow(/VERIFY_FAILED/);
  expect(depsWithReadBack().topicStore.completed).toEqual([]);
});
~~~

- [ ] **Step 2: Verify RED.**

Run: npm exec vitest run tests/blogger/ledger.test.ts tests/blogger/worker.test.ts

Expected: FAIL because ledger and worker do not exist.

- [ ] **Step 3: Implement external, atomic state.**

Resolve BLOGGER_LEDGER_PATH. Development defaults to state/blogger-ledger-local.json; production requires /var/lib/autotax-seo/blogger-ledger.json. Write to a .tmp sibling, fsync the file, then rename atomically. Store only IDs, topic/content hashes, statuses, timestamps, Blogger post IDs, and reason codes. Record INSERT_STARTED before the network request and reconcile a timeout through list/get before retrying.

- [ ] **Step 4: Implement worker ordering.**

Select one eligible site and one PENDING or REGENERATE topic. Generate a fresh site-specific candidate, then run config, fact, originality, HTML/link, ledger, insert, and read-back gates in that exact order. Mark COMPLETED only after read-back passes. Mark HOLD or REGENERATE with a reason code on a safe rejection. Never call the primary AutoTax generator and never modify src/content/articles.

- [ ] **Step 5: Set a guaranteed non-zero CLI failure status.**

~~~
main().catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED', reason: error instanceof Error ? error.message : 'UNKNOWN' }));
  process.exitCode = 1;
});
~~~

- [ ] **Step 6: Verify GREEN and commit.**

Run: npm exec vitest run tests/blogger/ledger.test.ts tests/blogger/worker.test.ts

Expected: PASS.

~~~
git add src/blogger/ledger.ts src/blogger/worker.ts scripts/blogger/run-worker.ts tests/blogger
git commit -m "feat(blogger): add idempotent draft worker"
~~~

### Task 6: Deploy safely and complete the pilot

**Files:**
- Modify: D:/AutoTax/seo-engine/deploy_v32.cjs
- Create: D:/AutoTax/seo-engine/scripts/blogger/cron.sh
- Create: D:/AutoTax/seo-engine/src/blogger/cron.ts
- Create: D:/AutoTax/seo-engine/docs/blogger-draft-operations.md
- Test: D:/AutoTax/seo-engine/tests/blogger/cron.test.ts

- [ ] **Step 1: Write a failing cron isolation test.**

~~~
it('uses a Blogger-specific lock', () => {
  const cron = buildBloggerCron('/var/www/autotax/seo-engine');
  expect(cron).toContain('/var/lock/autotax_blogger.lock');
  expect(cron).toContain('scripts/blogger/run-worker.ts');
  expect(cron).not.toContain('seo-daily.lock');
});
~~~

- [ ] **Step 2: Verify RED.**

Run: npm exec vitest run tests/blogger/cron.test.ts

Expected: FAIL because the cron builder does not exist.

- [ ] **Step 3: Add an independent production wrapper.**

Implement `buildBloggerCron(projectRoot: string): string` in `src/blogger/cron.ts`; it returns the exact cron command below so the deployment code and its test use one source of truth.

~~~
#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/flock -n /var/lock/autotax_blogger.lock -- /usr/bin/npx tsx /var/www/autotax/seo-engine/scripts/blogger/run-worker.ts
~~~

Make the file executable. Modify deploy_v32.cjs to remove only prior autotax-blogger cron lines, retain both existing AutoTax cron lines unchanged, and add the Blogger cron disabled/commented during pilot.

- [ ] **Step 4: Write the operations runbook.**

Document Blogger OAuth scope, secrets on the VPS, the external ledger path, a test-blog setup, manual worker invocation, non-secret result logs, and recovery for INSERT_STARTED, VERIFY_FAILED, FACT_EXPIRED, PRIMARY_TOPIC_COLLISION, and SIMILARITY_HOLD.

- [ ] **Step 5: Verify GREEN, then execute a four-draft pilot.**

Run:

~~~
npm run test:blogger
npm run build
git diff --check
~~~

Expected: all commands exit 0.

Manually run the worker against one test blog for four separate, human-reviewed topics. For every run verify a Blogger draft exists but no public post exists, the ledger has one non-secret entry, and the candidate does not overlap src/content/articles. Keep the Blogger cron disabled until the pilot is explicitly approved.

- [ ] **Step 6: Commit.**

~~~
git add deploy_v32.cjs scripts/blogger/cron.sh docs/blogger-draft-operations.md tests/blogger/cron.test.ts
git commit -m "docs(blogger): add VPS pilot operations"
~~~

## Completion criteria

- The primary AutoTax blog pipeline remains unchanged.
- One run selects at most one Blogger site and creates at most one draft.
- All Blogger creation calls pass literal isDraft: true and no publish code path exists.
- Every draft passes fact, originality, HTML/link, idempotency, and read-back gates.
- No candidate with a matching title, slug, intent, cluster, exact hash, or unsafe semantic similarity to src/content/articles can create a draft.
- The ledger survives deploys and retries cannot create duplicate drafts.
- Blogger scheduling is lock-protected and remains disabled until four human-reviewed pilot drafts pass.
