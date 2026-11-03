import { readFileSync } from 'node:fs';
import type { BloggerFact, BloggerGateResult } from './types.js';

export function loadFacts(path = 'data/facts.json'): BloggerFact[] {
  const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data)) throw new Error('Facts data must be an array');
  return data as BloggerFact[];
}

export function validateFacts(
  sourceFactIds: readonly string[],
  facts = loadFacts(),
  now = new Date(),
): BloggerGateResult {
  for (const factId of sourceFactIds) {
    const fact = facts.find((item) => item.factId === factId);
    if (!fact) return { decision: 'HOLD', reason: 'FACT_NOT_FOUND' };

    const reviewBy = new Date(fact.reviewByDate);
    if (Number.isNaN(reviewBy.getTime()) || reviewBy.getTime() < now.getTime()) {
      return { decision: 'HOLD', reason: 'FACT_EXPIRED' };
    }
  }
  return { decision: 'PASS' };
}
