const express = require('express');
const router = express.Router();
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireSuperadmin } = require('../middleware/auth');

router.use(requireAuth);

let tunnelProcess = null;
let currentUrl = null;
let lastTunnelError = null;
let tunnelStartedAt = null;

// Presence is keyed by authenticated tenant + actor identity. Never trust a phone/name
// supplied by the client and never expose one tenant's presence to another tenant.
const activeUsers = new Map();
const ONLINE_TIMEOUT = 15000;

function tunnelTarget() {
  return process.env.CLOUDFLARE_TUNNEL_TARGET || 'http://127.0.0.1:3001';
}

function cloudflaredCandidates() {
  const candidates = [];
  if (process.env.CLOUDFLARED_BIN) candidates.push(process.env.CLOUDFLARED_BIN);
  candidates.push(path.join(__dirname, '../../cloudflared'));
  candidates.push(path.join(__dirname, '../../cloudflared.exe'));
  candidates.push(process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  return [...new Set(candidates.filter(Boolean))];
}

function isExplicitPath(candidate) {
  return path.isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\');
}

function probeBinary(candidate) {
  return new Promise((resolve) => {
    if (isExplicitPath(candidate) && !fs.existsSync(candidate)) {
      resolve(null);
      return;
    }
    execFile(candidate, ['--version'], { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        resolve(null);
        return;
      }
      resolve({ command: candidate, version: String(stdout || stderr || '').trim() || null });
    });
  });
}

async function resolveCloudflared() {
  for (const candidate of cloudflaredCandidates()) {
    const result = await probeBinary(candidate);
    if (result) return result;
  }
  return null;
}

router.post('/ping', (req, res) => {
  const user = req.user || {};
  const tenantId = String(req.tenantId || user.tenantId || '');
  const actorType = String(user.actorType || 'unknown');
  const actorId = Number(user.actorId) || 0;
  if (!tenantId || !actorId) return res.status(401).json({ error: 'Phiên đăng nhập thiếu danh tính hợp lệ' });

  const key = `${tenantId}:${actorType}:${actorId}`;
  activeUsers.set(key, {
    tenantId,
    actorType,
    actorId,
    lastSeen: Date.now(),
    name: String(user.actorName || (actorType === 'owner' ? 'Chủ cửa hàng' : 'Nhân viên')),
  });
  res.json({ ok: true });
});

router.get('/online-users', (req, res) => {
  const now = Date.now();
  const tenantId = String(req.tenantId || '');
  const online = [];

  for (const [key, data] of activeUsers.entries()) {
    if (now - data.lastSeen >= ONLINE_TIMEOUT) {
      activeUsers.delete(key);
      continue;
    }
    if (data.tenantId !== tenantId) continue;
    online.push({
      phone: data.tenantId,
      name: data.name,
      actorType: data.actorType,
      actorId: data.actorId,
    });
  }

  res.json(online);
});

// Tunnel lifecycle controls one server-wide process, therefore only the platform
// superadmin may observe or mutate it. Tenant owners cannot affect other shops.
router.get('/tunnel', requireSuperadmin, async (req, res) => {
  const binary = await resolveCloudflared();
  res.json({
    isRunning: !!tunnelProcess,
    url: currentUrl,
    startedAt: tunnelStartedAt,
    target: tunnelTarget(),
    available: !!binary,
    version: binary?.version || null,
    lastError: lastTunnelError,
  });
});

router.post('/tunnel/start', requireSuperadmin, async (req, res) => {
  if (tunnelProcess) {
    return res.status(409).json({ error: 'Cloudflare Tunnel đang chạy.' });
  }

  const binary = await resolveCloudflared();
  if (!binary) {
    return res.status(503).json({
      error: 'Không tìm thấy cloudflared trên máy chủ. Hãy cài cloudflared hoặc cấu hình CLOUDFLARED_BIN.',
    });
  }

  currentUrl = null;
  lastTunnelError = null;
  tunnelStartedAt = new Date().toISOString();

  try {
    const child = spawn(binary.command, ['tunnel', '--url', tunnelTarget()], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    tunnelProcess = child;

    const handleOutput = (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !currentUrl) currentUrl = match[0];
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('close', (code) => {
      if (code && code !== 0 && !lastTunnelError) lastTunnelError = `cloudflared dừng với mã ${code}`;
      if (tunnelProcess === child) tunnelProcess = null;
      currentUrl = null;
      tunnelStartedAt = null;
    });

    child.on('error', (err) => {
      lastTunnelError = err.message;
      if (tunnelProcess === child) tunnelProcess = null;
      currentUrl = null;
      tunnelStartedAt = null;
    });

    res.status(202).json({
      message: 'Cloudflare Tunnel đang khởi động.',
      target: tunnelTarget(),
      version: binary.version,
    });
  } catch (err) {
    tunnelProcess = null;
    currentUrl = null;
    tunnelStartedAt = null;
    lastTunnelError = err.message;
    res.status(500).json({ error: err.message });
  }
});

router.post('/tunnel/stop', requireSuperadmin, (req, res) => {
  if (tunnelProcess) {
    tunnelProcess.kill('SIGTERM');
    tunnelProcess = null;
  }
  currentUrl = null;
  tunnelStartedAt = null;
  res.json({ message: 'Cloudflare Tunnel đã dừng.' });
});

module.exports = router;
