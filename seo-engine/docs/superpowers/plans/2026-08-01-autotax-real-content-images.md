# AutoTax Real Content Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require every AutoTax primary-blog article and Blogger draft to use one curated, topic-matched product screenshot or stop safely.

**Architecture:** A single image registry maps clusters and optional topic IDs to approved first-party screenshot paths. Blogger and the primary article generator both resolve through the registry; neither can fall back to generated banners or generic images. The worker records `HOLD` before any draft insert when a mapping is missing.

**Tech Stack:** Node.js, TypeScript, Vitest, Astro, Sharp (privacy crop/optimization only), Google Blogger API.

---

### Task 1: Define and validate the shared image registry

**Files:**
- Create: `config/content-images.json`
- Create: `src/content-images/registry.ts`
- Test: `tests/content-images/registry.test.ts`

- [ ] Write a failing test that resolves exactly one matching cluster and rejects missing, ambiguous, non-first-party, or absent local assets.
- [ ] Run `npm test -- tests/content-images/registry.test.ts`; it must fail because the registry module is absent.
- [ ] Implement `parseContentImageRegistry` and `resolveContentImage`. Each image contains `imageId`, `publicPath`, `alt`, `clusters`, and optional `topicIds`. Require paths under `/blogger/images/`, a matching file under `public/`, and exactly one resolver match.
- [ ] Register the four captured assets:
  - dashboard → `business-overview`, `revenue-monitoring`
  - POS → `pos-operations`, `store-closing-operations`
  - products/inventory → `inventory-management`, `product-management`
  - tax/reporting → `tax-reporting`, `e-invoice`
- [ ] Run the test again; it must pass. Commit the registry, test, config, and image assets.

### Task 2: Require one exact screenshot in Blogger drafts

**Files:**
- Modify: `src/blogger/html-policy.ts`
- Modify: `src/blogger/client.ts`
- Modify: `src/blogger/types.ts`
- Test: `tests/blogger/html-policy.test.ts`
- Test: `tests/blogger/client.test.ts`

- [ ] Write failing tests for: one expected `https://autotaxpos.com/blogger/images/...` image passes; missing, external, additional, changed-src, and changed-alt images fail.
- [ ] Run `npm test -- tests/blogger/html-policy.test.ts tests/blogger/client.test.ts`; it must fail because images are stripped.
- [ ] Allow `img` with only `src` and `alt`. Add `expectedImage` to insert/read-back inputs. Verify exactly one image, exact absolute URL, and exact alt text before insert and during read-back.
- [ ] Run those tests again; they must pass. Commit the gate.

### Task 3: Add Blogger image and quality gates

**Files:**
- Modify: `src/blogger/worker.ts`
- Modify: `scripts/blogger/run-worker.ts`
- Modify: `src/blogger/types.ts`
- Test: `tests/blogger/worker.test.ts`

- [ ] Write failing tests proving an unmapped image returns `{ status: 'HOLD', reason: 'IMAGE_NOT_FOUND' }` with zero insert calls, and a draft with fewer than three `h2` sections returns `QUALITY_GATE_FAILED`.
- [ ] Run `npm test -- tests/blogger/worker.test.ts`; it must fail because the two gates do not exist.
- [ ] Resolve the registry image after fact/originality gates and before sanitization. Prepend it to the HTML. Add deterministic quality validation: a non-empty introduction, at least three `h2` sections, and source fact IDs for generated factual claims. Persist gate failures as `HOLD`; never reserve or insert.
- [ ] Run the worker tests again; they must pass. Commit the gates.

### Task 4: Replace primary-blog banners and generic images

**Files:**
- Create: `src/content-images/primary-article.ts`
- Modify: `generate-content.js`
- Test: `tests/content-images/primary-article.test.ts`

- [ ] Write a failing test showing the selected registry image is inserted after the H1 and used as `coverImage`; missing mapping throws `IMAGE_NOT_FOUND`.
- [ ] Run `npm test -- tests/content-images/primary-article.test.ts`; it must fail because the module is absent.
- [ ] Remove Sharp SVG banner generation, timestamp banner names, and the generic `img_*.png` prompt list. Give every primary keyword explicit cluster metadata; resolve the image via the shared registry, insert exactly one Markdown image after H1, and set `coverImage` to the same path. Throw before writing Markdown when no image matches.
- [ ] Run `npm test -- tests/content-images/primary-article.test.ts && npm run build`; both must pass. Commit the primary-blog change.

### Task 5: Pilot verification and VPS release

**Files:**
- Modify: `docs/blogger-draft-operations.md`
- Modify: `.env.example`
- Modify: `config/topics.json`
- Test: `tests/blogger/worker.test.ts`

- [ ] Add runbook checks: `COMPLETED`, Blogger `DRAFT`, one exact first-party image, valid ledger record, and no publish API.
- [ ] Add one new `PENDING` Pilot topic with cluster `pos-operations`, valid facts, and title/intent distinct from primary articles.
- [ ] Run `npm test && npm run build && node --import tsx scripts/blogger/run-worker.ts`. It must either produce exactly one image-bearing DRAFT or return HOLD with no insert.
- [ ] Manually review the draft in Blogger on desktop/mobile; do not publish.
- [ ] Deploy only reviewed code and image assets to VPS; keep Blogger cron disabled. Do not deploy the local test superadmin database or its credentials.

