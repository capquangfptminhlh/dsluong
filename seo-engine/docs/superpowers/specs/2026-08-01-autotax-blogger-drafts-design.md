# AutoTax Blogger Draft Automation Design

## Purpose

Add a separate owned-media workflow for one to three Blogger sites. It automatically creates at most one **draft** per run, never publishes a Blogger post, and keeps every external article substantively distinct from AutoTax's primary blog at `autotaxpos.com/blog`.

## Scope

The existing Astro SEO engine remains the source for the primary AutoTax blog. The new Blogger worker is a separate VPS process with its own topic queues, OAuth credentials, execution lock, durable ledger, and verification rules. It may use AutoTax's reviewed facts, but it must not copy, rewrite, or republish a primary-site article.

V1 supports 1-3 Blogger sites and creates drafts only. It excludes Blogger `posts.publish`, bulk posting, browser automation, account creation, CAPTCHA handling, and automatic publishing.

## Site and topic model

`config/blogger-sites.json` defines a maximum of three non-secret sites. Every site has a unique `siteId`, Blogger `blogId`, enabled flag, independent editorial charter, cadence, and the optional approved AutoTax destination for one contextual referral link.

`config/topics.json` is independent from the primary blog queue. Each record includes `topicId`, `siteId`, title, search intent, content cluster, source fact IDs, content version, status, and optional forbidden primary-site slugs. Topics must fit their site's charter. A topic is not considered complete until Blogger read-back confirms the draft.

## Content safety and originality gates

Before a Blogger API call, the worker must:

1. validate configuration and OAuth availability without logging secrets;
2. validate each factual claim against `data/facts.json` and reject expired, missing, or unsupported claims;
3. compare the proposed title, normalized slug, intent, cluster, and body against all primary AutoTax articles and previous Blogger ledger entries;
4. reject exact hashes and hold content whose title, intent/cluster, or semantic similarity exceeds the configured threshold;
5. sanitize HTML and enforce at most one natural contextual referral link, using HTTPS, UTM parameters, and `rel="nofollow noopener noreferrer"`.

No ambiguous or duplicate candidate may become a draft. A failed originality gate records `HOLD` or `REGENERATE`; it does not call Blogger. Regeneration creates a new candidate and repeats every gate. Only a candidate that passes all gates may be inserted.

## Draft-only Blogger boundary

The Blogger client exposes only `insertPost`, `getPost`, and `listPosts`. `insertPost` receives the literal `isDraft: true`; no publish mode, publish environment variable, or `posts.publish` API wrapper exists. After insertion, the worker reads the post back and verifies the blog ID, post ID, draft state, title, labels, and link policy. Any mismatch is `VERIFY_FAILED` and exits non-zero.

## Execution and state

The worker runs independently from `pipeline/daily.ts` via a dedicated VPS cron entry and `/usr/bin/flock`. One run selects one eligible site and one topic, then exits after the first final outcome.

The durable Blogger ledger lives outside the deploy archive at `/var/lib/autotax-seo/blogger-ledger.json`; writes use a temporary file followed by atomic rename. It stores only identifiers, content hashes, statuses, timestamps, Blogger post IDs, and non-secret reason codes. It records `INSERT_STARTED` before the API request and reconciles a timeout by lookup before retrying.

The pipeline exits non-zero for any failed generation, fact gate, originality gate, API call, read-back, or build-independent worker error. It must set a non-zero process exit code in its top-level catch. A scheduled-run log and non-secret run summary must make the result observable.

## Validation and rollout

Tests cover config limits, draft-only API calls, fact validation, primary-site and ledger duplicate detection, sanitizer/link policy, ledger idempotency, failure exit codes, and read-back verification. The workflow first runs manually on one test Blogger site. Four human-reviewed pilot drafts must complete with no public posts, duplicates, secret leakage, or failed read-backs before enabling the scheduled Blogger cron.

## Success criteria

- Every Blogger draft passes fact, originality, HTML/link, idempotency, and read-back gates.
- No Blogger draft duplicates a primary-site title, intent, cluster, or near-identical body.
- No code path can publish a Blogger post.
- A failed run cannot mark a topic completed or create a duplicate retry.
- Blogger failures never alter or block the primary AutoTax blog pipeline.
