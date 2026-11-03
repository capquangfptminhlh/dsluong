# AGENTS.md — PROJECT BOOTSTRAP

This repository is governed by the central Website OS repository:

- Source repo: `capquangfptminhlh/seo-web`
- Source ref: `main`
- Manifest: `governance/website-os.manifest.yml`
- Central entrypoint: `AGENTS.md`
- Enforcement engine: `engine/website_os_engine.py`
- Engine policy: `engine/policy.yml`
- Full-scope standard: `standards/Website_OS_Full_Scope_Launch_Completeness_Gate_v1.0.0.md`
- Full-scope machine policy: `governance/full-scope-launch-policy.yml`

## Mandatory startup

Before planning, coding, designing, writing content, running SEO, changing production configuration, reviewing, or modifying this project:

1. Load `capquangfptminhlh/seo-web` at the declared source ref.
2. Read `governance/website-os.manifest.yml`.
3. Resolve and record the central source commit SHA.
4. Follow the manifest `mandatory_read_order` completely.
5. Read all relevant central QA/evidence/normative files referenced by that stack.
6. Only then read and apply this project's local rules below.
7. Complete K0 Keyword Intelligence plus the full keyword/page/image launch plan before production code or content scaling.
8. When runtime/CI access is available, run the central Website OS Enforcement Engine against this project before claiming a gate PASS.
9. At release, run the full-scope launch verifier before claiming the website is complete.

If the central repo, manifest, enforcement engine, engine policy, or any mandatory normative file cannot be resolved, return:

`HOLD — WEBSITE OS BOOTSTRAP MISSING OR STALE`

Do not proceed from memory or an old summary.

## Executable enforcement

Default engine command after the central repo has been resolved:

`python <central-seo-web>/engine/website_os_engine.py --project-root . --governance-root <central-seo-web> --evidence-dir .website-os/evidence --gate auto --out-dir .website-os/out`

Release verifier:

`python <central-seo-web>/scripts/verify-full-scope-launch.py --project-root . --evidence-dir .website-os/evidence`

A hard engine/verifier FAIL is blocking for the scope that verifier governs. Do not hide/delete findings to obtain PASS.

Permitted waivers/deviations must be explicit, attributable and backed by a Decision Record. Findings remain visible.

## Full-scope build contract

Production implementation is blocked until the evidence set contains a PASS full-scope launch plan with:
- complete retained keyword mapping;
- canonical URL/page inventory;
- keyword-to-page coverage;
- complete image production plan;
- explicit launch/HOLD/post-launch decisions.

A homepage/sample/vertical slice may be used during development, but MUST NOT be handed off as the completed website.

Final release requires planned-vs-implemented verification for every `BUILD_LAUNCH` page and required image, including mobile, technical SEO, visual fidelity, link integrity and placeholder checks.

When the project requires all-new imagery, the production image set must be new for the project except documented approved reuse.

Allowed completion wording:

`100% launch-complete for the approved scope as of <observed_at>.`

This is not a guarantee of search ranking and does not mean future maintenance will never be needed.

## Existing-production editorial rule — IMPORTANT

AutoTax is operated as an existing production project. For ongoing blog/editorial changes, full-site `launch_completeness_decision` governs only claims that the entire site is launch-complete; it MUST NOT be interpreted as an automatic blocker for an otherwise qualified individual article.

The durable decision is `.website-os/decisions/ADR-001-brownfield-editorial-gate.yml`.

An individual NEW/UPDATE/MERGE article may proceed only when its article-level gates PASS:
- Website OS bootstrap refreshed;
- fresh query/trend evidence when relevant;
- K0 article mapping and canonical URL ownership;
- cannibalization check/resolution;
- source-of-truth validation;
- `frontend/BLOG_PUBLISHING.md` contract;
- blog smoke, quality and production build PASS;
- VPS deployment SUCCESS;
- production read-back PASS for the exact canonical URL.

`launch_completeness_decision: HOLD` MUST remain visible until full release evidence truly supports PASS. It blocks a full-site completion claim, not routine brownfield editorial publishing.

Default post-launch editorial target may be up to 3 qualified articles/day, but publish fewer when article-level evidence/quality/cannibalization gates do not pass.

## Rule precedence

Local project rules may extend or strengthen central Website OS rules, but MUST NOT silently weaken central hard gates. Any permitted deviation requires a Decision Record with provenance.

## Bootstrap evidence

Before substantive work, record:
- source repo;
- source ref;
- resolved source commit SHA;
- manifest version;
- `observed_at`;
- mandatory read completion;
- Bootstrap PASS/HOLD;
- enforcement engine version when executed;
- policy/evidence fingerprints when produced;
- unresolved/waived findings.

Before final handoff, also record:
- retained keyword universe count;
- P0/P1 cluster count;
- planned vs implemented launch pages;
- planned vs implemented images;
- missing/broken/placeholder counts;
- mobile/SEO verification coverage;
- launch-completeness PASS/HOLD;
- post-launch editorial cadence.

## Project-specific rules — AutoTax / AutoTaxPOS

- Business, tax, legal, accounting, POS, security, product-feature and quantitative claims require reliable source-of-truth provenance; unknown facts remain `UNKNOWN` or `UNVERIFIED`.
- Content publishing must map query → intent → entity/topic → cluster → canonical URL owner before creating a new indexable URL.
- Prevent duplicate intent and cannibalization. Prefer UPDATE/MERGE when an existing canonical owner already satisfies the primary intent.
- Post-launch editorial cadence is a maximum target of 3 qualified articles/day, not a quota. A scheduled run may HOLD when article-level hard gates fail.
- Do not claim production LIVE without deployment/read-back evidence for the AutoTax production environment.
- Do not use full-site launch-completeness HOLD as a substitute for article-level editorial validation.
