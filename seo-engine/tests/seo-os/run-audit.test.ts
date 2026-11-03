import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAuditCli } from '../../scripts/seo-os/run-audit.js';

const fixturePath = join(process.cwd(), 'tests/seo-os/fixtures/sample-crawl.json');

describe('local SEO audit CLI', () => {
  it('requires an explicit crawl input', async () => {
    await expect(runAuditCli([], { stdout: () => undefined }))
      .rejects.toThrow('AUDIT_INPUT_REQUIRED');
  });

  it('dry-runs a local JSON crawl without writing a report or ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seo-audit-cli-'));
    const outputPath = join(root, 'report.json');
    const stdout: string[] = [];

    const result = await runAuditCli([
      '--dry-run',
      '--input', fixturePath,
      '--output', outputPath,
    ], {
      cwd: root,
      stdout: (text) => stdout.push(text),
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    expect(result.mode).toBe('DRY_RUN');
    expect(result.report.summary.observations).toBeGreaterThan(0);
    expect(JSON.parse(stdout.join(''))).toEqual(result.report);
    await expect(readFile(outputPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'state/seo-audit-ledger-local.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('normal mode writes only the requested local report and audit ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seo-audit-cli-'));

    const result = await runAuditCli([
      '--input', fixturePath,
      '--output', 'reports/audit.json',
    ], {
      cwd: root,
      stdout: () => undefined,
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    });

    expect(result.mode).toBe('LOCAL_WRITE');
    expect(JSON.parse(await readFile(join(root, 'reports/audit.json'), 'utf8')))
      .toEqual(result.report);
    expect(JSON.parse(await readFile(join(root, 'state/seo-audit-ledger-local.json'), 'utf8')).runs)
      .toEqual([expect.objectContaining({
        mode: 'LOCAL',
        inputPath: fixturePath,
        outputPath: join(root, 'reports/audit.json'),
        summary: result.report.summary,
      })]);
  });

  it('rejects secret-looking keys and values before stdout, reports, or ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seo-audit-cli-'));
    const inputPath = join(root, 'crawl.json');
    await writeFile(inputPath, JSON.stringify({
      private_key: '-----BEGIN PRIVATE KEY-----not-for-output',
      sitemapUrls: ['https://site.test/a'],
      pages: [
        { url: 'https://site.test/', links: ['/a'] },
        { url: 'https://site.test/sk-proj-1234567890abcdefghijklmnopqrstuvwxyz', status: 200 },
      ],
    }), 'utf8');
    const stdout: string[] = [];

    await expect(runAuditCli(['--input', inputPath, '--output', 'report.json'], {
      cwd: root,
      stdout: (text) => stdout.push(text),
      now: () => new Date('2026-08-02T00:00:00.000Z'),
    })).rejects.toThrow('AUDIT_INPUT_SECRET_REJECTED');

    expect(stdout).toEqual([]);
    await expect(readFile(join(root, 'report.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'state/seo-audit-ledger-local.json'), 'utf8'))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});
