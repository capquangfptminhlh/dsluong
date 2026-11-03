# Content-bank fact modes design

## Problem

The external content-bank contract allowed qualitative guidance articles with an empty
`sourceFactIds` and `factClaims` array. The AutoTax importer and quality gate rejected
every such article with `FACT_EVIDENCE_MISSING`. This made a bank that passed its own
validator unusable by the production Blogger worker.

## Decision

Support exactly two explicit fact modes. The importer derives the mode from the two
existing arrays; it does not trust a free-form flag from an external model.

| Mode | `sourceFactIds` | `factClaims` | Rule |
| --- | --- | --- | --- |
| `fact-grounded` | one or more IDs | one or more exact rendered claims | Every claim must be a current approved fact and all other factual-looking text is rejected. |
| `qualitative-no-fact` | empty | empty | The body may contain only practical qualitative guidance. Any factual-looking sentence is rejected. |

Mixed arrays are invalid: one empty array and one non-empty array must HOLD with
`FACT_EVIDENCE_INVALID`. A topic with approved facts is not required to cite them;
when it does not cite a fact it is still treated as `qualitative-no-fact` and must not
make factual claims.

## Quality-gate changes

`validateCandidateQuality` keeps the opening-paragraph and three-useful-H2 checks.
It then:

1. rejects mixed fact declarations;
2. for `fact-grounded`, preserves the current exact-match, expiry and repeated-claim
   handling;
3. for `qualitative-no-fact`, removes no declarations and evaluates every sentence
   using the conservative fact-like detector; any match returns
   `FACT_CLAIM_UNDECLARED`;
4. returns `PASS` only if the selected mode meets all rules.

No numeric, price, date, duration, USSD/SMS, promotion, legal obligation or guarantee
can pass the no-fact mode. This is a narrow safety exception for procedural content,
not a path around fact verification.

## Importer and external author contract

`scripts/import-blogger-articles.mjs` accepts both modes. It continues to derive
`siteId` from the directory, derives the worker slug from `topicId`, and writes the
worker-owned `contentVersion: "v1"`, `status: "PENDING"`, and `channel: "blogger"`.
It must never require external authors to supply those derived fields.

`docs/CONTENT_BANK_SPEC.md` will show a complete JSON schema and two copyable examples.
The external-AI brief will require a `factMode` self-check (informational only) and
state that `sourceFactIds` and `factClaims` must either both be empty or both be
non-empty. The importer remains authoritative and infers the actual mode.

## Tests and acceptance criteria

Add tests covering:

- a qualitative article with both arrays empty and no fact-like text passes;
- a qualitative article containing a number or sensitive factual wording holds;
- mixed declarations hold;
- current grounded-fact and repeated-claim behaviour remains unchanged;
- importer accepts a five-site package of qualitative articles, retains image-cluster
  validation, and rejects a package with a factual-looking no-fact article.

The supplied 150-article archive must then be importable locally without bypassing any
worker gate. Import is idempotent; deployment and Blogger publication remain outside
this change.
