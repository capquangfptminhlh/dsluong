import { describe, expect, it } from 'vitest';
import { parseGeneratedCandidate } from '../../src/blogger/generation.js';

const valid = JSON.stringify({
  title: 'T', slug: 't', intent: 'guide', cluster: 'ops', body: '<p>Body</p>', labels: ['ops'],
  factClaims: [{ factId: 'fact_001', claim: 'A grounded rendered claim.' }],
});

describe('Blogger generated candidate schema', () => {
  it('accepts only a complete typed candidate with structured fact claims', () => {
    expect(parseGeneratedCandidate(valid)).toMatchObject({ title: 'T', factClaims: [{ factId: 'fact_001' }] });
  });

  it('rejects malformed fields, labels, and fact claims before a worker can reserve an insert', () => {
    expect(() => parseGeneratedCandidate('{"title":""}')).toThrow('BLOGGER_GENERATION_INVALID');
    expect(() => parseGeneratedCandidate(valid.replace('"ops"', '123'))).toThrow('BLOGGER_GENERATION_INVALID');
    expect(() => parseGeneratedCandidate(valid.replace('"claim":"A grounded rendered claim."', '"claim":3'))).toThrow('BLOGGER_GENERATION_INVALID');
  });
});
