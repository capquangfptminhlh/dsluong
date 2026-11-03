import Database from 'better-sqlite3';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3101/api';
const DB_PATH = process.env.SMOKE_DB_PATH || './autotax.db';
const assert = (ok, message) => { if (!ok) throw new Error(message); };

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, data, text };
}

async function call(path, { token, method = 'GET', body, expected } = {}) {
  const result = await request(path, { token, method, body });
  if (expected !== undefined) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(result.status), `${method} ${path}: expected ${allowed.join('/')}, got ${result.status} ${result.text}`);
  } else {
    assert(result.status >= 200 && result.status < 300, `${method} ${path}: ${result.status} ${result.text}`);
  }
  return result.data;
}

const seed = String(Date.now()).slice(-7);
const phoneFor = (digit) => `09${seed}${digit}`.slice(0, 10);
const register = (digit) => call('/auth/register', {
  method: 'POST',
  body: { phone: phoneFor(digit), name: `Hotel ${digit}`, password: 'Hotel2026!', sector: 'hotel' },
  expected: 200,
});

const a = await register('3');
const b = await register('4');

const room = await call('/rooms', {
  token: a.token,
  method: 'POST',
  body: { name: 'P101', type: 'Standard', capacity: 2, price: 450000 },
  expected: 201,
});
assert(room.id && Number(room.price) === 450000, 'room rate not persisted on create');

await call(`/rooms/${room.id}`, {
  token: a.token,
  method: 'PUT',
  body: { name: 'P101', type: 'Standard', capacity: 2, price: 500000 },
  expected: 200,
});
const roomsA = await call('/rooms', { token: a.token });
assert(roomsA.some((item) => Number(item.id) === Number(room.id) && Number(item.price) === 500000), 'room update not persisted');
const roomsB = await call('/rooms', { token: b.token });
assert(!roomsB.some((item) => Number(item.id) === Number(room.id)), 'room leaked across tenants');

// Tenant isolation applies to the write boundary too, not only room reads/checkout.
await call(`/rooms/${room.id}/check-in`, {
  token: b.token,
  method: 'POST',
  body: { guest_name: 'Khách tenant khác', nights: 1, rate: 1 },
  expected: 404,
});

// Force the room-status write to abort after booking INSERT. The check-in transaction
// must roll the booking back instead of leaving an active booking on an available room.
const rollbackRoom = await call('/rooms', {
  token: a.token,
  method: 'POST',
  body: { name: 'P-ROLLBACK', type: 'Standard', capacity: 1, price: 300000 },
  expected: 201,
});
const external = new Database(DB_PATH);
external.pragma('busy_timeout = 5000');
external.pragma('journal_mode = WAL');
const triggerName = `smoke_fail_room_occupy_${Number(rollbackRoom.id)}`;
try {
  external.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
  external.exec(`
    CREATE TRIGGER ${triggerName}
    BEFORE UPDATE OF status ON rooms
    WHEN NEW.id = ${Number(rollbackRoom.id)} AND NEW.status = 'occupied'
    BEGIN
      SELECT RAISE(ABORT, 'SMOKE_FORCED_ROOM_STATUS_FAILURE');
    END;
  `);

  await call(`/rooms/${rollbackRoom.id}/check-in`, {
    token: a.token,
    method: 'POST',
    body: { guest_name: 'Khách rollback', nights: 1, rate: 1 },
    expected: 500,
  });

  const orphan = external.prepare(
    `SELECT COUNT(*) AS count FROM room_bookings
     WHERE room_id = ? AND status = 'checked_in'`
  ).get(Number(rollbackRoom.id));
  assert(Number(orphan?.count) === 0, 'failed check-in left an active booking after room-status failure');
  const rollbackState = external.prepare('SELECT status FROM rooms WHERE id = ?').get(Number(rollbackRoom.id));
  assert(rollbackState?.status === 'available', `failed check-in changed room status: ${JSON.stringify(rollbackState)}`);
} finally {
  try { external.exec(`DROP TRIGGER IF EXISTS ${triggerName}`); } catch {}
  external.close();
}
await call(`/rooms/${rollbackRoom.id}`, { token: a.token, method: 'DELETE', expected: 200 });

