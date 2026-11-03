import { describe, expect, it } from 'vitest';
import { loadFacts, validateFacts } from '../../src/blogger/facts.js';

describe('Blogger fact gate', () => {
  it('holds a referenced fact that has expired', () => {
    expect(validateFacts(
      ['fact_1'],
      [{ factId: 'fact_1', reviewByDate: '2020-01-01T00:00:00Z' }],
      new Date('2026-08-01T00:00:00Z'),
    )).toMatchObject({ decision: 'HOLD', reason: 'FACT_EXPIRED' });
  });

  it('holds a fact reference that does not exist', () => {
    expect(validateFacts(['missing'], [{ factId: 'fact_1', reviewByDate: '2026-12-31T23:59:59Z' }]))
      .toMatchObject({ decision: 'HOLD', reason: 'FACT_NOT_FOUND' });
  });

  it('loads the repository fact ledger by default', () => {
    expect(loadFacts().map((fact) => fact.factId)).toContain('fact_001');
  });
});
