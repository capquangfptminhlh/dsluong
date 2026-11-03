import type { Observation } from './types.js';

export type CrawlObservationCode =
  | 'ORPHAN_URL'
  | 'UNDECLARED_URL'
  | 'BROKEN_INTERNAL_LINK'
  | 'HTTP_ERROR'
  | 'CANONICAL_MISMATCH';

export interface CrawlPage {
  readonly url: string;
  readonly status?: number;
  readonly canonical?: string;
  readonly links?: readonly string[];
}

export interface CrawlInput {
  readonly sitemapUrls: readonly string[];
  readonly pages: readonly CrawlPage[];
}

export interface CrawlObservation extends Observation {
  readonly code: CrawlObservationCode;
  readonly auditId: 'CRAWL';
}

export interface CrawlAuditResult {
  readonly observations: readonly CrawlObservation[];
}

const EVIDENCE_CAPTURED_AT = '1970-01-01T00:00:00.000Z';

function firstOrigin(input: CrawlInput): string | null {
  for (const value of [...input.sitemapUrls, ...input.pages.map((page) => page.url)]) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.origin;
    } catch {
      // Invalid sources cannot establish the crawl origin.
    }
  }
  return null;
}

function normalizeUrl(value: string, origin: string, base?: string): string | null {
  try {
    const url = new URL(value, base ?? origin);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== origin) return null;

    const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
    return `${origin}${pathname}`;
  } catch {
    return null;
  }
}

function observation(
  code: CrawlObservationCode,
  sourceUrls: readonly string[],
  severity: CrawlObservation['severity'],
): CrawlObservation {
  const id = `crawl:${code.toLowerCase().replace(/_/g, '-')}:${sourceUrls.join('|')}`;
  return {
    code,
    auditId: 'CRAWL',
    sourceUrls: [...sourceUrls],
    severity,
    evidenceRefs: [{ id, capturedAt: EVIDENCE_CAPTURED_AT }],
  };
}

export function auditCrawl(input: CrawlInput): CrawlAuditResult {
  const origin = firstOrigin(input);
  if (!origin) return { observations: [] };

  const sitemapUrls = new Set(input.sitemapUrls
    .map((url) => normalizeUrl(url, origin))
    .filter((url): url is string => url !== null));
  const pages = new Map<string, CrawlPage>();
  for (const page of input.pages) {
    const url = normalizeUrl(page.url, origin);
    if (url) pages.set(url, page);
  }

  const links = new Map<string, Set<string>>();
  for (const [pageUrl, page] of pages) {
    for (const link of page.links ?? []) {
      const targetUrl = normalizeUrl(link, origin, pageUrl);
      if (!targetUrl) continue;
      const sources = links.get(targetUrl) ?? new Set<string>();
      sources.add(pageUrl);
      links.set(targetUrl, sources);
    }
  }

  const observations: CrawlObservation[] = [];
  for (const url of sitemapUrls) {
    if (!links.has(url)) observations.push(observation('ORPHAN_URL', [url], 'MEDIUM'));
  }
  for (const url of links.keys()) {
    if (!sitemapUrls.has(url) && pages.has(url)) observations.push(observation('UNDECLARED_URL', [url], 'LOW'));
  }
  for (const [targetUrl, sourceUrls] of links) {
    if (!pages.has(targetUrl)) {
      observations.push(observation('BROKEN_INTERNAL_LINK', [...sourceUrls].sort().concat(targetUrl), 'HIGH'));
    }
  }
  for (const [url, page] of pages) {
    if (page.status !== undefined && (page.status < 200 || page.status >= 300)) {
      observations.push(observation('HTTP_ERROR', [url], 'HIGH'));
    }
    if (page.canonical) {
      const canonical = normalizeUrl(page.canonical, origin, url);
      if (canonical && canonical !== url) {
        observations.push(observation('CANONICAL_MISMATCH', [url, canonical], 'MEDIUM'));
      }
    }
  }

  observations.sort((left, right) => left.code.localeCompare(right.code)
    || left.sourceUrls.join('|').localeCompare(right.sourceUrls.join('|')));
  return { observations };
}
