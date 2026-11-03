import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { runWorker, type WorkerDependencies } from '../../src/blogger/worker.js';
import type { BloggerLedgerEntry, BloggerLedgerStore } from '../../src/blogger/types.js';
import { createBloggerClient } from '../../src/blogger/client.js';

const requiredImage = {
  publicPath: '/blogger/images/autotax-pos-sale.png',
  alt: 'AutoTax point-of-sale screen for sales and store closing operations',
};
const factClaim = 'Quy trình kết ca cần đối chiếu tiền và đơn hàng.';
const storedExpectedHtml = `<p>Hãy kiểm tra tiền và đơn hàng trước khi đóng ca để kịp thời xử lý chênh lệch. ${factClaim}</p>`
  + '<h2>Đối chiếu doanh thu</h2><p>So sánh tiền mặt với đơn hoàn tất.</p>'
  + '<h2>Kiểm tra hàng hóa</h2><p>Ghi nhận hàng thiếu hoặc hư hỏng.</p>'
  + '<h2>Bàn giao ca</h2><p>Lưu biên bản và báo cáo chênh lệch.</p>'
  + '<img src="https://autotaxpos.com/blogger/images/autotax-pos-sale.png" alt="AutoTax point-of-sale screen for sales and store closing operations">';

function dependencies(overrides: Partial<WorkerDependencies> = {}) {
  const entries = new Map<string, BloggerLedgerEntry>();
  const events: string[] = [];
  const completed: string[] = [];
  const statuses: Array<{ status: string; reason?: string }> = [];
  let inserts = 0;
  const ledger: BloggerLedgerStore = {
    get: async (key) => entries.get(key),
    canInsert: async (key) => !entries.has(key),
    reserveInsert: async (entry) => {
      if (entries.has(entry.key)) return false;
      events.push('ledger');
      entries.set(entry.key, { ...entry, status: 'INSERT_STARTED', createdAt: 'now', updatedAt: 'now' });
      return true;
    },
    recordInsertStarted: async (entry) => {
      events.push('ledger');
      entries.set(entry.key, { ...entry, status: 'INSERT_STARTED', createdAt: 'now', updatedAt: 'now' });
    },
    recordPostId: async (key, postId) => {
      entries.set(key, { ...entries.get(key)!, postId });
    },
    recordCompleted: async (key, postId) => {
      entries.set(key, { ...entries.get(key)!, status: 'COMPLETED', postId });
    },
    recordOutcome: async (entry) => {
      entries.set(entry.key, {
        ...entries.get(entry.key), ...entry,
        createdAt: entries.get(entry.key)?.createdAt ?? 'now', updatedAt: 'now',
      });
    },
    entries: async () => [...entries.values()],
  };
  const deps: WorkerDependencies = {
    sites: [{ siteId: 's1', blogId: 'b1', enabled: true, charter: 'Focused charter', cadenceDays: 7 }],
    topics: [{
      topicId: 't1', siteId: 's1', channel: 'blogger', title: 'Fresh topic', intent: 'guide', cluster: 'ops',
      sourceFactIds: ['f1'], contentVersion: 'v1', status: 'PENDING',
    }],
    generateCandidate: async () => {
      events.push('generate');
      return {
        title: 'Fresh title', slug: 'fresh-title', intent: 'guide', cluster: 'ops', labels: ['ops'], requiredImage,
        factClaims: [{ factId: 'f1', claim: factClaim }],
        body: `<p>Hãy kiểm tra tiền và đơn hàng trước khi đóng ca để kịp thời xử lý chênh lệch. ${factClaim}</p>`
          + '<h2>Đối chiếu doanh thu</h2><p>So sánh tiền mặt với đơn hoàn tất.</p>'
          + '<h2>Kiểm tra hàng hóa</h2><p>Ghi nhận hàng thiếu hoặc hư hỏng.</p>'
          + '<h2>Bàn giao ca</h2><p>Lưu biên bản và báo cáo chênh lệch.</p>',
      };
    },
    validateConfiguration: () => events.push('config'),
    validateFacts: () => { events.push('facts'); return { decision: 'PASS' }; },
    facts: [{ factId: 'f1', reviewByDate: '2026-12-31T23:59:59Z', statement: factClaim }],
    checkOriginality: () => { events.push('originality'); return { decision: 'PASS' }; },
    applyHtmlPolicy: (html) => { events.push('html'); return html; },
    resolveRequiredImage: () => requiredImage,
    ledger,
    client: {
      insertDraft: async () => { events.push('insert'); inserts += 1; return { id: 'p1' }; },
      getPostAdmin: async (input) => { events.push('readback'); return { id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', content: input.expected.html }; },
      verifyKnownDraft: async (input) => ({ id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', content: input.expectedHtml }),
      listPosts: async () => [],
    },
    topicStore: {
      setStatus: async (topic, status, reason) => {
        statuses.push({ status, reason });
        if (status === 'COMPLETED') completed.push(topic.topicId);
      },
    },
    ...overrides,
  };
  return { deps, events, completed, statuses, entries, get inserts() { return inserts; } };
}

describe('Blogger worker', () => {
  it('sets a non-zero exit code in the CLI top-level catch', async () => {
    const source = await readFile('scripts/blogger/run-worker.ts', 'utf8');
    expect(source).toMatch(/main\(\)\.catch/);
    expect(source).toMatch(/process\.exitCode\s*=\s*1/);
  });

  it('runs gates in order and completes only after read-back', async () => {
    const fixture = dependencies();
    await expect(runWorker(fixture.deps)).resolves.toMatchObject({ status: 'COMPLETED', postId: 'p1' });
    expect(fixture.events).toEqual([
      'generate', 'config', 'facts', 'originality', 'html', 'ledger', 'insert', 'readback',
    ]);
    expect(fixture.completed).toEqual(['t1']);
  });

  it('submits a valid draft with exactly the worker-injected registered screenshot', async () => {
    const requests: Array<{ requestBody: { content: string } }> = [];
    const fixture = dependencies({
      generateCandidate: async () => ({
        title: 'Fresh title', slug: 'fresh-title', intent: 'guide', cluster: 'ops', factClaims: [{ factId: 'f1', claim: factClaim }],
        body: `<p>Hãy kiểm tra tiền và đơn hàng trước khi đóng ca để kịp thời xử lý chênh lệch. ${factClaim}</p>`
          + '<h2>Đối chiếu doanh thu</h2><p>So sánh tiền mặt với đơn hoàn tất.</p>'
          + '<h2>Kiểm tra hàng hóa</h2><p>Ghi nhận hàng thiếu hoặc hư hỏng.</p>'
          + '<h2>Bàn giao ca</h2><p>Lưu biên bản và báo cáo chênh lệch.</p>'
          + '<img src="https://example.com/untrusted.png" alt="Không dùng">',
      }),
      client: createBloggerClient({
        insert: async (request) => {
          requests.push(request);
          return { data: { id: 'p1' } };
        },
        get: async () => ({
          data: {
            id: 'p1', blog: { id: 'b1' }, status: 'DRAFT', title: 'Fresh title', labels: [],
            content: requests[0]!.requestBody.content,
          },
        }),
        list: async () => ({ data: {} }),
      }),
    });

    await expect(runWorker(fixture.deps)).resolves.toMatchObject({ status: 'COMPLETED', postId: 'p1' });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.requestBody.content).toContain(
      '<img src="https://autotaxpos.com/blogger/images/autotax-pos-sale.png" alt="AutoTax point-of-sale screen for sales and store closing operations" />',
    );
    expect(requests[0]!.requestBody.content).not.toContain('example.com');
  });

  it('does not complete a topic when read-back fails', async () => {
    const fixture = dependencies({
      client: {
        insertDraft: async () => ({ id: 'p1' }),
        getPostAdmin: async () => { throw new Error('VERIFY_FAILED'); },
        verifyKnownDraft: async () => ({ id: 'p1', blog: { id: 'b1' }, status: 'DRAFT' }),
        listPosts: async () => [],
      },
    });

    await expect(runWorker(fixture.deps)).rejects.toThrow('VERIFY_FAILED');
    expect(fixture.completed).toEqual([]);
    expect(fixture.statuses).toContainEqual({ status: 'REGENERATE', reason: 'VERIFY_FAILED' });
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({ status: 'INSERT_STARTED', postId: 'p1' });
  });

  it('reconciles INSERT_STARTED through read-back and never inserts twice', async () => {
    const fixture = dependencies();
    fixture.entries.set('b1:t1:v1', {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1', contentVersion: 'v1',
      contentHash: 'unused', expectedHtml: storedExpectedHtml, factClaims: [{ factId: 'f1', claim: factClaim }], status: 'INSERT_STARTED', createdAt: 'then', updatedAt: 'then', postId: 'p-existing',
    });

    await expect(runWorker(fixture.deps)).resolves.toMatchObject({ status: 'COMPLETED', postId: 'p-existing', reconciled: true });
    expect(fixture.inserts).toBe(0);
  });

  it('propagates the required screenshot into known-insert recovery verification', async () => {
    const seen: unknown[] = [];
    const fixture = dependencies({
      client: {
        insertDraft: async () => ({ id: 'p1' }),
        getPostAdmin: async () => ({ id: 'p1' }),
        verifyKnownDraft: async (input) => { seen.push(input); return { id: 'p-existing', content: input.expectedHtml }; },
        listPosts: async () => [],
      },
    });
    fixture.entries.set('b1:t1:v1', {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1', contentVersion: 'v1',
      contentHash: 'unused', expectedHtml: storedExpectedHtml, factClaims: [{ factId: 'f1', claim: factClaim }], status: 'INSERT_STARTED', createdAt: 'then', updatedAt: 'then', postId: 'p-existing',
    });

    await runWorker(fixture.deps);
    expect(seen).toEqual([expect.objectContaining({ requiredImage })]);
  });

  it('holds before HTML or ledger reservation when screenshot resolution fails', async () => {
    const fixture = dependencies({
      resolveRequiredImage: () => { throw new Error('IMAGE_NOT_FOUND'); },
    });

    await expect(runWorker(fixture.deps)).resolves.toEqual({ status: 'HOLD', reason: 'IMAGE_NOT_FOUND' });
    expect(fixture.events).toEqual(['generate', 'config', 'facts', 'originality']);
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({ status: 'HOLD', reason: 'IMAGE_NOT_FOUND' });
  });

  it('holds before reservation when final HTML policy removes the required screenshot', async () => {
    const fixture = dependencies({
      applyHtmlPolicy: (html) => html.replace(/<img\b[^>]*>/giu, ''),
    });

    await expect(runWorker(fixture.deps)).resolves.toEqual({ status: 'HOLD', reason: 'IMAGE_POLICY_FAILED' });
    expect(fixture.events).not.toContain('ledger');
    expect(fixture.events).not.toContain('insert');
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({ status: 'HOLD', reason: 'IMAGE_POLICY_FAILED' });
  });

  it('holds before any reservation or API call when a fact-grounded draft omits its declarations', async () => {
    const fixture = dependencies({
      generateCandidate: async () => ({
        title: 'Fresh title', slug: 'fresh-title', intent: 'guide', cluster: 'ops', factClaims: [],
        body: `<p>Hãy kiểm tra tiền và đơn hàng trước khi đóng ca để kịp thời xử lý chênh lệch. ${factClaim}</p>`
          + '<h2>Đối chiếu doanh thu</h2><p>So sánh tiền mặt với đơn hoàn tất.</p>'
          + '<h2>Kiểm tra hàng hóa</h2><p>Ghi nhận hàng thiếu hoặc hư hỏng.</p>'
          + '<h2>Bàn giao ca</h2><p>Lưu biên bản và báo cáo chênh lệch.</p>',
      }),
    });

    await expect(runWorker(fixture.deps)).resolves.toEqual({ status: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
    expect(fixture.events).not.toContain('ledger');
    expect(fixture.events).not.toContain('insert');
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({ status: 'HOLD', reason: 'FACT_EVIDENCE_INVALID' });
  });

  it('moves a known insert to HOLD when its screenshot cannot be resolved for recovery', async () => {
    const fixture = dependencies({
      resolveRequiredImage: () => { throw new Error('IMAGE_NOT_FOUND'); },
    });
    fixture.entries.set('b1:t1:v1', {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1', contentVersion: 'v1',
      contentHash: 'unused', expectedHtml: storedExpectedHtml, factClaims: [{ factId: 'f1', claim: factClaim }], status: 'INSERT_STARTED', createdAt: 'then', updatedAt: 'then', postId: 'p-existing',
    });

    await expect(runWorker(fixture.deps)).resolves.toEqual({ status: 'HOLD', reason: 'IMAGE_NOT_FOUND' });
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({ status: 'HOLD', reason: 'IMAGE_NOT_FOUND' });

    fixture.deps.topics[0].status = 'PENDING';
    await expect(runWorker(fixture.deps)).resolves.toEqual({ status: 'HOLD', reason: 'IMAGE_NOT_FOUND' });
    expect(fixture.inserts).toBe(0);
    expect(fixture.events).not.toContain('ledger');
  });

  it('persists a reconciliation reason when no remote post can be identified', async () => {
    const fixture = dependencies();
    fixture.entries.set('b1:t1:v1', {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1', contentVersion: 'v1',
      contentHash: 'missing', status: 'INSERT_STARTED', createdAt: 'then', updatedAt: 'then',
    });

    await expect(runWorker(fixture.deps)).rejects.toThrow('INSERT_RECONCILIATION_REQUIRED');
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({
      status: 'INSERT_STARTED', reason: 'INSERT_RECONCILIATION_REQUIRED',
    });
  });

  it('persists VERIFY_FAILED when an insert response has no post ID', async () => {
    const fixture = dependencies({
      client: {
        insertDraft: async () => ({}),
        getPostAdmin: async () => ({}),
        verifyKnownDraft: async () => ({}),
        listPosts: async () => [],
      },
    });

    await expect(runWorker(fixture.deps)).rejects.toThrow('VERIFY_FAILED');
    expect(fixture.entries.get('b1:t1:v1')).toMatchObject({
      status: 'INSERT_STARTED', reason: 'VERIFY_FAILED',
    });
  });

  it('selects at most one enabled site topic in PENDING or REGENERATE', async () => {
    const fixture = dependencies();
    fixture.deps.topics.push({ ...fixture.deps.topics[0], topicId: 't2', status: 'REGENERATE' });
    await runWorker(fixture.deps);
    expect(fixture.inserts).toBe(1);
  });
});
