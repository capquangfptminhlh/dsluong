import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots: string[] = [];

function createQualitativePackage(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'autotax-content-bank-'));
  temporaryRoots.push(root);
  const siteDir = path.join(root, 'autotax-blogger-pilot');
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(path.join(siteDir, 'article.json'), JSON.stringify({
    topicId: 'test-qualitative-content-bank-unique',
    title: 'Keep shop handover notes clear',
    intent: 'test-qualitative-handover-guidance',
    cluster: 'pos-operations',
    sourceFactIds: [],
    factClaims: [],
    labels: ['test'],
    body: [
      '<p>Observe the shop routine carefully and write down exceptions before they become harder to investigate.</p>',
      '<h2>Review the handover notes</h2><p>Read the notes from the previous shift and clarify incomplete handover before starting work.</p>',
      '<h2>Keep records easy to follow</h2><p>Use consistent names for the same activity so the owner can follow the history without guessing.</p>',
      '<h2>Discuss unusual changes early</h2><p>Tell the responsible person about an unusual pattern while the details are still clear to everyone involved.</p>',
    ].join(''),
  }), 'utf8');
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Blogger content-bank importer', () => {
  it('accepts a qualitative package in dry-run mode without changing the live queue', () => {
    const packageRoot = createQualitativePackage();
    const output = execFileSync(process.execPath, [
      'scripts/import-blogger-articles.mjs', packageRoot, '--dry-run',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(output).toMatch(/Nhận: 1\s+.*Từ chối: 0/su);
  });
});
