import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { adminSchemas } from '../src/validators/admin.validators.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Admin tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex').toUpperCase();
const password = `Test!${tag}Pass9`, users = {}, cookies = {};
const resources = ['stations', 'routes', 'trains', 'seats', 'schedules'];
const ids = Object.fromEntries(resources.map(name => [name, []]));
const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
let server, base, station, destination, route, train, seat, blockedSeat, schedule;
const stationInput = code => ({ code: `${tag}-${code}`, name: `${tag} Station ${code}`, city: 'Test City', state: 'Test State', status: 'ACTIVE' });
const trainInput = code => ({ code: `${tag}-${code}`, name: `${tag} Train ${code}`, capacity: 3, status: 'ACTIVE' });
const scheduleInput = (trainId = train.id, hour = 0) => ({ trainId, routeId: route.id, departureTime: new Date(Date.now() + 864000000 + hour * 3600000).toISOString(), arrivalTime: new Date(Date.now() + 864000000 + (hour + 1) * 3600000).toISOString(), fareEconomy: '4500.50', fareBusiness: '9000.00', status: 'SCHEDULED' });
const inputOf = (resource, row) => adminSchemas[resource].parse(Object.fromEntries(Object.keys(adminSchemas[resource].shape).map(key => [key, row[key]])));
async function request(path, { method = 'GET', body, role = 'ADMIN', extraHeaders = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...extraHeaders }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), response };
}
async function create(resource, body) {
  const result = await request(`/admin/${resource}`, { method: 'POST', body });
  assert.equal(result.status, 201, result.body.message);
  ids[resource].push(result.body.data.id); return result.body.data;
}
const update = (resource, row, changes = {}) => request(`/admin/${resource}/${row.id}`, { method: 'PUT', body: { ...inputOf(resource, row), ...changes } });
const remove = (resource, row) => request(`/admin/${resource}/${row.id}`, { method: 'DELETE', body: {} });

before(async () => {
  const hash = await bcrypt.hash(password, 4);
  for (const role of ['ADMIN', 'PASSENGER', 'TICKET_OFFICER']) users[role] = await db.user.create({ data: { fullName: 'Admin tests', email: `${role}-${tag}@admin-tests.test`, phone: `+${role.slice(0, 2)}${tag}`, passwordHash: hash, role } });
  server = createApp({ database: db }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
  for (const role of Object.keys(users)) { const result = await request('/auth/login', { method: 'POST', body: { email: users[role].email, password }, role: '' }); assert.equal(result.status, 200); cookies[role] = result.response.headers.get('set-cookie').split(';')[0]; }
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try {
    await db.$transaction(async tx => {
      const userIds = Object.values(users).map(user => user.id);
      await tx.booking.deleteMany({ where: { userId: { in: userIds } } });
      await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: ids.schedules } } });
      await tx.schedule.deleteMany({ where: { id: { in: ids.schedules } } });
      await tx.seat.deleteMany({ where: { trainId: { in: ids.trains } } });
      await tx.train.deleteMany({ where: { id: { in: ids.trains } } });
      await tx.route.deleteMany({ where: { id: { in: ids.routes } } });
      await tx.station.deleteMany({ where: { id: { in: ids.stations } } });
      await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    });
  } finally { await db.$disconnect(); }
});

