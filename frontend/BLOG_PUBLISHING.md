# AutoTax Blog Publishing Contract

AutoTax is an existing production/brownfield project. Article publishing uses an ARTICLE-LEVEL editorial gate. Full-site `launch_completeness_decision` is a separate completion-claim gate and is NOT an automatic blocker for a qualified individual blog article. See `.website-os/decisions/ADR-001-brownfield-editorial-gate.yml`.

## Mandatory atomic registration for every NEW article

Never create a new indexable blog URL and then hand-edit only part of the Website OS registry. After `frontend/public/blog/<slug>/index.html` exists, run the registry helper before publishing:

```bash
node scripts/register-editorial-page.mjs \
  --slug=<slug> \
  --cluster=<CLUSTER_ID> \
  --entity="<primary entity>" \
  --primary-keyword="<primary keyword>" \
  --secondary-keyword="<optional secondary keyword>" \
  --intent=INFORMATIONAL \
  --evidence-ref=serp-evidence.csv
```

The helper atomically registers the route in all core maps that previously could be forgotten independently:

- `.website-os/evidence/url-ownership-map.csv`
- `.website-os/evidence/project-scope-matrix.csv`
- `.website-os/evidence/page-inventory.csv`
- `.website-os/evidence/keyword-page-coverage.csv`
- `.website-os/evidence/keyword-universe.csv`

Cannibalization and K0 remain human/research decisions and must still be updated truthfully; the helper intentionally does not invent them.

Before commit/push, always run:

```bash
node scripts/verify-editorial-release.mjs
```

The verifier is fail-closed and now checks route presence plus cross-file consistency for canonical ownership, scope, inventory, cluster, primary keyword, coverage and keyword universe. A new article is not allowed to reach deploy with a partial registry.

A new indexable article is publish-ready only when all of the following are true:

1. Website OS bootstrap is refreshed from `capquangfptminhlh/seo-web/main` and the current governance SHA/observed_at are recorded.
2. Fresh article-level K0 evidence maps query -> intent -> entity/topic -> cluster -> canonical URL owner, with cannibalization resolved. If an existing canonical owner already owns the intent, UPDATE/MERGE instead of creating a competing URL.
3. Business/tax/legal/accounting/POS/security/product-feature/quantitative claims have reliable provenance; unavailable facts remain UNKNOWN/UNVERIFIED.
4. The article exists at `public/blog/<slug>/index.html` with exactly one H1, canonical `https://autotaxpos.com/blog/<slug>/`, title/meta, answer-first structure, Article + BreadcrumbList JSON-LD, AutoTax branding, useful internal links, and no unsafe legacy claims.
5. For a NEW article, `scripts/register-editorial-page.mjs` has been run successfully with the final slug/cluster/entity/primary keyword.
6. `public/blog/index.html` links to the article and keeps the homepage knowledge presentation coherent.
7. `public/sitemap.xml` contains the canonical URL and a truthful `lastmod`.
8. `.website-os/evidence/*` is updated for the affected query/intent/cluster/URL ownership/cannibalization scope. Do not manufacture SEO metrics.
9. `node scripts/verify-editorial-release.mjs` PASSes locally/on the exact source commit before deploy.
10. `smoke-blog.mjs` discovers every article directory automatically and validates every blog route, index linkage, sitemap membership, schema, canonical, mobile rendering, and branding.
11. Quality/audit and production build gates PASS for the exact commit.
12. The VPS deploy workflow succeeds for the exact commit.
13. Production read-back verifies the new/updated canonical URL returns HTTP 200 HTML with the expected title, canonical, exactly one H1, and recognizable updated content.

## Gate separation

- `launch_completeness_decision: HOLD` means the repository MUST NOT claim the entire website is `100% launch-complete`.
- It does NOT by itself prevent an individual article from publishing on the already-running production site.
- Never flip launch completeness to PASS merely to unblock editorial work.
- Never bypass an article-level K0/evidence/cannibalization/quality/deploy/read-back failure.

Publishing cadence is at most three qualified articles per day. Quality and evidence gates remain fail-closed. LIVE may only be reported after production read-back succeeds.
