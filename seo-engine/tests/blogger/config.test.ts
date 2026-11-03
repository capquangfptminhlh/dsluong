import { describe, expect, it } from 'vitest';
import { parseBloggerSites, parseTopics } from '../../src/blogger/config.js';

describe('Blogger configuration', () => {
  const site = (index: number) => ({
    siteId: `site-${index}`,
    blogId: String(index),
    enabled: false,
    charter: 'Information for small business owners',
    cadenceDays: 7,
    approvedDestination: 'https://autotaxpos.com/',
  });

  it('accepts up to five sites (mỗi blog một ngách riêng)', () => {
    expect(parseBloggerSites({ sites: Array.from({ length: 5 }, (_, i) => site(i)) })).toHaveLength(5);
  });

  it('rejects more than five sites', () => {
    expect(() => parseBloggerSites({ sites: Array.from({ length: 6 }, (_, i) => site(i)) }))
      .toThrow(/maximum of 5/i);
  });

  it('rejects a topic whose site is absent', () => {
    expect(() => parseTopics([{
      topicId: 't1',
      siteId: 'missing',
      title: 'Title',
      intent: 'guide',
      cluster: 'pos',
      sourceFactIds: ['fact_001'],
      contentVersion: 'v1',
      status: 'PENDING',
    }], new Set(['site-a']))).toThrow(/siteId/i);
  });

  it('accepts a qualitative Blogger topic with no declared fact IDs', () => {
    const topics = parseTopics([{
      topicId: 'qualitative-checklist',
      siteId: 'site-a',
      title: 'Checklist vận hành quầy thu ngân',
      intent: 'checklist',
      cluster: 'pos',
      sourceFactIds: [],
      contentVersion: 'v1',
      status: 'PENDING',
      channel: 'blogger',
    }], new Set(['site-a']));

    expect(topics[0]?.sourceFactIds).toEqual([]);
  });
});
