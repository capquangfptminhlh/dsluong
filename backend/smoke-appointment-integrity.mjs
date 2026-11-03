const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3001/api';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function call(apiPath, { token, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${BASE}${apiPath}`, {
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
    assert(allowed.includes(response.status), `${method} ${apiPath}: expected ${allowed.join('/')}, got ${response.status}: ${text}`);
  } else {
    assert(response.ok, `${method} ${apiPath}: HTTP ${response.status}: ${text}`);
  }
  return { status: response.status, data };
}

async function register(phone, name) {
  const result = await call('/auth/register', {
    method: 'POST',
    body: { phone, name, password: 'AppointmentIntegrity2026!', sector: 'spa' },
    expected: 200,
  });
  assert(result.data?.token, `${name} registration missing token`);
  return result.data;
}

async function createProduct(token, name, sku) {
  const result = await call('/products', {
    token,
    method: 'POST',
    body: { name, sku, price: 150000, cost_price: 50000, stock: 100, category: 'Dịch vụ' },
    expected: 200,
  });
  assert(Number(result.data?.id) > 0, `Product ${name} missing id`);
  return Number(result.data.id);
}

async function createRoom(token, name) {
  const result = await call('/rooms', {
    token,
    method: 'POST',
    body: { name, type: 'Giường', capacity: 1 },
    expected: 201,
  });
  assert(Number(result.data?.id) > 0, `Room ${name} missing id`);
  return Number(result.data.id);
}

async function createStaff(token, name, suffix) {
  const result = await call('/staff', {
    token,
    method: 'POST',
    body: {
      name,
      phone: `09781${suffix}`,
      username: `appt-${suffix}`,
      password: 'Staff2026!',
      role: 'KTV',
      permissions: ['appointments'],
    },
    expected: 200,
  });
  assert(Number(result.data?.id) > 0, `Staff ${name} missing id`);
  return Number(result.data.id);
}

async function createAppointment(token, body, expected = 200) {
  return call('/appointments', { token, method: 'POST', body, expected });
}

const a = await register('0966920001', 'Appointment Integrity Tenant A');
const b = await register('0966920002', 'Appointment Integrity Tenant B');

const serviceA = await createProduct(a.token, 'Massage Tenant A', 'APPT-SVC-A');
const serviceB = await createProduct(b.token, 'Massage Tenant B', 'APPT-SVC-B');
const roomA = await createRoom(a.token, 'Giường A');
const roomB = await createRoom(b.token, 'Giường B');
const staffA = await createStaff(a.token, 'KTV A', '1001');
const staffB = await createStaff(b.token, 'KTV B', '2001');

const base = {
  customer_name: 'Khách lịch hẹn',
  customer_phone: '0907000001',
  service_id: serviceA,
  room_id: roomA,
  staff_id: staffA,
  start_time: '2026-08-20T09:00',
  end_time: '2026-08-20T10:00',
  notes: 'Appointment integrity smoke',
};

await createAppointment(a.token, { ...base, end_time: '2026-08-20T08:59' }, 400);
await createAppointment(a.token, { ...base, service_id: serviceB }, 403);
await createAppointment(a.token, { ...base, room_id: roomB }, 403);
await createAppointment(a.token, { ...base, staff_id: staffB }, 403);

const first = await createAppointment(a.token, { ...base, service_name: 'TAMPERED SERVICE NAME' }, 200);
const firstId = Number(first.data?.id);
assert(firstId > 0, 'Valid appointment missing id');
const list = (await call('/appointments', { token: a.token, expected: 200 })).data;
const saved = list.find((row) => Number(row.id) === firstId);
assert(saved?.service_name === 'Massage Tenant A', `Appointment trusted client service_name: ${JSON.stringify(saved)}`);
assert(Number(saved?.room_id) === roomA && Number(saved?.staff_id) === staffA, 'Appointment references not persisted');

// Same resource overlap must be rejected, but adjacent slot remains valid.
await createAppointment(a.token, {
  ...base,
  customer_name: 'Khách trùng phòng',
  staff_id: '',
  start_time: '2026-08-20T09:30',
  end_time: '2026-08-20T10:30',
}, 409);
await createAppointment(a.token, {
  ...base,
  customer_name: 'Khách trùng KTV',
  room_id: '',
  start_time: '2026-08-20T09:15',
  end_time: '2026-08-20T09:45',
}, 409);
const adjacent = await createAppointment(a.token, {
  ...base,
  customer_name: 'Khách kế tiếp',
  start_time: '2026-08-20T10:00',
  end_time: '2026-08-20T11:00',
}, 200);
assert(Number(adjacent.data?.id) > 0, 'Adjacent non-overlap appointment should be allowed');

// Tenant and lifecycle guards.
await call(`/appointments/${firstId}/status`, { token: b.token, method: 'PUT', body: { status: 'confirmed' }, expected: 404 });
await call(`/appointments/${firstId}/status`, { token: a.token, method: 'PUT', body: { status: 'hacked' }, expected: 400 });
await call(`/appointments/${firstId}/status`, { token: a.token, method: 'PUT', body: { status: 'confirmed' }, expected: 200 });
await call(`/appointments/${firstId}/status`, { token: a.token, method: 'PUT', body: { status: 'pending' }, expected: 409 });
await call(`/appointments/${firstId}`, { token: a.token, method: 'DELETE', expected: 409 });
await call(`/appointments/${firstId}/status`, { token: a.token, method: 'PUT', body: { status: 'completed' }, expected: 200 });
await call(`/appointments/${firstId}/status`, { token: a.token, method: 'PUT', body: { status: 'cancelled' }, expected: 409 });

// Pending-only hard delete remains available and tenant-scoped.
const deleteCandidate = await createAppointment(a.token, {
  ...base,
  customer_name: 'Khách xóa pending',
  room_id: '',
  staff_id: '',
  start_time: '2026-08-21T12:00',
  end_time: '2026-08-21T13:00',
}, 200);
const deleteId = Number(deleteCandidate.data.id);
await call(`/appointments/${deleteId}`, { token: b.token, method: 'DELETE', expected: 404 });
await call(`/appointments/${deleteId}`, { token: a.token, method: 'DELETE', expected: 200 });
await call(`/appointments/${deleteId}`, { token: a.token, method: 'DELETE', expected: 404 });

// Concurrent double-booking against a fresh room/staff must serialize to one winner.
const raceRoom = await createRoom(a.token, 'Giường Race');
const raceStaff = await createStaff(a.token, 'KTV Race', '1002');
const raceBody = {
  ...base,
  room_id: raceRoom,
  staff_id: raceStaff,
  start_time: '2026-08-22T14:00',
  end_time: '2026-08-22T15:00',
};
const race = await Promise.all([
  createAppointment(a.token, { ...raceBody, customer_name: 'Race A' }, [200, 409]),
  createAppointment(a.token, { ...raceBody, customer_name: 'Race B' }, [200, 409]),
]);
const successes = race.filter((result) => result.status === 200);
const conflicts = race.filter((result) => result.status === 409);
assert(successes.length === 1 && conflicts.length === 1,
  `Concurrent double-book must have exactly one winner: ${JSON.stringify(race.map((r) => r.status))}`);

console.log('APPOINTMENT INTEGRITY SMOKE PASSED: authoritative service + tenant references + valid time + overlap/race guard + lifecycle transitions + pending-only delete');
