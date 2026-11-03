import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { AuditLedger, AuditRun } from './types.js';

const PRODUCTION_LEDGER_PATH = '/var/lib/autotax-seo/audit-ledger.json';
const SECRET_KEY_PATTERN = /(?:api[_-]?key|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:bearer|basic)\s+[A-Za-z0-9._~+/-]+=*|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})/i;

type LedgerEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'SEO_AUDIT_LEDGER_PATH'>>;

interface LedgerFile {
  readonly version: 1;
  readonly runs: readonly AuditRun[];
}

export function resolveAuditLedgerPath(
  env: LedgerEnvironment = process.env,
  cwd = process.cwd(),
): string {
  const configured = env.SEO_AUDIT_LEDGER_PATH?.trim();
  if (env.NODE_ENV === 'production') {
    if (!configured) throw new Error('SEO_AUDIT_LEDGER_PATH_REQUIRED');
    if (configured !== PRODUCTION_LEDGER_PATH) throw new Error('SEO_AUDIT_LEDGER_PATH_INVALID');
    return configured;
  }
  if (!configured) return join(cwd, 'state/seo-audit-ledger-local.json');
  return isAbsolute(configured) ? configured : resolve(cwd, configured);
}

function containsSecret(value: unknown, key?: string): boolean {
  if (key && SECRET_KEY_PATTERN.test(key)) return true;
  if (typeof value === 'string') return SECRET_VALUE_PATTERN.test(value);
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([childKey, childValue]) => containsSecret(childValue, childKey));
  }
  return false;
}

export function assertAuditPayloadSafe(
  value: unknown,
  errorCode = 'SEO_AUDIT_LEDGER_SECRET_REJECTED',
): void {
  if (containsSecret(value)) throw new Error(errorCode);
}

function parseLedger(raw: string): AuditRun[] {
  const parsed = JSON.parse(raw) as Partial<LedgerFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.runs)) throw new Error('SEO_AUDIT_LEDGER_INVALID');
  return parsed.runs.map((run) => ({ ...run, summary: { ...run.summary } }));
}

async function readRuns(path: string): Promise<AuditRun[]> {
  try {
    return parseLedger(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAtomic(path: string, runs: readonly AuditRun[]): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ version: 1, runs }, null, 2)}\n`, 'utf8');
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
      if (Date.now() >= deadline) throw new Error('SEO_AUDIT_LEDGER_LOCK_TIMEOUT');
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

export function createAuditLedger(path = resolveAuditLedgerPath()): AuditLedger {
  return {
    entries: () => readRuns(path),
    record: (run) => withExclusiveLock(path, async () => {
      assertAuditPayloadSafe(run);
      const runs = await readRuns(path);
      await writeAtomic(path, [...runs.filter((entry) => entry.id !== run.id), run]);
    }),
  };
}
