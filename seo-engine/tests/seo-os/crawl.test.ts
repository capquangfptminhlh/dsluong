import { describe, expect, it } from 'vitest';
import { auditCrawl } from '../../src/seo-os/crawl.js';

describe('crawl audit', () => {
  it('reconciles normalized same-origin sitemap and link URLs into deterministic observations', () => {
    const result = auditCrawl({
      sitemapUrls: ['https://site.test/orphan/', 'https://site.test/error'],
      pages: [
        {
          url: 'https://site.test/',
          links: ['/linked/#fragment', '/missing', 'https://external.test/ignore'],
        },
        {
          url: 'https://site.test/linked',
          status: 200,
          canonical: 'https://site.test/canonical/',
        },
        { url: 'https://site.test/error/', status: 404 },
      ],
    });

    expect(result.observations.map((observation) => observation.code)).toEqual([
      'BROKEN_INTERNAL_LINK',
      'CANONICAL_MISMATCH',
      'HTTP_ERROR',
      'ORPHAN_URL',
      'ORPHAN_URL',
      'UNDECLARED_URL',
    ]);
    expect(result.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ORPHAN_URL', auditId: 'CRAWL', sourceUrls: ['https://site.test/orphan'], severity: 'MEDIUM',
      }),
      expect.objectContaining({
        code: 'UNDECLARED_URL', sourceUrls: ['https://site.test/linked'], severity: 'LOW',
      }),
      expect.objectContaining({
        code: 'BROKEN_INTERNAL_LINK', sourceUrls: ['https://site.test/', 'https://site.test/missing'], severity: 'HIGH',
      }),
      expect.objectContaining({
        code: 'HTTP_ERROR', sourceUrls: ['https://site.test/error'], evidenceRefs: [expect.objectContaining({ id: 'crawl:http-error:https://site.test/error' })],
      }),
      expect.objectContaining({
        code: 'CANONICAL_MISMATCH', sourceUrls: ['https://site.test/linked', 'https://site.test/canonical'], severity: 'MEDIUM',
      }),
    ]));
  });

  it('excludes external and non-http links while treating normalized equivalent paths as one URL', () => {
    const result = auditCrawl({
      sitemapUrls: ['https://site.test/a/'],
      pages: [{
        url: 'https://site.test/',
        links: ['https://site.test/a#section', 'mailto:help@site.test', '//external.test/path'],
      }, { url: 'https://site.test/a', status: 204 }],
    });

    expect(result.observations).toEqual([]);
  });
});
