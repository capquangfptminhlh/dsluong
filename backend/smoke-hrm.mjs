const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';

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
  return { status: response.status, data };
}

async function registerOwner(phone, name) {
  const owner = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'HrmSmoke2026!', sector: 'retail' },
    expected: 200,
  });
  assert(owner.data?.token, `HRM smoke owner ${phone} missing token`);
  return owner.data.token;
}

async function createStaff(ownerToken, { name, username, permissions = [] }) {
  const created = await call('/staff', {
    token: ownerToken,
    method: 'POST',
    body: { name, username, password: 'HrmSmoke2026!', role: 'Nhân viên', permissions },
    expected: 200,
  });
  assert(created.data?.id, `HRM smoke staff ${username} not created`);
  return created.data.id;
}

async function loginStaff(username) {
  const login = await call('/auth/staff-login', {
    method: 'POST',
    body: { username, password: 'HrmSmoke2026!' },
    expected: 200,
  });
  assert(login.data?.token, `HRM smoke staff ${username} missing token`);
  return login.data.token;
}

const ownerA = await registerOwner('0966449911', 'HRM Tenant A');
const subjectA = await createStaff(ownerA, { name: 'Subject A', username: 'hrm_subject_a' });
await createStaff(ownerA, { name: 'HRM Manager A', username: 'hrm_manager_a', permissions: ['staff'] });
await createStaff(ownerA, { name: 'POS Only A', username: 'hrm_pos_only_a', permissions: ['pos'] });
const managerA = await loginStaff('hrm_manager_a');
const posOnlyA = await loginStaff('hrm_pos_only_a');

await call('/hrm', { token: posOnlyA, expected: 403 });
await call('/hrm/checkin', {
  token: posOnlyA,
  method: 'POST',
  body: { staff_id: subjectA },
  expected: 403,
});

const concurrent = await Promise.all([
  call('/hrm/checkin', { token: managerA, method: 'POST', body: { staff_id: subjectA }, expected: [200, 409] }),
  call('/hrm/checkin', { token: managerA, method: 'POST', body: { staff_id: subjectA }, expected: [200, 409] }),
]);
const statuses = concurrent.map((item) => item.status).sort((a, b) => a - b);
assert(statuses[0] === 200 && statuses[1] === 409, `HRM concurrent check-in must yield one 200 + one 409, got ${statuses.join(',')}`);
const activeCreated = concurrent.find((item) => item.status === 200);
const shiftA = activeCreated?.data?.shift_id;
assert(shiftA, 'HRM concurrent check-in missing active shift id');

const listActive = await call('/hrm', { token: managerA, expected: 200 });
const activeRow = listActive.data?.find((row) => row.id === shiftA);
assert(activeRow?.status === 'ACTIVE' && !activeRow.check_out, 'HRM active shift is not persisted as ACTIVE');

const ownerB = await registerOwner('0966449922', 'HRM Tenant B');
const subjectB = await createStaff(ownerB, { name: 'Subject B', username: 'hrm_subject_b' });
const checkedB = await call('/hrm/checkin', {
  token: ownerB,
  method: 'POST',
  body: { staff_id: subjectB },
  expected: 200,
});
const shiftB = checkedB.data?.shift_id;
assert(shiftB, 'HRM tenant B check-in missing shift id');

await call('/hrm/checkout', {
  token: ownerA,
  method: 'POST',
  body: { shift_id: shiftB },
  expected: 404,
});

await call('/hrm/checkout', {
  token: managerA,
  method: 'POST',
  body: { shift_id: shiftA },
  expected: 200,
});
await call('/hrm/checkout', {
  token: managerA,
  method: 'POST',
  body: { shift_id: shiftA },
  expected: 409,
});

const listClosed = await call('/hrm', { token: managerA, expected: 200 });
const closedRow = listClosed.data?.find((row) => row.id === shiftA);
assert(closedRow?.status === 'CLOSED' && closedRow.check_out, 'HRM checkout did not persist CLOSED + check_out');

const listB = await call('/hrm', { token: ownerB, expected: 200 });
const stillActiveB = listB.data?.find((row) => row.id === shiftB);
assert(stillActiveB?.status === 'ACTIVE' && !stillActiveB.check_out, 'Cross-tenant checkout modified tenant B shift');
await call('/hrm/checkout', { token: ownerB, method: 'POST', body: { shift_id: shiftB }, expected: 200 });

await import('./smoke-shift.mjs');

console.log('HRM + CASHIER SHIFT SMOKE PASSED');
