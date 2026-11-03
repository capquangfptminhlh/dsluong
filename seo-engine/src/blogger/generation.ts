import type { BloggerCandidate } from './types.js';

/** Parses only the minimal, reviewable generated-draft contract. */
export function parseGeneratedCandidate(raw: string): BloggerCandidate {
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/gu, '').trim();
  const candidate: unknown = JSON.parse(json);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('BLOGGER_GENERATION_INVALID');
  }
  const value = candidate as Record<string, unknown>;
  const required = ['title', 'slug', 'intent', 'cluster', 'body'] as const;
  if (required.some((field) => typeof value[field] !== 'string' || value[field].trim().length === 0)
    || (value.labels !== undefined && (!Array.isArray(value.labels)
      || value.labels.some((label) => typeof label !== 'string' || label.trim().length === 0)))
    || !Array.isArray(value.factClaims)
    || value.factClaims.some((claim) => !claim || typeof claim !== 'object' || Array.isArray(claim)
      || Object.keys(claim as object).length !== 2
      || typeof (claim as Record<string, unknown>).factId !== 'string'
      || !(claim as Record<string, unknown>).factId.trim()
      || typeof (claim as Record<string, unknown>).claim !== 'string'
      || !(claim as Record<string, unknown>).claim.trim())) {
    throw new Error('BLOGGER_GENERATION_INVALID');
  }
  return {
    title: value.title as string, slug: value.slug as string, intent: value.intent as string,
    cluster: value.cluster as string, body: value.body as string,
    labels: (value.labels ?? []) as string[],
    factClaims: value.factClaims as BloggerCandidate['factClaims'],
  };
}
