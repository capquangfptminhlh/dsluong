# AutoTax Blogger content-bank contract for external AI

Return JSON only. Put a package under `content-bank/blogger/<siteId>/package.json`.

## Required article shape

```json
{
  "topicId": "unique-topic-id",
  "title": "A distinct practical guide",
  "intent": "unique-search-intent",
  "cluster": "pos-operations",
  "sourceFactIds": [],
  "labels": ["optional-label"],
  "body": "<p>Direct qualitative answer with no claim.</p><h2>Useful section</h2><p>Practical guidance.</p><h2>Another useful section</h2><p>Practical guidance.</p><h2>Final useful section</h2><p>Practical guidance.</p>",
  "factClaims": []
}
```

`topicId`, `title`, and `intent` must be globally unique. Choose `cluster` from
`pos-operations`, `store-closing-operations`, `business-overview`,
`revenue-monitoring`, `inventory-management`, `product-management`,
`tax-reporting`, or `e-invoice`.

Do not provide `slug`, `contentVersion`, `status`, or `channel`; AutoTax derives them.
`siteId` is optional when the file is under a configured site directory.

## Choose exactly one fact mode

### Qualitative no-fact mode

Use it for practical evergreen guidance. Both arrays must be empty:

```json
"sourceFactIds": [],
"factClaims": []
```

The body must not contain a number, price, fee, date, duration, SMS/USSD syntax,
promotion, legal requirement, guarantee, or another verifiable claim. Do not write a
number in words to evade this rule.

### Fact-grounded mode

Use it only for supplied approved facts. Both arrays must be non-empty. Every fact
statement in `body` must be copied exactly and declared in `factClaims` with its ID.
Never invent, summarize, translate, or extend a fact. Mixed arrays are always rejected.

## Body rules

- The first character must be `<p>` and it directly answers the title.
- Include at least three useful `<h2>` sections with useful paragraphs or list items.
- Allowed tags: `p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `a`.
- Do not use Markdown, `div`, scripts, styles, iframes, images, links, or event
  handlers. AutoTax supplies the approved image and permitted link.
- Every article needs a distinct title, intent, angle, and body. Do not rewrite the
  primary AutoTax website.

## Safe validation

```bash
node scripts/import-blogger-articles.mjs content-bank/blogger --dry-run
```

Dry-run executes the gates but writes no queue, image, ledger, Blogger, or VPS data.
Only remove `--dry-run` after all intended articles are accepted.
