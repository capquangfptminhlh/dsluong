import { describe, expect, it } from 'vitest';
import { parseTopics } from '../../src/blogger/config.js';

const SITE_IDS = new Set(['s1']);

function topic(overrides: Record<string, unknown>) {
  return {
    topicId: 't', siteId: 's1', title: 'T', intent: 'i', cluster: 'c',
    sourceFactIds: ['f1'], contentVersion: 'v1', status: 'PENDING',
    ...overrides,
  };
}

describe('topic channel separation', () => {
  it('keeps the channel field through parsing so each queue can filter on it', () => {
    const parsed = parseTopics([topic({ topicId: 'a', channel: 'blogger' })], SITE_IDS);

    expect(parsed[0].channel).toBe('blogger');
  });

  it('accepts a topic without a channel (legacy = main queue)', () => {
    const parsed = parseTopics([topic({ topicId: 'b' })], SITE_IDS);

    expect(parsed[0].channel).toBeUndefined();
  });

  it('rejects an unknown channel value instead of silently ignoring it', () => {
    expect(() => parseTopics([topic({ topicId: 'c', channel: 'facebook' })], SITE_IDS)).toThrow();
  });

  it('keeps the two live queues disjoint in config/topics.json', async () => {
    const { readFile } = await import('node:fs/promises');
    const topics = JSON.parse(await readFile('config/topics.json', 'utf8'));
    const pendingBlogger = topics.filter((t: any) => t.status === 'PENDING' && t.channel === 'blogger');
    const pendingMain = topics.filter((t: any) => t.status === 'PENDING' && t.channel !== 'blogger');

    expect(pendingBlogger.length).toBeGreaterThan(0);
    expect(pendingMain.length).toBeGreaterThan(0);
    // Một tiêu đề chỉ được thuộc về đúng một kênh, nếu không gate originality sẽ
    // chặn bài Blogger vì trùng nội dung web chính.
    const mainTitles = new Set(pendingMain.map((t: any) => t.title.toLowerCase().trim()));
    const overlap = pendingBlogger.filter((t: any) => mainTitles.has(t.title.toLowerCase().trim()));
    expect(overlap).toEqual([]);
  });
});
