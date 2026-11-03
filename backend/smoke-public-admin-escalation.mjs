const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3106/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  if (expected !== undefined) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(response.status), `${method} ${path}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${path}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data, text };
}

// This is the historical/default phone that used to auto-promote public registration.
const registered = await call('/auth/register', {
  method: 'POST',
  body: {
    phone: '0979164124',
    name: 'Public Registration Must Stay Owner',
    password: 'NoEscalation2026!',
    sector: 'retail',
  },
  expected: 200,
});

assert(registered.data?.token, 'Public registration missing token');
assert(registered.data?.user?.role === 'owner', `Public registration escalated role: ${registered.text}`);

await call('/auth/users', { token: registered.data.token, expected: 403 });
await call('/backup', { token: registered.data.token, expected: 403 });
await call('/system/tunnel', { token: registered.data.token, expected: 403 });

console.log('PUBLIC ADMIN ESCALATION SMOKE PASSED: public registration always creates tenant owner, never platform superadmin');
