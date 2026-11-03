# Blogger topic-matched real-image design

## Goal

Every Blogger draft must contain one real AutoTax product image that is relevant to its topic. The worker must not use a generic fallback image, AI-generated imagery, or third-party stock imagery. A draft without a verified matching image is not inserted into Blogger.

The same requirement is mandatory for AutoTax's primary website; see `docs/content-image-policy.md`.

## Approach

Maintain a small, curated image registry. Each registry item names one locally stored real AutoTax screenshot and the topics/clusters it supports. The Blogger worker resolves an image from the registry using the selected topic's `cluster` and optional image tags. It adds the image as the first body element before the draft is sanitized and submitted.

The registry is deliberately explicit: one image can support several genuinely related clusters, but no worker inference may select an unrelated image.

## Components

- `public/blogger/images/`: checked-in real AutoTax screenshots, optimized for Blogger.
- `config/blogger-images.json`: registry of image filename, alt text, supported clusters, and optional topic IDs.
- `src/blogger/images.ts`: validates the registry, verifies the local file exists, and resolves exactly one matching image.
- The Blogger candidate builder: requests image-relevant content and prepends the resolved image before Gate 4 sanitization/link enforcement.

## Safety rules

- No fallback image exists.
- If there is no exact registry match, the topic becomes `HOLD` with `IMAGE_NOT_FOUND`; no Blogger API insert is attempted.
- The image URL is a first-party HTTPS URL under the configured AutoTax destination, never a local filesystem path in the submitted post.
- The post read-back must contain exactly the expected approved image URL and alt text. A missing, changed, or additional external image produces `VERIFY_FAILED`.
- Existing draft `Checklist kiểm tra cuối ca cho cửa hàng nhỏ` remains unchanged; the next distinct pilot topic will exercise the image flow.

## Tests

- Registry rejects a missing file, an unsupported host, duplicate registry IDs, and duplicate ambiguous matches.
- Resolver selects the correct screenshot for an eligible cluster.
- Resolver returns `IMAGE_NOT_FOUND` and the worker does not insert a draft when no image matches.
- HTML policy permits only the expected first-party image and rejects external/extra images.
- Read-back rejects a missing or changed image.

## Rollout

1. Add a minimum viable curated set of screenshots for the next pilot topics.
2. Run the worker locally to create one new draft and verify the image in Blogger.
3. Complete four human-reviewed image-bearing drafts before enabling the disabled cron entry on the VPS.
