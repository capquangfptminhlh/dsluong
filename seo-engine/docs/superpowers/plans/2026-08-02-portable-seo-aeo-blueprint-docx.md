# Portable SEO/AEO Blueprint DOCX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a rendered and privacy-checked Vietnamese DOCX handbook that transfers the complete SEO/AEO operating model to a new project.

**Architecture:** A temporary Python builder produces one styled DOCX from a structured chapter outline, using the `compact_reference_guide` preset. The final deliverable is rendered to page PNGs for visual QA; only the final DOCX remains in the deliverables folder.

**Tech Stack:** Bundled Python, `python-docx`, DOCX OOXML helpers, LibreOffice renderer.

---

### Task 1: Draft and build the portable handbook

**Files:**
- Create: `deliverables/SEO_AEO_Operating_System_Blueprint.docx`
- Create (temporary): `tmp/build_seo_aeo_blueprint.py`

- [ ] **Step 1: Build content from the approved design’s 12 chapters**

Include configuration replacement pack, website templates, content/evidence system, AEO, audit/data, automation, owned media, release/deploy, measurement and appendices. Mark all project-specific settings as replaceable and omit all credentials/private production data.

- [ ] **Step 2: Apply the `compact_reference_guide` token map**

Use Letter portrait, 1-inch margins, Calibri 11pt body, 1.25 line spacing, blue 16/13/12pt headings, fixed-width 9360-DXA tables, true lists and muted footer page numbers.

- [ ] **Step 3: Run builder and structural checks**

Run the bundled Python builder, inspect document properties, headings, table widths and scan text for placeholder/secret patterns.

### Task 2: Render, inspect and finalize

**Files:**
- Create (temporary): `tmp/seo-blueprint-render/page-*.png`
- Modify: `deliverables/SEO_AEO_Operating_System_Blueprint.docx` only if render defects require correction.

- [ ] **Step 1: Render DOCX to PNG pages and PDF**

Run the documents renderer with a writable output directory and inspect every generated page at 100% zoom.

- [ ] **Step 2: Correct any clipping, overlap, table wrapping, blank-page, missing-glyph, or header/footer defect**

Rebuild and render again after each correction.

- [ ] **Step 3: Run privacy/metadata audit and keep only final DOCX in deliverables**

Use the bundled privacy audit or OOXML inspection; verify there are no password/token/IP/email placeholders or internal tool citations. Retain render artifacts only in the temporary QA directory.

## Plan self-review

- Scope coverage: Tasks 1–2 cover all approved chapters, format, portability, visual QA and privacy requirements.
- Placeholder scan: the builder must not emit TODO/TBD markers; named temporary paths are deliberate and not reader-facing.
- Consistency: the final file name is identical in both tasks and no runtime website behavior is modified.
