import { chmod, mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAuditLedger,
  resolveAuditLedgerPath,
} from '../../src/seo-os/ledger.js';
import type { AuditRun } from '../../src/seo-os/types.js';

function run(id: string): AuditRun {
  return {
    id,
    mode: 'LOCAL',
    inputPath: 'tests/seo-os/fixtures/sample-crawl.json',
    startedAt: '2026-08-02T00:00:00.000Z',
    completedAt: '2026-08-02T00:00:01.000Z',
    summary: {
      observations: 1,
      recommendations: 1,
      statuses: { NEW: 1, HOLD: 0 },
      severities: { LOW: 0, MEDIUM: 1, HIGH: 0, CRITICAL: 0 },
    },
  };
}

describe('SEO audit ledger', () => {
  it('uses a local default and requires the exact durable production path', () => {
    expect(resolveAuditLedgerPath({}, '/project'))
      .toBe(join('/project', 'state/seo-audit-ledger-local.json'));
    expect(() => resolveAuditLedgerPath({ NODE_ENV: 'production' }, '/project'))
      .toThrow('SEO_AUDIT_LEDGER_PATH_REQUIRED');
    expect(() => resolveAuditLedgerPath({
      NODE_ENV: 'production',
      SEO_AUDIT_LEDGER_PATH: '/tmp/audit-ledger.json',
    }, '/project')).toThrow('SEO_AUDIT_LEDGER_PATH_INVALID');
    expect(resolveAuditLedgerPath({
      NODE_ENV: 'production',
      SEO_AUDIT_LEDGER_PATH: '/var/lib/autotax-seo/audit-ledger.json',
    }, '/project')).toBe('/var/lib/autotax-seo/audit-ledger.json');
  });

  it('records concurrent runs once each under an exclusive lock', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seo-audit-ledger-'));
    const path = join(root, 'state', 'ledger.json');
    const first = createAuditLedger(path);
    const second = createAuditLedger(path);

    await Promise.all([first.record(run('run-1')), second.record(run('run-2'))]);

    expect((await first.entries()).map((entry) => entry.id).sort())
      .toEqual(['run-1', 'run-2']);
  });

  it('atomically replaces the ledger and secures its directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seo-audit-ledger-'));
    const directory = join(root, 'state');
    const path = join(directory, 'ledger.json');
    const ledger = createAuditLedger(path);

    await ledger.record(run('run-1'));
    await chmod(directory, 0o777);
    await ledger.record(run('run-2'));

    expect(JSON.parse(await readFile(path, 'utf8')).runs).toHaveLength(2);
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    if (process.platform !== 'win32') {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    }
  });

  it('rejects secret-looking keys and values without serializing them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seo-audit-ledger-'));
    const path = join(root, 'ledger.json');
    const ledger = createAuditLedger(path);
    const unsafe = {
      ...run('unsafe'),
      private_key: '-----BEGIN PRIVATE KEY-----not-for-ledger',
    } as AuditRun;

    await expect(ledger.record(unsafe)).rejects.toThrow('SEO_AUDIT_LEDGER_SECRET_REJECTED');
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(ledger.record({
      ...run('unsafe-value'),
      inputPath: 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz',
    })).rejects.toThrow('SEO_AUDIT_LEDGER_SECRET_REJECTED');
  });
});
