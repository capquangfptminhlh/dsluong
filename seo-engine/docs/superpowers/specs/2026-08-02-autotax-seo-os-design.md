# AutoTax SEO Operating System — Design

**Status:** approved for specification review; implementation is not authorized by this document.

## Purpose

Evolve AutoTax from a set of safe SEO/Blogger workflows into an evidence-led SEO, AEO and GEO operating system. The system prioritizes verified opportunities, prevents unsafe or low-value changes, and measures outcomes after release. It does not promise indexing, rankings, AI citations, traffic, or revenue.

## Non-negotiable constraints

- `docs/MASTER_SPEC.md` remains the source of truth; BOD-32 remains the authority for Blogger safety and publishing boundaries.
- Facts, media provenance, duplicate prevention, ledger/recovery, and existing human-review policies remain mandatory.
- No bulk programmatic pages, forced links, synthetic reviews, backlink manipulation, or attempts to manipulate answer engines.
- GSC is the first-party performance source. Third-party SERP/backlink data is optional, budget-capped, and cannot override first-party evidence.
- Each recommendation must be reproducible from an evidence snapshot and reversible when practical.

## Reference research and bounded adoption

| Reference | Adopt | Do not adopt wholesale |
| --- | --- | --- |
| `AgriciDaniel/claude-seo` | Small independently runnable audit modules and clear command/audit boundaries. | Its entire plugin/toolchain or unverified integrations. |
| `coreyhaines31/marketingskills` | Product context, CRO and editorial context as inputs to SEO decisions. | Generic or high-volume programmatic SEO workflows. |
| `every-app/open-seo` | Provider-adapter approach for keyword/SERP/competitor signals and focused workflows. | Mandatory DataForSEO dependency or uncontrolled API spend. |
| `janreges/siteone-crawler`, `PhialsBasement/LibreCrawl` | Sitemap/link-graph reconciliation, rendered-page checks, structured reports. | Running a public crawler service on production by default. |
| `GoogleChrome/lighthouse`, `GoogleChrome/lighthouse-ci` | Versioned performance/SEO budgets and CI assertions. | Treating one Lighthouse score as an SEO outcome. |
| `schemaorg/schemaorg` | Schema vocabulary validation as a baseline. | Adding markup merely because vocabulary permits it. |
| GSC MCP references | GSC query/page/device/country snapshots and opportunity analysis. | Giving an agent unrestricted production mutation access. |
| GEO/AEO references | Citation-readiness and answer-quality observation. | Claims that `llms.txt` or any GEO tactic guarantees visibility. |

## Architecture

```text
First-party data (GSC, site build, facts) + optional provider data
                         ↓
                     Evidence store
                         ↓
 Audit catalogue ─→ Recommendation contract ─→ Decision engine
                         ↓                         ↓
                 release/content gates      owner + rollback + experiment
                         ↓
               post-release measurement and audit ledger
```

### 1. Data plane

Use typed snapshots rather than live, unbounded agent queries:

- **GSC snapshot:** query/page/date/device/country metrics, queried timestamp, property identifier, and source status.
- **Crawl snapshot:** URL inventory from sitemap and internal-link graph, fetch/render mode, HTTP response, canonical, robots, headings, metadata, schema, links, and asset observations.
- **Content/fact snapshot:** article identifiers, intents, entities, approved facts and expiry information.
- **Optional market snapshot:** provider, request parameters, cost, timestamp, licensing limits, and confidence. Failure or exhausted budget creates `DATA_UNAVAILABLE`; it must not trigger speculative action.

Secrets stay in environment/secret storage, never snapshots, reports, commits, or prompts.

### 2. Audit catalogue

Each audit is independently enabled, versioned, testable, and produces observations—not autonomous mutations.

