import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type {
  BloggerLedgerEntry,
  BloggerLedgerIdentity,
  BloggerLedgerStore,
  BloggerLedgerStatus,
  BloggerWorkerReason,
} from './types.js';

const PRODUCTION_LEDGER_PATH = '/var/lib/autotax-seo/blogger-ledger.json';

type LedgerEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'BLOGGER_LEDGER_PATH'>>;

interface LedgerFile {
  version: 1;
  entries: BloggerLedgerEntry[];
}

export function resolveBloggerLedgerPath(
  env: LedgerEnvironment = process.env,
  cwd = process.cwd(),
): string {
  const configured = env.BLOGGER_LEDGER_PATH?.trim();
  if (env.NODE_ENV === 'production') {
    if (!configured) throw new Error('BLOGGER_LEDGER_PATH_REQUIRED');
    if (configured !== PRODUCTION_LEDGER_PATH) throw new Error('BLOGGER_LEDGER_PATH_INVALID');
    return configured;
  }
  if (!configured) return join(cwd, 'state/blogger-ledger-local.json');
  return isAbsolute(configured) ? configured : resolve(cwd, configured);
}

function parseLedger(raw: string): BloggerLedgerEntry[] {
  const parsed: unknown = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as LedgerFile).entries)
      ? (parsed as LedgerFile).entries
      : undefined;
  if (!entries) throw new Error('BLOGGER_LEDGER_INVALID');
  return entries as BloggerLedgerEntry[];
}

async function readEntries(path: string): Promise<BloggerLedgerEntry[]> {
  try {
    return parseLedger(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAtomic(path: string, entries: BloggerLedgerEntry[]): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    const directoryHandle = await open(directory, 'r');
    try {
      await directoryHandle.sync().catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EPERM' && error.code !== 'EINVAL') throw error;
      });
    } finally {
      await directoryHandle.close();
    }
  } finally {
    await handle?.close();
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

async function withExclusiveLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + 5_000;
  let lockHandle;
  while (!lockHandle) {
    try {
      lockHandle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('BLOGGER_LEDGER_LOCK_TIMEOUT');
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
  }
  try {
    await lockHandle.writeFile(`${process.pid}\n`, 'utf8');
    await lockHandle.sync();
    return await operation();
  } finally {
    await lockHandle.close();
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export function createBloggerLedger(path = resolveBloggerLedgerPath()): BloggerLedgerStore {
  async function replaceUnlocked(
    identity: BloggerLedgerIdentity,
    status: BloggerLedgerStatus,
    reason?: BloggerWorkerReason,
    postId?: string,
  ): Promise<void> {
    const entries = await readEntries(path);
    const existing = entries.find((entry) => entry.key === identity.key);
    const now = new Date().toISOString();
    const next: BloggerLedgerEntry = {
      ...identity,
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(postId ? { postId } : existing?.postId ? { postId: existing.postId } : {}),
      ...(reason ? { reason } : {}),
    };
    await writeAtomic(path, [...entries.filter((entry) => entry.key !== identity.key), next]);
  }

  function replace(
    identity: BloggerLedgerIdentity,
    status: BloggerLedgerStatus,
    reason?: BloggerWorkerReason,
    postId?: string,
  ): Promise<void> {
    return withExclusiveLock(path, () => replaceUnlocked(identity, status, reason, postId));
  }

  async function update(key: string, mutate: (entry: BloggerLedgerEntry) => BloggerLedgerEntry): Promise<void> {
    await withExclusiveLock(path, async () => {
      const entries = await readEntries(path);
      const index = entries.findIndex((entry) => entry.key === key);
      if (index < 0) throw new Error('BLOGGER_LEDGER_ENTRY_NOT_FOUND');
      entries[index] = mutate(entries[index]);
      await writeAtomic(path, entries);
    });
  }

  return {
    async get(key) {
      return (await readEntries(path)).find((entry) => entry.key === key);
    },
    entries: () => readEntries(path),
    async canInsert(key) {
      const entry = (await readEntries(path)).find((item) => item.key === key);
      return !entry || (!entry.postId && entry.status !== 'INSERT_STARTED' && entry.status !== 'COMPLETED');
    },
    reserveInsert: (entry) => withExclusiveLock(path, async () => {
      const entries = await readEntries(path);
      const existing = entries.find((item) => item.key === entry.key);
      if (existing && (existing.postId || existing.status === 'INSERT_STARTED' || existing.status === 'COMPLETED')) {
        return false;
      }
      await replaceUnlocked(entry, 'INSERT_STARTED');
      return true;
    }),
    recordInsertStarted: (entry) => replace(entry, 'INSERT_STARTED'),
    recordPostId: (key, postId) => update(key, (entry) => ({
      ...entry, postId, updatedAt: new Date().toISOString(),
    })),
    recordCompleted: (key, postId) => update(key, (entry) => ({
      ...entry, status: 'COMPLETED', postId, reason: undefined, updatedAt: new Date().toISOString(),
    })),
    recordOutcome: (entry) => replace(entry, entry.status, entry.reason, entry.postId),
  };
}
