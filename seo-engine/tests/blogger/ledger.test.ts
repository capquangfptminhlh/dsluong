import { chmod, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createBloggerLedger,
  resolveBloggerLedgerPath,
} from '../../src/blogger/ledger.js';

describe('Blogger ledger', () => {
  it('does not insert again after INSERT_STARTED', async () => {
    const root = await mkdtemp(join(tmpdir(), 'blogger-ledger-'));
    const path = join(root, 'state', 'ledger.json');
    const ledger = createBloggerLedger(path);
    await ledger.recordInsertStarted({
      key: 'b1:t1:v1',
      siteId: 's1',
      blogId: 'b1',
      topicId: 't1',
      contentVersion: 'v1',
      contentHash: 'hash-1',
    });

    const reopened = createBloggerLedger(path);
    await expect(reopened.canInsert('b1:t1:v1')).resolves.toBe(false);
  });

  it('never reopens a HOLD record that already has a Blogger post ID', async () => {
    const root = await mkdtemp(join(tmpdir(), 'blogger-ledger-'));
    const path = join(root, 'state', 'ledger.json');
    const identity = {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1',
      contentVersion: 'v1', contentHash: 'hash-1',
    };
    const ledger = createBloggerLedger(path);
    await ledger.recordInsertStarted(identity);
    await ledger.recordPostId(identity.key, 'p-existing');
    await ledger.recordOutcome({ ...identity, status: 'HOLD', reason: 'IMAGE_NOT_FOUND', postId: 'p-existing' });

    await expect(ledger.canInsert(identity.key)).resolves.toBe(false);
    await expect(ledger.reserveInsert(identity)).resolves.toBe(false);
  });

  it('permits a normal HOLD record without a post ID to be retried', async () => {
    const root = await mkdtemp(join(tmpdir(), 'blogger-ledger-'));
    const path = join(root, 'state', 'ledger.json');
    const identity = {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1',
      contentVersion: 'v1', contentHash: 'hash-1',
    };
    const ledger = createBloggerLedger(path);
    await ledger.recordOutcome({ ...identity, status: 'HOLD', reason: 'IMAGE_NOT_FOUND' });

    await expect(ledger.canInsert(identity.key)).resolves.toBe(true);
    await expect(ledger.reserveInsert(identity)).resolves.toBe(true);
  });

  it('allows only one concurrent process to reserve an insert key', async () => {
    const root = await mkdtemp(join(tmpdir(), 'blogger-ledger-'));
    const path = join(root, 'state', 'ledger.json');
    const identity = {
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1',
      contentVersion: 'v1', contentHash: 'hash-1',
    };
    const first = createBloggerLedger(path);
    const second = createBloggerLedger(path);

    const reservations = await Promise.all([
      first.reserveInsert(identity),
      second.reserveInsert(identity),
    ]);

    expect(reservations.sort()).toEqual([false, true]);
    expect((await first.entries()).filter((entry) => entry.key === identity.key)).toHaveLength(1);
  });

  it('uses a local default but requires the explicit durable production path', () => {
    expect(resolveBloggerLedgerPath({}, '/project')).toBe(join('/project', 'state/blogger-ledger-local.json'));
    expect(() => resolveBloggerLedgerPath({ NODE_ENV: 'production' }, '/project'))
      .toThrow('BLOGGER_LEDGER_PATH_REQUIRED');
    expect(() => resolveBloggerLedgerPath({
      NODE_ENV: 'production', BLOGGER_LEDGER_PATH: '/tmp/ledger.json',
    }, '/project')).toThrow('BLOGGER_LEDGER_PATH_INVALID');
    expect(resolveBloggerLedgerPath({
      NODE_ENV: 'production', BLOGGER_LEDGER_PATH: '/var/lib/autotax-seo/blogger-ledger.json',
    }, '/project')).toBe('/var/lib/autotax-seo/blogger-ledger.json');
  });

  it('atomically replaces the file and secures the ledger directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'blogger-ledger-'));
    const directory = join(root, 'state');
    const path = join(directory, 'ledger.json');
    const ledger = createBloggerLedger(path);

    await ledger.recordInsertStarted({
      key: 'b1:t1:v1', siteId: 's1', blogId: 'b1', topicId: 't1',
      contentVersion: 'v1', contentHash: 'hash-1',
    });
    await chmod(directory, 0o777);
    await ledger.recordPostId('b1:t1:v1', 'p1');

    if (process.platform !== 'win32') {
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
    }
    expect(JSON.parse(await readFile(path, 'utf8')).entries).toEqual([
      expect.objectContaining({ key: 'b1:t1:v1', status: 'INSERT_STARTED', postId: 'p1' }),
    ]);
    await expect(readFile(`${path}.tmp`, 'utf8')).rejects.toThrow();
  });

  it('loads a legacy top-level entry array without permitting a duplicate insert', async () => {
    const root = await mkdtemp(join(tmpdir(), 'blogger-ledger-'));
    const path = join(root, 'ledger.json');
    await writeFile(path, JSON.stringify([{ key: 'b1:t1:v1', status: 'COMPLETED' }]), 'utf8');

    await expect(createBloggerLedger(path).canInsert('b1:t1:v1')).resolves.toBe(false);
  });
});
