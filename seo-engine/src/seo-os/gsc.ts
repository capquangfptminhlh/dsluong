export interface GscRow {
  readonly keys?: readonly string[];
  readonly clicks?: number;
  readonly impressions?: number;
  readonly ctr?: number;
  readonly position?: number;
}

export interface GscQuery {
  readonly property: string;
}

export interface GscConfig {
  readonly siteUrl: string;
  readonly credentials: Readonly<{ client_email: string; private_key: string }>;
  readonly query: GscQuery;
}

export type GscConfigResult =
  | { readonly ok: true; readonly config: GscConfig }
  | { readonly ok: false; readonly reason: 'GSC_CONFIG_MISSING' | 'GSC_SITE_URL_INVALID' | 'GSC_CREDENTIALS_INVALID' };

export interface GscPerformanceClient {
  query(request: GscQuery): Promise<readonly GscRow[]>;
}

export interface GscSnapshot {
  readonly source: 'GSC';
  readonly property: string;
  readonly queriedAt: string;
  readonly rows: readonly GscRow[];
}

function readCredentials(raw: string | undefined): Readonly<{ client_email: string; private_key: string }> | null {
  if (!raw || raw.trim().length === 0) return null;

  try {
    const text = raw.trim().startsWith('{') ? raw.trim() : Buffer.from(raw.trim(), 'base64').toString('utf8');
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.client_email !== 'string' || parsed.client_email.trim().length === 0
      || typeof parsed.private_key !== 'string' || parsed.private_key.trim().length === 0) return null;

    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

function isGscProperty(siteUrl: string | undefined): siteUrl is string {
  if (!siteUrl || siteUrl.trim().length === 0) return false;
  const value = siteUrl.trim();
  if (/^sc-domain:[^/\s]+$/i.test(value)) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function readGscConfig(env: NodeJS.ProcessEnv = process.env): GscConfigResult {
  if (!env.GSC_SITE_URL && !env.GSC_SERVICE_ACCOUNT_JSON) {
    return { ok: false, reason: 'GSC_CONFIG_MISSING' };
  }
  if (!isGscProperty(env.GSC_SITE_URL)) return { ok: false, reason: 'GSC_SITE_URL_INVALID' };

  const credentials = readCredentials(env.GSC_SERVICE_ACCOUNT_JSON);
  if (!credentials) return { ok: false, reason: 'GSC_CREDENTIALS_INVALID' };

  const siteUrl = env.GSC_SITE_URL.trim();
  return { ok: true, config: { siteUrl, credentials, query: { property: siteUrl } } };
}

export async function snapshotGscPerformance(
  config: GscConfig,
  client: GscPerformanceClient,
): Promise<GscSnapshot> {
  const rows = await client.query(config.query);
  return {
    source: 'GSC',
    property: config.siteUrl,
    queriedAt: new Date().toISOString(),
    rows: rows.map((row) => ({ ...row, keys: row.keys ? [...row.keys] : undefined })),
  };
}
