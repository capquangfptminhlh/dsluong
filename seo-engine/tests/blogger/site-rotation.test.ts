import { describe, expect, it } from 'vitest';
import { runWorker, type WorkerDependencies } from '../../src/blogger/worker.js';
import type { BloggerLedgerEntry, BloggerSite, BloggerTopic } from '../../src/blogger/types.js';

function site(siteId: string): BloggerSite {
  return { siteId, blogId: `blog-${siteId}`, enabled: true, charter: `Charter ${siteId}`, cadenceDays: 7 };
}

function topic(siteId: string): BloggerTopic {
  return {
    topicId: `t-${siteId}`, siteId, channel: 'blogger', title: `Bài ${siteId}`,
    intent: 'i', cluster: 'c', sourceFactIds: ['f1'], contentVersion: 'v1', status: 'PENDING',
  };
}

function entry(siteId: string, updatedAt: string): BloggerLedgerEntry {
  return {
    key: `k-${siteId}`, siteId, blogId: `blog-${siteId}`, topicId: `old-${siteId}`,
    contentVersion: 'v1', status: 'COMPLETED', postId: 'p', createdAt: updatedAt, updatedAt,
  } as BloggerLedgerEntry;
}

/** Dừng ngay sau khi chọn được việc — chỉ cần biết worker nhắm vào blog nào. */
function depsFor(sites: BloggerSite[], entries: BloggerLedgerEntry[]) {
  const picked: string[] = [];
  return {
    picked,
    deps: {
      sites,
      topics: sites.map((s) => topic(s.siteId)),
      facts: [],
      async generateCandidate(selectedSite) {
        picked.push(selectedSite.siteId);
        throw new Error('STOP_AFTER_SELECTION');
      },
      validateConfiguration() {},
      validateFacts: () => ({ decision: 'PASS' as const }),
      checkOriginality: () => ({ decision: 'PASS' as const }),
      applyHtmlPolicy: (html: string) => html,
      resolveRequiredImage: () => ({ publicPath: '/x.png', alt: 'x' }),
      ledger: {
        async get() { return undefined; },
        async entries() { return entries; },
        async reserve() {},
        async update() {},
      },
      client: {} as never,
      topicStore: { async setStatus() {} },
    } as unknown as WorkerDependencies,
  };
}

describe('luân phiên giữa nhiều blog', () => {
  it('ưu tiên blog lâu nhất chưa đăng, không phải blog khai báo đầu tiên', async () => {
    const sites = [site('fnb'), site('retail'), site('beauty')];
    const entries = [
      entry('fnb', '2026-08-01T00:00:00Z'),
      entry('retail', '2026-07-20T00:00:00Z'), // cũ nhất → phải được chọn
      entry('beauty', '2026-07-28T00:00:00Z'),
    ];
    const { picked, deps } = depsFor(sites, entries);

    await runWorker(deps).catch(() => undefined);

    expect(picked[0]).toBe('retail');
  });

  it('blog chưa từng đăng bài nào được đi trước', async () => {
    const sites = [site('fnb'), site('ecommerce')];
    const entries = [entry('fnb', '2026-08-01T00:00:00Z')];
    const { picked, deps } = depsFor(sites, entries);

    await runWorker(deps).catch(() => undefined);

    expect(picked[0]).toBe('ecommerce');
  });

  it('bỏ qua blog đang tắt', async () => {
    const disabled = { ...site('fnb'), enabled: false };
    const { picked, deps } = depsFor([disabled, site('retail')], []);

    await runWorker(deps).catch(() => undefined);

    expect(picked[0]).toBe('retail');
  });
});
