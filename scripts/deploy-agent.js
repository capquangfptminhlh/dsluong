'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.AUTOTAX_DEPLOY_PORT || 9443);
const CERT_PATH = process.env.AUTOTAX_DEPLOY_CERT || '/opt/autotax-deploy-agent/cert.pem';
const KEY_PATH = process.env.AUTOTAX_DEPLOY_KEY || '/opt/autotax-deploy-agent/key.pem';
const LIVE_DIR = process.env.AUTOTAX_LIVE_DIR || '/var/www/autotax';
const HEALTH_URL = process.env.AUTOTAX_HEALTH_URL || 'http://127.0.0.1:3001/api/health';
const EXPECTED_ISS = 'https://token.actions.githubusercontent.com';
const EXPECTED_AUD = 'autotax-vps-deploy';
const EXPECTED_REPOSITORY = 'capquangfptminhlh/autotax';
const EXPECTED_REPOSITORY_ID = '1303772175';
const EXPECTED_REF = 'refs/heads/main';
const EXPECTED_WORKFLOW_REF = 'capquangfptminhlh/autotax/.github/workflows/deploy-vps.yml@refs/heads/main';
const ARTICLE_CANONICAL = 'https://autotaxpos.com/blog/muc-ton-kho-toi-thieu-diem-dat-hang-lai/';
const ARTICLE_PATH = path.join(LIVE_DIR, 'frontend/dist/blog/muc-ton-kho-toi-thieu-diem-dat-hang-lai/index.html');
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
const LOCK_PATH = '/tmp/autotax-production-deploy.lock';

let jwksCache = { expiresAt: 0, keys: [] };

function json(res, statusCode, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function b64urlToBuffer(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function audienceMatches(aud) {
  return Array.isArray(aud) ? aud.includes(EXPECTED_AUD) : aud === EXPECTED_AUD;
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache.keys.length && now < jwksCache.expiresAt) return jwksCache.keys;

  const configResponse = await fetch(`${EXPECTED_ISS}/.well-known/openid-configuration`, {
    headers: { 'User-Agent': 'autotax-deploy-agent/1.1' },
    signal: AbortSignal.timeout(8000),
  });
  if (!configResponse.ok) throw new Error(`OIDC discovery failed: ${configResponse.status}`);
  const config = await configResponse.json();
  if (!config.jwks_uri || !config.jwks_uri.startsWith(EXPECTED_ISS)) {
    throw new Error('Unexpected GitHub OIDC JWKS URI');
  }

  const jwksResponse = await fetch(config.jwks_uri, {
    headers: { 'User-Agent': 'autotax-deploy-agent/1.1' },
    signal: AbortSignal.timeout(8000),
  });
  if (!jwksResponse.ok) throw new Error(`JWKS fetch failed: ${jwksResponse.status}`);
  const jwks = await jwksResponse.json();
  if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) throw new Error('Empty GitHub JWKS');

  jwksCache = { keys: jwks.keys, expiresAt: now + 5 * 60 * 1000 };
  return jwksCache.keys;
}

async function verifyGithubOidc(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed OIDC token');

  const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  const claims = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  const signature = b64urlToBuffer(parts[2]);

  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported OIDC signing algorithm');
  const keys = await getJwks();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('GitHub OIDC signing key not found');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!crypto.verify('RSA-SHA256', signingInput, publicKey, signature)) {
    throw new Error('Invalid GitHub OIDC signature');
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== EXPECTED_ISS) throw new Error('Unexpected OIDC issuer');
  if (!audienceMatches(claims.aud)) throw new Error('Unexpected OIDC audience');
  if (!claims.exp || claims.exp < now) throw new Error('Expired OIDC token');
  if (claims.nbf && claims.nbf > now + 30) throw new Error('OIDC token not active');
  if (claims.repository !== EXPECTED_REPOSITORY) throw new Error('Unexpected repository claim');
  if (String(claims.repository_id || '') !== EXPECTED_REPOSITORY_ID) throw new Error('Unexpected repository ID');
  if (claims.ref !== EXPECTED_REF) throw new Error('Only main branch may deploy');
  if (claims.workflow_ref !== EXPECTED_WORKFLOW_REF) throw new Error('Unexpected workflow identity');
  if (!['push', 'workflow_dispatch'].includes(claims.event_name)) throw new Error('Unexpected workflow event');

  return claims;
}

async function authenticateReleaseRequest(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) throw new Error('Missing GitHub OIDC bearer token');
  const claims = await verifyGithubOidc(auth.slice(7));
  const sha = String(req.headers['x-autotax-sha'] || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Invalid release SHA');
  if (claims.sha !== sha) throw new Error('Release SHA does not match OIDC token');
  return { claims, sha };
}