test('all admin CRUD endpoints reject anonymous users, passengers and ticket officers', async () => {
  for (const role of ['', 'PASSENGER', 'TICKET_OFFICER']) {
    for (const resource of resources) for (const [method, tail] of [['GET', ''], ['GET', '/missing'], ['POST', ''], ['PUT', '/missing'], ['DELETE', '/missing']]) {
      assert.equal((await request(`/admin/${resource}${tail}`, { role, method, ...(method === 'GET' ? {} : { body: {} }) })).status, role ? 403 : 401);
    }
    assert.equal((await request('/admin/overview', { role })).status, role ? 403 : 401);
  }
});
test('station creation, detail, edit, activation and search work', async () => {
  station = await create('stations', stationInput('A')); destination = await create('stations', stationInput('B'));
  assert.equal((await request(`/admin/stations/${station.id}`)).body.data.code, station.code);
  const edited = await update('stations', station, { name: `${tag} Edited`, status: 'INACTIVE' }); assert.equal(edited.status, 200);
  const list = await request(`/admin/stations?q=${tag}&status=INACTIVE&pageSize=1`); assert.equal(list.body.data.total, 1); assert.equal(list.body.data.items[0].name, `${tag} Edited`);
  const active = await update('stations', edited.body.data, { status: 'ACTIVE' }); assert.equal(active.status, 200); station = active.body.data;
  const duplicate = await request('/admin/stations', { method: 'POST', body: stationInput('A') }); assert.equal(duplicate.status, 409);
});
test('route CRUD prevents same endpoints, duplicate pairs and inactive stations', async () => {
  const input = { originStationId: station.id, destinationStationId: destination.id, distanceKm: '100.00', estimatedDuration: 90, status: 'ACTIVE' };
  assert.equal((await request('/admin/routes', { method: 'POST', body: { ...input, destinationStationId: station.id } })).status, 422);
  await update('stations', destination, { status: 'INACTIVE' });
  assert.equal((await request('/admin/routes', { method: 'POST', body: input })).status, 409);
  await update('stations', destination, { status: 'ACTIVE' }); route = await create('routes', input);
  assert.equal((await request('/admin/routes', { method: 'POST', body: input })).status, 409);
  const edited = await update('routes', route, { estimatedDuration: 120, distanceKm: '110.50' }); assert.equal(edited.status, 200); route = edited.body.data;
  assert.equal((await request(`/admin/routes/${route.id}`)).body.data.originStation.id, station.id);
});
test('trains and seats support CRUD, statuses, uniqueness and capacity limits', async () => {
  train = await create('trains', trainInput('A'));
  let result = await update('trains', train, { name: `${tag} Edited Train`, status: 'INACTIVE' }); assert.equal(result.status, 200);
  result = await update('trains', result.body.data, { status: 'ACTIVE' }); train = result.body.data;
  seat = await create('seats', { trainId: train.id, seatNumber: 'E01', seatClass: 'ECONOMY', status: 'ACTIVE' });
  result = await update('seats', seat, { seatNumber: 'E02', seatClass: 'BUSINESS', status: 'OUT_OF_SERVICE' }); assert.equal(result.status, 200);
  result = await update('seats', result.body.data, { seatNumber: 'E01', seatClass: 'ECONOMY', status: 'ACTIVE' }); seat = result.body.data;
  blockedSeat = await create('seats', { trainId: train.id, seatNumber: 'B01', seatClass: 'BUSINESS', status: 'OUT_OF_SERVICE' });
  const disposable = await create('seats', { trainId: train.id, seatNumber: 'E03', seatClass: 'ECONOMY', status: 'ACTIVE' });
  assert.equal((await createAttemptSeat('E04')).status, 409);
  assert.equal((await remove('seats', disposable)).status, 200);
  assert.equal((await createAttemptSeat('E01')).status, 409);
  assert.equal((await update('trains', train, { capacity: 1 })).status, 409);
  assert.equal((await request(`/admin/seats?trainId=${train.id}&seatClass=BUSINESS&status=OUT_OF_SERVICE`)).body.data.total, 1);
});
function createAttemptSeat(seatNumber) { return request('/admin/seats', { method: 'POST', body: { trainId: train.id, seatNumber, seatClass: 'ECONOMY', status: 'ACTIVE' } }); }
test('schedule creation atomically creates all train seats and blocks out-of-service seats', async () => {
  schedule = await create('schedules', scheduleInput());
  assert.equal(schedule._count.scheduleSeats, 2);
  const rows = await db.scheduleSeat.findMany({ where: { scheduleId: schedule.id } });
  assert.equal(rows.find(row => row.seatId === seat.id).status, 'AVAILABLE');
  assert.equal(rows.find(row => row.seatId === blockedSeat.id).status, 'BLOCKED');
  assert.ok(rows.every(row => row.trainId === train.id));
  assert.equal((await request(`/admin/schedules/${schedule.id}`)).body.data.fareEconomy, '4500.5');
});
test('invalid dates, fares, input types, missing records and privilege fields fail safely', async () => {
  for (const changes of [{ arrivalTime: schedule.departureTime }, { departureTime: 'nonsense' }, { fareEconomy: '-1' }, { fareBusiness: '0.001' }, { fareEconomy: 100 }, { isDemo: true }]) {
    assert.equal((await request('/admin/schedules', { method: 'POST', body: { ...scheduleInput(), ...changes } })).status, 422);
  }
  assert.equal((await request('/admin/schedules', { method: 'POST', body: { ...scheduleInput(), departureTime: '2020-01-01T00:00:00Z', arrivalTime: '2020-01-01T01:00:00Z' } })).status, 409);
  assert.equal((await request('/admin/seats', { method: 'POST', body: { trainId: 'missing', seatNumber: 'E1', seatClass: 'ECONOMY', status: 'ACTIVE' } })).status, 404);
  assert.equal((await request('/admin/trains', { method: 'POST', body: { ...trainInput('INVALID'), capacity: 0 } })).status, 422);
  for (const resource of resources) assert.equal((await request(`/admin/${resource}/missing`)).status, 404);
  for (const query of ['page=0', 'pageSize=1000', 'status=INVALID', 'unexpected=yes']) assert.equal((await request(`/admin/stations?${query}`)).status, 422);
});
test('overlapping journeys and deactivation of their parents are blocked', async () => {
  assert.equal((await request('/admin/schedules', { method: 'POST', body: { ...scheduleInput(), departureTime: schedule.departureTime, arrivalTime: schedule.arrivalTime } })).status, 409);
  assert.equal((await update('trains', train, { status: 'MAINTENANCE' })).status, 409);
  assert.equal((await update('stations', station, { status: 'INACTIVE' })).status, 409);
  assert.equal((await update('routes', route, { status: 'INACTIVE' })).status, 409);
  assert.equal((await update('routes', route, { originStationId: destination.id, destinationStationId: station.id })).status, 409);
});
test('seat edits propagate availability and new inventory without changing used seat identity', async () => {
  assert.equal((await update('seats', seat, { seatClass: 'BUSINESS' })).status, 409);
  assert.equal((await update('seats', seat, { status: 'OUT_OF_SERVICE' })).status, 200);
  let row = await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedule.id, seatId: seat.id } } }); assert.equal(row.status, 'BLOCKED');
  await update('seats', seat, { status: 'ACTIVE' });
  row = await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedule.id, seatId: seat.id } } }); assert.equal(row.status, 'AVAILABLE');
  const added = await create('seats', { trainId: train.id, seatNumber: 'E03', seatClass: 'ECONOMY', status: 'ACTIVE' });
  assert.ok(await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedule.id, seatId: added.id } } }));
  assert.equal((await remove('seats', added)).status, 409);
});
test('schedule fares, times and statuses update; cancelled inventory is refreshed on restoration', async () => {
  let result = await update('schedules', schedule, { fareBusiness: '9900.00', arrivalTime: new Date(new Date(schedule.arrivalTime).getTime() + 600000).toISOString() }); assert.equal(result.status, 200); schedule = result.body.data;
  result = await update('schedules', schedule, { status: 'CANCELLED' }); assert.equal(result.status, 200); schedule = result.body.data;
  await update('seats', seat, { status: 'OUT_OF_SERVICE' });
  result = await update('schedules', schedule, { status: 'SCHEDULED' }); assert.equal(result.status, 200); schedule = result.body.data;
  const row = await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedule.id, seatId: seat.id } } }); assert.equal(row.status, 'BLOCKED');
  await update('seats', seat, { status: 'ACTIVE' });
});
test('changing a schedule train rebuilds inventory with the correct train foreign keys', async () => {
  const other = await create('trains', trainInput('OTHER'));
  await create('seats', { trainId: other.id, seatNumber: 'E01', seatClass: 'ECONOMY', status: 'ACTIVE' });
  let result = await update('schedules', schedule, { trainId: other.id }); assert.equal(result.status, 200);
  const rows = await db.scheduleSeat.findMany({ where: { scheduleId: schedule.id } }); assert.equal(rows.length, 1); assert.equal(rows[0].trainId, other.id);
  result = await update('schedules', result.body.data, { trainId: train.id }); assert.equal(result.status, 200); schedule = result.body.data;
});
test('bookings and held inventory protect schedule edits, deletion and seat status', async () => {
  const row = await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedule.id, seatId: seat.id } } });
  await db.scheduleSeat.update({ where: { id: row.id }, data: { status: 'HELD', heldUntil: new Date(Date.now() + 60000) } });
  assert.equal((await remove('schedules', schedule)).status, 409); assert.equal((await update('seats', seat, { status: 'OUT_OF_SERVICE' })).status, 409);
  await db.scheduleSeat.update({ where: { id: row.id }, data: { status: 'AVAILABLE', heldUntil: null } });
  const booking = await db.booking.create({ data: { bookingReference: `ADMIN-${tag}`, userId: users.PASSENGER.id, scheduleId: schedule.id, scheduleSeatId: row.id, activeScheduleSeatId: row.id, amount: '4500.50' } });
  assert.equal((await update('schedules', schedule, { status: 'CANCELLED' })).status, 409);
  assert.equal((await remove('schedules', schedule)).status, 409);
  assert.equal((await update('seats', seat, { status: 'OUT_OF_SERVICE' })).status, 409);
  await db.booking.delete({ where: { id: booking.id } });
});
test('concurrent seat creation cannot exceed train capacity', async () => {
  const small = await create('trains', { ...trainInput('RACE'), capacity: 1 });
  const results = await Promise.all(['E01', 'E02'].map(seatNumber => request('/admin/seats', { method: 'POST', body: { trainId: small.id, seatNumber, seatClass: 'ECONOMY', status: 'ACTIVE' } })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  assert.equal(await db.seat.count({ where: { trainId: small.id } }), 1);
});
test('concurrent overlapping schedule creation produces one winner', async () => {
  const input = scheduleInput(train.id, 10);
  const results = await Promise.all([0, 10].map(minutes => request('/admin/schedules', { method: 'POST', body: { ...input, departureTime: new Date(new Date(input.departureTime).getTime() + minutes * 60000).toISOString() } })));
  for (const result of results) if (result.status === 201) ids.schedules.push(result.body.data.id);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
});
test('all list endpoints support search/pagination, overview reports counts, and mutations are audited', async () => {
  for (const resource of resources) {
    const result = await request(`/admin/${resource}?pageSize=1`); assert.equal(result.status, 200); assert.equal(result.body.data.items.length, 1); assert.ok(result.body.data.total > 0);
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await request(`/admin/routes?q=${tag}`)).body.data.total, 1);
  assert.equal((await request('/admin/stations?q=NO-MATCH-XYZ-93843')).body.data.total, 0);
  assert.ok((await request('/admin/overview')).body.data.counts.trains >= ids.trains.length);
  for (const action of ['ADMIN_CREATE_STATION', 'ADMIN_UPDATE_ROUTE', 'ADMIN_CREATE_SCHEDULE', 'ADMIN_DELETE_SEAT']) assert.ok(await db.auditLog.count({ where: { userId: users.ADMIN.id, action } }));
});
test('write methods enforce CSRF headers and support credentialed preflight', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await request(`/admin/stations${method === 'POST' ? '' : `/${station.id}`}`, { method, body: {}, extraHeaders: { 'X-Requested-With': '' } })).status, 403);
  const response = await fetch(`${base}/admin/stations/${station.id}`, { method: 'OPTIONS', headers: { Origin: headers.Origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,x-requested-with' } });
  assert.equal(response.status, 204); assert.match(response.headers.get('access-control-allow-methods'), /PUT/); assert.match(response.headers.get('access-control-allow-methods'), /DELETE/);
});
test('deletion protects referenced parents and removes unused records in dependency order', async () => {
  assert.equal((await remove('stations', station)).status, 409); assert.equal((await remove('routes', route)).status, 409); assert.equal((await remove('trains', train)).status, 409);
  for (const id of ids.schedules) assert.equal((await remove('schedules', { id })).status, 200);
  assert.equal(await db.scheduleSeat.count({ where: { scheduleId: { in: ids.schedules } } }), 0);
  for (const row of await db.seat.findMany({ where: { trainId: { in: ids.trains } } })) assert.equal((await remove('seats', row)).status, 200);
  for (const id of ids.trains) assert.equal((await remove('trains', { id })).status, 200);
  assert.equal((await remove('routes', route)).status, 200);
  assert.equal((await remove('stations', station)).status, 200); assert.equal((await remove('stations', destination)).status, 200);
  assert.equal((await remove('stations', station)).status, 404);
});
