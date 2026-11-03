import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type {
  BloggerCandidate,
  BloggerGateResult,
  OriginalityRecord,
  SemanticComparator,
} from './types.js';

export function normalizeVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function contentHash(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function exactCollision(candidate: BloggerCandidate, entry: OriginalityRecord): boolean {
  return normalizeVietnamese(candidate.title) === normalizeVietnamese(entry.title)
    || normalizeVietnamese(candidate.slug) === normalizeVietnamese(entry.slug)
    || normalizeVietnamese(candidate.intent) === normalizeVietnamese(entry.intent)
    || normalizeVietnamese(candidate.cluster) === normalizeVietnamese(entry.cluster)
    || contentHash(candidate.body) === contentHash(entry.body);
}

function parseFrontmatter(markdown: string): { frontmatter: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(markdown);
  if (!match) return { frontmatter: {}, body: markdown.trim() };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const field = /^([^:#]+):\s*(.*)$/u.exec(line);
    if (field) frontmatter[field[1].trim()] = field[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { frontmatter, body: match[2].trim() };
}

function markdownPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownPaths(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

export function loadPrimaryArticles(directory = 'src/content/articles'): OriginalityRecord[] {
  return markdownPaths(directory).map((path) => {
    const { frontmatter, body } = parseFrontmatter(readFileSync(path, 'utf8'));
    const slug = frontmatter.slug || basename(path, '.md');
    return {
      title: frontmatter.title || '',
      slug,
      intent: frontmatter.intent || '',
      cluster: frontmatter.cluster || '',
      body,
    };
  });
}

export function checkOriginality(
  candidate: BloggerCandidate,
  primaryArticles: readonly OriginalityRecord[],
  ledgerEntries: readonly OriginalityRecord[],
  compareSemantic?: SemanticComparator,
): BloggerGateResult {
  if (primaryArticles.some((entry) => exactCollision(candidate, entry))) {
    return { decision: 'HOLD', reason: 'PRIMARY_TOPIC_COLLISION' };
  }
  if (ledgerEntries.some((entry) => exactCollision(candidate, entry))) {
    return { decision: 'HOLD', reason: 'LEDGER_TOPIC_COLLISION' };
  }

  const comparison = compareSemantic?.(candidate, [...primaryArticles, ...ledgerEntries]);
  if (!comparison?.modelId || !comparison.metric || !Number.isFinite(comparison.similarity)
    || !Number.isFinite(comparison.threshold) || comparison.similarity < 0 || comparison.similarity > 1
    || comparison.threshold < 0 || comparison.threshold > 1 || comparison.similarity >= comparison.threshold) {
    return { decision: 'HOLD', reason: 'SIMILARITY_HOLD' };
  }
  return { decision: 'PASS' };
}