// Two simultaneous requests must serialize at the writer boundary. Exactly one booking
// becomes active; the loser observes the committed active booking and returns 409.
const raceRoom = await call('/rooms', {
  token: a.token,
  method: 'POST',
  body: { name: 'P-RACE', type: 'Standard', capacity: 2, price: 250000 },
  expected: 201,
});
const raceResults = await Promise.all([
  request(`/rooms/${raceRoom.id}/check-in`, {
    token: a.token,
    method: 'POST',
    body: { guest_name: 'Race A', nights: 1, rate: 1 },
  }),
  request(`/rooms/${raceRoom.id}/check-in`, {
    token: a.token,
    method: 'POST',
    body: { guest_name: 'Race B', nights: 1, rate: 1 },
  }),
]);
const raceStatuses = raceResults.map((result) => result.status).sort((x, y) => x - y);
assert(raceStatuses.length === 2 && raceStatuses[0] === 201 && raceStatuses[1] === 409,
  `concurrent check-in must resolve 201/409, got ${JSON.stringify(raceResults)}`);
const raceActive = await call('/rooms/bookings/active', { token: a.token });
const activeForRaceRoom = raceActive.filter((item) => Number(item.room_id) === Number(raceRoom.id));
assert(activeForRaceRoom.length === 1, `concurrent check-in created ${activeForRaceRoom.length} active bookings`);
assert(Number(activeForRaceRoom[0].rate) === 250000, `race booking accepted client rate override: ${JSON.stringify(activeForRaceRoom[0])}`);
await call(`/rooms/${raceRoom.id}/check-out`, {
  token: a.token,
  method: 'POST',
  body: { payment_method: 'cash' },
  expected: 200,
});
await call(`/rooms/${raceRoom.id}`, { token: a.token, method: 'DELETE', expected: 200 });

// Revenue integrity: even a tampered client payload with rate=1 must use the configured
// room price (500000) and persist that server-authoritative snapshot on the booking.
const booking = await call(`/rooms/${room.id}/check-in`, {
  token: a.token,
  method: 'POST',
  body: { guest_name: 'Khách A', guest_phone: '0900000000', nights: 2, rate: 1 },
  expected: 201,
});
assert(booking.id && booking.status === 'checked_in', 'check-in not persisted');
assert(Number(booking.rate) === 500000, `check-in accepted client rate override: ${JSON.stringify(booking)}`);
await call(`/rooms/${room.id}/check-in`, {
  token: a.token,
  method: 'POST',
  body: { guest_name: 'Khách trùng', nights: 1, rate: 1 },
  expected: 409,
});

const active = await call('/rooms/bookings/active', { token: a.token });
assert(active.some((item) => Number(item.id) === Number(booking.id) && item.guest_name === 'Khách A' && Number(item.rate) === 500000), 'active booking missing authoritative rate after reload-style GET');
const activeB = await call('/rooms/bookings/active', { token: b.token });
assert(!activeB.some((item) => Number(item.id) === Number(booking.id)), 'booking leaked across tenants');
await call(`/rooms/${room.id}`, { token: a.token, method: 'DELETE', expected: 409 });
await call(`/rooms/${room.id}/check-out`, { token: b.token, method: 'POST', body: { payment_method: 'cash' }, expected: 404 });

const checkout = await call(`/rooms/${room.id}/check-out`, {
  token: a.token,
  method: 'POST',
  body: { payment_method: 'cash' },
  expected: 200,
});
assert(checkout.success && checkout.order_code && Number(checkout.total_amount) === 1000000, `checkout mismatch ${JSON.stringify(checkout)}`);
const activeAfter = await call('/rooms/bookings/active', { token: a.token });
assert(!activeAfter.some((item) => Number(item.id) === Number(booking.id)), 'booking still active after checkout');
const orders = await call('/pos/orders', { token: a.token });
assert(orders.some((item) => item.order_code === checkout.order_code && Number(item.total_amount) === 1000000), 'hotel POS revenue order missing');

await call(`/rooms/${room.id}`, { token: a.token, method: 'DELETE', expected: 200 });
console.log('[SMOKE] HOTEL PMS PASS: atomic check-in + server-authoritative rate + rollback + concurrency + tenant isolation');
