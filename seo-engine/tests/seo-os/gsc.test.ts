import { describe, expect, it } from 'vitest';
import {
  readGscConfig,
  snapshotGscPerformance,
  type GscPerformanceClient,
} from '../../src/seo-os/gsc.js';

const credentials = JSON.stringify({
  client_email: 'reader@project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\\nprivate-key\\n-----END PRIVATE KEY-----\\n',
});

describe('GSC performance snapshots', () => {
  it('rejects missing, invalid, and non-HTTPS/non-domain GSC configuration without exposing credentials', () => {
    expect(readGscConfig({})).toEqual({ ok: false, reason: 'GSC_CONFIG_MISSING' });
    expect(readGscConfig({ GSC_SITE_URL: 'http://example.com', GSC_SERVICE_ACCOUNT_JSON: credentials }))
      .toEqual({ ok: false, reason: 'GSC_SITE_URL_INVALID' });
    expect(readGscConfig({ GSC_SITE_URL: 'sc-domain:', GSC_SERVICE_ACCOUNT_JSON: credentials }))
      .toEqual({ ok: false, reason: 'GSC_SITE_URL_INVALID' });
    expect(readGscConfig({ GSC_SITE_URL: 'https://example.com', GSC_SERVICE_ACCOUNT_JSON: '{"private_key":"secret"}' }))
      .toEqual({ ok: false, reason: 'GSC_CREDENTIALS_INVALID' });
  });

  it('accepts raw or base64 service-account JSON with an HTTPS or domain property', () => {
    const base64Credentials = Buffer.from(credentials).toString('base64');

    expect(readGscConfig({
      GSC_SITE_URL: 'https://example.com/',
      GSC_SERVICE_ACCOUNT_JSON: credentials,
    })).toMatchObject({ ok: true, config: { siteUrl: 'https://example.com/' } });
    expect(readGscConfig({
      GSC_SITE_URL: 'sc-domain:example.com',
      GSC_SERVICE_ACCOUNT_JSON: base64Credentials,
    })).toMatchObject({ ok: true, config: { siteUrl: 'sc-domain:example.com' } });
  });

  it('queries the injected client once and returns a read-only performance snapshot', async () => {
    const parsed = readGscConfig({
      GSC_SITE_URL: 'sc-domain:example.com',
      GSC_SERVICE_ACCOUNT_JSON: credentials,
    });
    if (!parsed.ok) throw new Error('expected valid GSC config');

    const calls: unknown[] = [];
    const client: GscPerformanceClient = {
      async query(request) {
        calls.push(request);
        return [{ keys: ['query'], clicks: 2, impressions: 20, ctr: 0.1, position: 4 }];
      },
    };

    const snapshot = await snapshotGscPerformance(parsed.config, client);

    expect(calls).toEqual([{ property: 'sc-domain:example.com' }]);
    expect(snapshot).toMatchObject({
      source: 'GSC', property: 'sc-domain:example.com', rows: [{ clicks: 2 }],
    });
    expect(snapshot.queriedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
