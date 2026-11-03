import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkOriginality, loadPrimaryArticles, normalizeVietnamese } from '../../src/blogger/originality.js';
import type { BloggerCandidate, OriginalityRecord } from '../../src/blogger/types.js';

const candidate = (overrides: Partial<BloggerCandidate> = {}): BloggerCandidate => ({
  title: 'Quản lý kho', slug: 'quan-ly-kho', intent: 'inventory guide', cluster: 'inventory', body: 'Nội dung mới', ...overrides,
});
const article = (overrides: Partial<OriginalityRecord> = {}): OriginalityRecord => ({
  title: 'Một bài khác', slug: 'bai-khac', intent: 'other', cluster: 'other', body: 'Nội dung cũ', ...overrides,
});

describe('Blogger originality gate', () => {
  it('normalizes Vietnamese diacritics and punctuation', () => {
    expect(normalizeVietnamese('  Quản-lý KHO!  ')).toBe('quan ly kho');
  });

  it('holds an exact primary-blog title collision', () => {
    expect(checkOriginality(candidate(), [article({ title: 'Quản lý kho' })], [], () => ({ modelId: 'test', metric: 'cosine', similarity: 0.1, threshold: 0.8 })))
      .toMatchObject({ decision: 'HOLD', reason: 'PRIMARY_TOPIC_COLLISION' });
  });

  it('holds an exact ledger body collision', () => {
    expect(checkOriginality(candidate(), [], [article({ body: 'Nội dung mới' })], () => ({ modelId: 'test', metric: 'cosine', similarity: 0.1, threshold: 0.8 })))
      .toMatchObject({ decision: 'HOLD', reason: 'LEDGER_TOPIC_COLLISION' });
  });

  it('fails closed when similarity inputs are incomplete', () => {
    expect(checkOriginality(candidate(), [], [])).toMatchObject({ decision: 'HOLD', reason: 'SIMILARITY_HOLD' });
  });

  it('fails closed when the injected model omits its metric', () => {
    expect(checkOriginality(candidate(), [], [], () => ({ modelId: 'test', similarity: 0.1, threshold: 0.8 })))
      .toMatchObject({ decision: 'HOLD', reason: 'SIMILARITY_HOLD' });
  });

  it('fails closed for a non-finite model score', () => {
    expect(checkOriginality(candidate(), [], [], () => ({ modelId: 'test', metric: 'cosine', similarity: Number.NaN, threshold: 0.8 })))
      .toMatchObject({ decision: 'HOLD', reason: 'SIMILARITY_HOLD' });
  });

  it('fails closed for a similarity score outside the unit interval', () => {
    expect(checkOriginality(candidate(), [], [], () => ({ modelId: 'test', metric: 'cosine', similarity: -0.1, threshold: 0.8 })))
      .toMatchObject({ decision: 'HOLD', reason: 'SIMILARITY_HOLD' });
  });

  it('fails closed for a configured threshold outside the unit interval', () => {
    expect(checkOriginality(candidate(), [], [], () => ({ modelId: 'test', metric: 'cosine', similarity: 0.1, threshold: 2 })))
      .toMatchObject({ decision: 'HOLD', reason: 'SIMILARITY_HOLD' });
  });

  it('holds when model-specific similarity reaches its configured threshold', () => {
    expect(checkOriginality(candidate(), [], [], () => ({ modelId: 'test', metric: 'cosine', similarity: 0.8, threshold: 0.8 })))
      .toMatchObject({ decision: 'HOLD', reason: 'SIMILARITY_HOLD' });
  });

  it('parses Markdown frontmatter and body from the primary articles directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'blogger-primary-'));
    const articles = join(root, 'src', 'content', 'articles', 'nested');
    mkdirSync(articles, { recursive: true });
    writeFileSync(join(articles, 'kho.md'), '---\ntitle: "Quản lý kho"\nintent: inventory guide\ncluster: inventory\n---\n\nNội dung chính', 'utf8');

    expect(loadPrimaryArticles(join(root, 'src', 'content', 'articles'))).toEqual([
      expect.objectContaining({ title: 'Quản lý kho', slug: 'kho', intent: 'inventory guide', cluster: 'inventory', body: 'Nội dung chính' }),
    ]);
  });
});
