# AutoTax content image policy

This policy applies to every automatically published or drafted article for both destinations:

- the primary AutoTax website (`autotaxpos.com/blog`), and
- AutoTax owned-media Blogger sites.

## Required rule

Each article must use a real screenshot of the AutoTax product that is materially relevant to that article's topic. The image is selected from the curated AutoTax screenshot library and must have a topic/cluster mapping.

## Prohibited

- generic fallback images;
- AI-generated images;
- stock or third-party illustrative images;
- a screenshot that does not match the article topic.

## Fail closed

If the content worker cannot resolve an approved, topic-matched real screenshot, it must set the article to `HOLD` and must not build, publish, or create a Blogger draft.

## Initial captured assets

- `public/blogger/images/autotax-app-dashboard.png` — dashboard, business overview, revenue monitoring.
- `public/blogger/images/autotax-pos-sale.png` — point of sale and order creation.
- `public/blogger/images/autotax-products-inventory.png` — products, SKU, and inventory.
- `public/blogger/images/autotax-tax-reporting.png` — tax management, reconciliation, and e-invoices.