async function verifyLiveProduction(expectedSha) {
  const deployedShaPath = path.join(LIVE_DIR, '.deployed-sha');
  const releasePath = path.join(LIVE_DIR, 'frontend/dist/release.json');
  const indexPath = path.join(LIVE_DIR, 'frontend/dist/index.html');
  const assetsPath = path.join(LIVE_DIR, 'frontend/dist/assets');

  const deployedSha = fs.readFileSync(deployedShaPath, 'utf8').trim();
  if (deployedSha !== expectedSha) throw new Error(`Live deployed SHA mismatch: ${deployedSha}`);

  const marker = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  if (marker.sha !== expectedSha || marker.status !== 'healthy') {
    throw new Error(`Live release marker mismatch: ${JSON.stringify(marker)}`);
  }

  const article = fs.readFileSync(ARTICLE_PATH, 'utf8');
  if (!article.includes(`<link rel="canonical" href="${ARTICLE_CANONICAL}"`)) {
    throw new Error('Live article canonical mismatch');
  }
  const h1Count = (article.match(/<h1(?:\s|>)/gi) || []).length;
  if (h1Count !== 1) throw new Error(`Live article H1 count mismatch: ${h1Count}`);

  fs.accessSync(indexPath, fs.constants.R_OK);
  const posBundle = fs.readdirSync(assetsPath).find((name) => /^POS-.*\.js$/.test(name));
  if (!posBundle) throw new Error('Live POS production bundle missing');

  const healthResponse = await fetch(HEALTH_URL, {
    headers: { 'User-Agent': 'autotax-deploy-agent/verify' },
    signal: AbortSignal.timeout(5000),
  });
  if (!healthResponse.ok) throw new Error(`Live backend health HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  if (health.status !== 'ok') throw new Error(`Live backend unhealthy: ${JSON.stringify(health)}`);

  return {
    ok: true,
    sha: expectedSha,
    status: 'healthy',
    releaseMarker: true,
    article: true,
    posBundle,
    backend: 'ok',
  };
}

function acquireLock() {
  try {
    const fd = fs.openSync(LOCK_PATH, 'wx', 0o600);
    fs.writeFileSync(fd, `${process.pid}\n`);
    return fd;
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
}

function releaseLock(fd) {
  try { if (fd !== null) fs.closeSync(fd); } catch (_) {}
  try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
}

async function receiveArchive(req, destination) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > MAX_ARCHIVE_BYTES) throw new Error('Release archive is too large');

  await new Promise((resolve, reject) => {
    let bytes = 0;
    const out = fs.createWriteStream(destination, { mode: 0o600, flags: 'wx' });
    const fail = (error) => {
      req.destroy();
      out.destroy();
      reject(error);
    };

    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) fail(new Error('Release archive exceeded size limit'));
    });
    req.on('error', fail);
    out.on('error', reject);
    out.on('finish', resolve);
    req.pipe(out);
  });
}

function runDeployment(sha, archivePath) {
  return new Promise((resolve, reject) => {
    const stageDir = `/tmp/autotax-agent-stage-${sha}`;
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true, mode: 0o700 });

    const extract = spawnSync('tar', ['-xzf', archivePath, '-C', stageDir, 'scripts/deploy-vps.sh'], {
      encoding: 'utf8',
    });
    if (extract.status !== 0) {
      fs.rmSync(stageDir, { recursive: true, force: true });
      return reject(new Error(`Cannot extract deploy script: ${extract.stderr || extract.stdout}`));
    }

    const deployScript = path.join(stageDir, 'scripts', 'deploy-vps.sh');
    fs.chmodSync(deployScript, 0o700);

    const child = spawn('bash', [deployScript, sha, archivePath], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tail = '';
    const append = (chunk, stream) => {
      const text = chunk.toString();
      stream.write(text);
      tail = (tail + text).slice(-20000);
    };
    child.stdout.on('data', (chunk) => append(chunk, process.stdout));
    child.stderr.on('data', (chunk) => append(chunk, process.stderr));
    child.on('error', reject);
    child.on('close', (code) => {
      fs.rmSync(stageDir, { recursive: true, force: true });
      if (code === 0) resolve(tail);
      else reject(new Error(`Deploy script exited with ${code}\n${tail}`));
    });
  });
}

const server = https.createServer({
  cert: fs.readFileSync(CERT_PATH),
  key: fs.readFileSync(KEY_PATH),
  minVersion: 'TLSv1.2',
}, async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { status: 'ok', service: 'autotax-deploy-agent' });
  }

  if (req.method === 'POST' && req.url === '/verify') {
    try {
      const { sha } = await authenticateReleaseRequest(req);
      const state = await verifyLiveProduction(sha);
      return json(res, 200, state);
    } catch (error) {
      console.error('[DEPLOY VERIFY]', error && error.stack ? error.stack : error);
      return json(res, 500, { ok: false, error: String(error.message || error) });
    }
  }

  if (req.method !== 'POST' || req.url !== '/deploy') {
    return json(res, 404, { error: 'not_found' });
  }

  let lockFd = null;
  let archivePath = null;
  try {
    const { sha } = await authenticateReleaseRequest(req);

    lockFd = acquireLock();
    if (lockFd === null) return json(res, 409, { error: 'deployment_in_progress' });

    archivePath = `/tmp/autotax-oidc-${sha}.tar.gz`;
    fs.rmSync(archivePath, { force: true });
    await receiveArchive(req, archivePath);
    await runDeployment(sha, archivePath);

    return json(res, 200, { ok: true, sha });
  } catch (error) {
    console.error('[DEPLOY AGENT]', error && error.stack ? error.stack : error);
    if (!res.headersSent) return json(res, 500, { ok: false, error: String(error.message || error) });
    res.end();
  } finally {
    if (archivePath) {
      try { fs.rmSync(archivePath, { force: true }); } catch (_) {}
    }
    if (lockFd !== null) releaseLock(lockFd);
  }
});

server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 30 * 1000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[AUTOTAX DEPLOY AGENT] listening on https://0.0.0.0:${PORT}`);
});
