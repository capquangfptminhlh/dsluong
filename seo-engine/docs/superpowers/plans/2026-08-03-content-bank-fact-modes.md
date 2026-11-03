# Content-bank fact modes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept safe qualitative Blogger content-bank articles with no facts while continuing to fail closed for undeclared factual claims.

**Architecture:** `validateCandidateQuality` remains the single fact-mode authority. The importer continues to call it before queueing content and derives worker-owned metadata. Documentation gives external models the same two-mode contract.

**Tech Stack:** TypeScript, Vitest, Node.js ESM importer.

---

### Task 1: Quality-gate mode tests and implementation

**Files:**
- Modify: `tests/blogger/quality.test.ts`
- Modify: `src/blogger/quality.ts`

- [ ] Write a failing test for a qualitative article with both fact arrays empty, then run `npm test -- tests/blogger/quality.test.ts` and observe `FACT_EVIDENCE_MISSING`.
- [ ] Write a companion failing test that adds a date or number to that article and expects `FACT_CLAIM_UNDECLARED`.
- [ ] Implement the minimal branch: empty sources plus empty claims performs the existing conservative factual-text scan; mixed empty/non-empty arrays return `FACT_EVIDENCE_INVALID`; grounded mode keeps all existing validation.
- [ ] Re-run `npm test -- tests/blogger/quality.test.ts` and commit the source plus tests.

### Task 2: Importer acceptance test and input validation

**Files:**
- Modify: `scripts/import-blogger-articles.mjs`
- Create: `tests/blogger/importer.test.ts`

- [ ] Write a failing integration test for importing an array package with empty `sourceFactIds` and `factClaims`; run it and observe the current non-empty source-fact rejection.
- [ ] Change only the importer shape check so both fields must be arrays but can both be empty. Retain fact validation, image-cluster validation, duplicate checks and `validateCandidateQuality`.
- [ ] Re-run the importer test and commit the source plus test.

### Task 3: External author contract

**Files:**
- Modify: `docs/CONTENT_BANK_SPEC.md`

- [ ] Document `fact-grounded` (both arrays non-empty) and `qualitative-no-fact` (both arrays empty), including a safe complete JSON example for each.
- [ ] State that `siteId` may be inherited from the directory, while `slug`, `contentVersion`, `status`, and `channel` are derived by AutoTax.
- [ ] Commit the documentation change.

### Task 4: Isolated package verification

**Files:**
- No production file changes.

- [ ] Extract `C:\Users\nskka\Downloads\blog-content-bank-complete.zip` to a disposable directory.
- [ ] Run the importer against a disposable copy of `seo-engine`, never against the working queue, ledger, VPS, or Blogger API.
- [ ] Run `npm test`, `npm run build`, and `git diff --check`.
- [ ] Confirm the diff only touches Blogger content-bank code, its tests and contract; it must not touch the SEO OS, web content, crawler, GEO or AEO paths.
