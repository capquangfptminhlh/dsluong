# Portable SEO/AEO Operating System Blueprint — Design

**Artifact:** a Vietnamese DOCX handbook, designed to be copied into another project after replacing an explicit configuration pack.

## Goal

Create a complete, practical blueprint covering the lifecycle of an SEO/AEO programme: business strategy, website design, technical SEO, content and evidence, owned-media automation, release/deployment, measurement, and incident handling. It must capture useful AutoTax patterns without embedding credentials, business data, domain-specific claims, or an unconditional auto-publish policy.

## Audience and form

- Audience: founder, SEO lead, developer, editor, and automation operator starting a new project.
- Language: Vietnamese; technical identifiers and command examples may remain English.
- Form: a 45–60 page DOCX reference manual using the `compact_reference_guide` visual preset, a restrained cover, heading hierarchy, short procedural sections, checklists, decision tables, and flow diagrams where relationships are genuinely complex.
- Portability: every AutoTax-specific value appears in a marked **Replace for new project** configuration pack; no secrets or real personal/business credentials appear.

## Chapter structure

1. **How to use this blueprint:** scope, non-guarantees, roles, decision rights, and the project configuration pack.
2. **Strategy and governance:** market, audience, conversion, entity, competitors, KPIs, evidence policy, risk limits, and prohibited practices.
3. **Website architecture:** domain/canonical choice, information architecture, URL policy, sitemap, navigation, page families, template anatomy, internal links, mobile/accessibility, performance, and structured data.
4. **Technical SEO build checklist:** robots, canonical, redirects, status codes, rendered HTML, images, schema, Core Web Vitals, security baseline, and pre-launch validation.
5. **Content operating system:** search intent, topic clusters, keyword/page mapping, fact/source ledger, author/entity evidence, brief, drafting, editorial gate, real media, FAQ/CTA, duplication and refresh.
6. **AEO/GEO readiness:** answer-first writing, citation readiness, entity consistency, structured content, AI crawler governance, and measurement limitations.
7. **Data and audit system:** GSC, crawl snapshots, audit catalogue, evidence records, recommendation contract, prioritisation, owner/rollback, and optional provider cost controls.
8. **Automation and scheduling:** queue design, idempotency, locks, cron, retries, states, ledger, canary rollout, kill switches, logs, and secret handling.
9. **Owned media / Blogger pattern:** channel charter, differentiated intent, cross-channel duplicate detection, topic/fact inputs, image/link policy, draft versus publish boundary, and human/automatic review modes.
10. **Release, deploy and recovery:** CI, test/build/audit gates, VPS deployment, smoke checks, rollback, backups, and change records.
11. **Measurement and optimisation:** baseline, observation windows, CTR/ranking/content-decay opportunities, experiments, daily/weekly/monthly reporting, and conclusions with uncertainty.
12. **Templates and appendices:** copyable configuration, fact, topic, evidence, recommendation, ledger, content brief, publication checklist, incident playbook, and onboarding plan.

## Operating model

```text
Business goals + approved configuration
            ↓
Website and content design
            ↓
Evidence/fact inputs → quality and policy gates
            ↓
Publish/release boundary with logs and rollback
            ↓
GSC/crawl/performance measurement → prioritised improvement loop
```

Automation never bypasses evidence, originality, technical, or release gates. The document distinguishes **safe automation** (read-only audit, deterministic build, locked queue, atomic ledger) from **conditional automation** (content publication after configured gates) and **never automate** actions (fabricated reviews, link manipulation, secret exposure, unapproved paid API use).

## Quality and verification requirements

- Include action-oriented inputs, gates, outputs, owner and rollback for all important workflows.
- Use tables only for repeatable comparisons/checklists; keep explanatory sections as concise prose and steps.
- Include only generic example domains and redacted sample values.
- Render the DOCX to PNG pages and visually inspect every page; repair layout defects before delivery.
- Run a privacy pass so document metadata and content contain no credentials, IP addresses, real email addresses, passwords, tokens or private VPS paths.

## Non-goals

- No promise of indexation, rankings, AI citations, traffic, revenue, or “number one” status.
- No instruction to mass-produce thin pages, evade platform policies, manipulate backlinks, or make unsupported claims.
- No operational secret, live OAuth material, or real account data.