1. **Indexability & crawlability:** robots, status, redirect/canonical chain, sitemap, orphan/missing links.
2. **Rendering & technical delivery:** server HTML versus rendered DOM, response errors, asset reachability, mobile baseline.
3. **Performance & accessibility:** Core Web Vitals proxy/budget, resource size, crawlable anchors, meaningful image alt text.
4. **On-page & internal linking:** title/meta/heading intent, duplicate/cannibalization signals, contextual link graph.
5. **Structured data:** schema vocabulary, page-type contract, required properties, visible-content consistency.
6. **Content quality & trust:** fact expiry, source coverage, author/entity evidence, real image provenance, duplicate/near-duplicate checks.
7. **Search-performance opportunity:** GSC CTR, position, impression trends and page/query alignment; all conclusions label the analysis window.
8. **AEO/GEO readiness:** direct answer coverage, cited fact coverage, entity consistency, accessible canonical content and machine-readable discovery. This is observational, not a ranking promise.

### 3. Recommendation contract

An audit finding becomes actionable only with:

```ts
type Recommendation = {
  id: string;
  auditId: string;
  evidenceRefs: string[];
  severity: 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  expectedMetric?: string;
  baseline?: string;
  proposedChange: string;
  owner: string;
  rollback: string;
  status: 'NEW' | 'HOLD' | 'APPROVED' | 'IMPLEMENTED' | 'MEASURED' | 'REJECTED';
  expiryAt?: string;
};
```

Missing evidence, a stale snapshot, no rollback for a risky mutation, or low confidence with high impact yields `HOLD`.

### 4. Decision and release gates

Prioritization is transparent: `impact × confidence × strategic relevance ÷ effort`, then capped downward by policy risk. Scores guide ordering only; they do not bypass gates.

- **Build gate:** existing tests/build plus no secret leakage.
- **SEO release gate:** configured critical routes meet agreed status/canonical/sitemap/schema/image checks.
- **Performance gate:** versioned Lighthouse CI budgets alert or block only when a stable baseline and route class exist.
- **Content gate:** keeps current fact, originality, image provenance and duplicate controls.
- **Rollback gate:** every material deploy records before/after evidence and recovery action.

### 5. Measurement and experiments

No action is called successful on deployment. The ledger records baseline, exact change, release ID, observation windows, confounders, and a conclusion of `IMPROVED`, `NO_CLEAR_SIGNAL`, `REGRESSED`, or `INCONCLUSIVE`. GSC lag and low-volume data must produce `INCONCLUSIVE`, never fabricated certainty.

### 6. Skill and prompt governance

Every internal SEO skill/prompt has a manifest containing scope, required evidence, allowed tools, prohibited actions, output schema, test fixtures, owner, and review date. CI checks broken references, missing required policy fields, and contract/schema drift. External skills are reference material until individually reviewed.

## Delivery phases

1. **Specification:** add the architecture, contracts, gates and glossary to `MASTER_SPEC`; no production behavior changes.
2. **Foundation:** GSC snapshot adapter, evidence/recommendation schemas, audit ledger and read-only reports.
3. **Technical audits:** sitemap/link graph, rendered checks, asset/schema/on-page observations; report-only initially.
4. **Release governance:** route-class release checks and calibrated Lighthouse budgets.
5. **Decision/measurement:** prioritized backlog, owner/rollback enforcement, before/after experiment ledger.
6. **AEO observation:** citation-readiness and optional, explicitly experimental AI-discovery artifacts.

Each phase needs tests, a dry run on AutoTax, and a review checkpoint before automation grows.

## Success criteria

- Every important recommendation is traceable to a timestamped evidence reference.
- A failed optional provider cannot create a speculative publishing/deployment task.
- Critical technical regressions are detected before release or visibly alerted with a rollback record.
- Content actions preserve BOD-32 and current fact/image/duplicate rules.
- Post-release reports distinguish deployment from measured outcome.

## Explicit non-goals

- No claim of being "number one" or of guaranteed SEO/AEO/GEO outcomes.
- No automatic Blogger publishing is introduced by this design.
- No third-party provider or SaaS is installed/paid for without a separate approval.
