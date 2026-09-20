import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { railwayDate, travelDayBounds, popularDemoRoutes, searchSchedules } from '../src/services/search.service.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Search integration tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex').toUpperCase();
const date = railwayDate(new Date(Date.now() + 10 * 86400000)), { start, end } = travelDayBounds(date);
let server, base, origin, destination, inactive, route, reverse, train, disabledTrain, user, first, soldOut, overnight;
const scheduleIds = [], trainIds = [], stationIds = [], routeIds = [];
async function schedule(time, data = {}) {
  const row = await db.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime: new Date(time), arrivalTime: new Date(Number(time) + 90 * 60000), fareEconomy: '4500.50', fareBusiness: '9100.00', isDemo: true, ...data } }); scheduleIds.push(row.id); return row;
}
const query = changes => new URLSearchParams({ originId: origin.id, destinationId: destination.id, date, ...changes });
async function request(path = `/schedules/search?${query()}`) { const response = await fetch(`${base}${path}`); return { status: response.status, body: await response.json(), response }; }
before(async () => {
  for (const code of ['A', 'B', 'INACTIVE']) { const row = await db.station.create({ data: { name: `Search ${tag} ${code}`, code: `${tag}-${code}`, city: 'Test city', state: 'Test', status: code === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', isDemo: true } }); stationIds.push(row.id); }
  [origin, destination, inactive] = await Promise.all(stationIds.map(id => db.station.findUnique({ where: { id } })));
  route = await db.route.create({ data: { originStationId: origin.id, destinationStationId: destination.id, distanceKm: '100.50', estimatedDuration: 90, isDemo: true, createdAt: new Date('2000-01-01T00:00:00Z') } }); routeIds.push(route.id);
  reverse = await db.route.create({ data: { originStationId: destination.id, destinationStationId: origin.id, distanceKm: '100.50', estimatedDuration: 90, isDemo: true } }); routeIds.push(reverse.id);
  for (const [suffix, status] of [['A', 'ACTIVE'], ['B', 'INACTIVE']]) { const row = await db.train.create({ data: { name: `Search train ${tag}`, code: `${tag}-${suffix}`, capacity: 6, status, isDemo: true } }); trainIds.push(row.id); }
  [train, disabledTrain] = await Promise.all(trainIds.map(id => db.train.findUnique({ where: { id } })));
  const seats = [];
  for (let index = 0; index < 6; index++) seats.push(await db.seat.create({ data: { trainId: train.id, seatNumber: `E${index}`, seatClass: index === 0 ? 'ECONOMY' : 'BUSINESS', status: index === 4 ? 'OUT_OF_SERVICE' : 'ACTIVE' } }));
  first = await schedule(start); soldOut = await schedule(start.getTime() + 3600000); overnight = await schedule(end.getTime() - 1);
  await schedule(start.getTime() - 1); await schedule(end);
  for (const [index, status] of ['CANCELLED', 'BOARDING', 'DEPARTED', 'COMPLETED'].entries()) await schedule(start.getTime() + (index + 2) * 3600000, { status });
  await schedule(start.getTime() + 8 * 3600000, { trainId: disabledTrain.id });
  const rows = [];
  for (const [index, seat] of seats.entries()) rows.push(await db.scheduleSeat.create({ data: { scheduleId: first.id, trainId: train.id, seatId: seat.id, status: ['AVAILABLE', 'HELD', 'BOOKED', 'BLOCKED', 'AVAILABLE', 'AVAILABLE'][index], heldUntil: index === 1 ? new Date(Date.now() - 1000) : null } }));
  user = await db.user.create({ data: { fullName: 'Search test passenger', email: `${tag}@search-tests.test`, phone: `+SEARCH${tag}`, passwordHash: 'fixture-not-used-for-login' } });
  await db.booking.create({ data: { userId: user.id, bookingReference: `SEARCH-${tag}`, scheduleId: first.id, scheduleSeatId: rows[5].id, activeScheduleSeatId: rows[5].id, amount: '4500.50' } });
  await db.scheduleSeat.create({ data: { scheduleId: soldOut.id, trainId: train.id, seatId: seats[0].id, status: 'BOOKED' } });
  server = createApp({ database: db }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try { await db.$transaction(async tx => {
    if (user) await tx.booking.deleteMany({ where: { userId: user.id } });
    await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: scheduleIds } } }); await tx.schedule.deleteMany({ where: { id: { in: scheduleIds } } });
    await tx.seat.deleteMany({ where: { trainId: { in: trainIds } } }); await tx.train.deleteMany({ where: { id: { in: trainIds } } });
    await tx.route.deleteMany({ where: { id: { in: routeIds } } }); await tx.station.deleteMany({ where: { id: { in: stationIds } } }); if (user) await tx.user.delete({ where: { id: user.id } });
  }); } finally { await db.$disconnect(); }
});

test('Nigerian travel dates use UTC+01:00 and include a complete local day', () => {
  assert.equal(railwayDate(new Date('2026-09-20T22:59:59.999Z')), '2026-09-20');
  assert.equal(railwayDate(new Date('2026-09-20T23:00:00.000Z')), '2026-09-21');
  const bounds = travelDayBounds('2026-09-21'); assert.equal(bounds.start.toISOString(), '2026-09-20T23:00:00.000Z'); assert.equal(bounds.end.toISOString(), '2026-09-21T23:00:00.000Z');
});
test('public station choices come from active database records without authentication', async () => {
  const result = await request('/stations'); assert.equal(result.status, 200);
  assert.ok(result.body.data.items.some(row => row.id === origin.id)); assert.ok(!result.body.data.items.some(row => row.id === inactive.id));
  assert.deepEqual(Object.keys(result.body.data.items[0]).sort(), ['city', 'code', 'id', 'name', 'state']);
});
test('search returns real schedules, required journey details and only available active seats', async () => {
  const result = await request(); assert.equal(result.status, 200); assert.equal(result.body.data.total, 3);
  const row = result.body.data.items[0]; assert.equal(row.id, first.id); assert.equal(row.train.id, train.id); assert.equal(row.origin.id, origin.id); assert.equal(row.destination.id, destination.id);
  assert.equal(row.departureTime, start.toISOString()); assert.equal(row.durationMinutes, 90); assert.equal(row.fareEconomy, '4500.50'); assert.equal(row.fareBusiness, '9100.00'); assert.equal(row.currency, 'NGN'); assert.equal(row.availableSeats, 1); assert.equal(row.isDemo, true);
  assert.equal(result.body.data.timezone, 'Africa/Lagos'); assert.equal(result.response.headers.get('cache-control'), 'no-store');
  for (const secret of ['passwordHash', 'qrToken', 'bookingReference', 'userId', 'authSession']) assert.ok(!JSON.stringify(result.body).includes(secret));
});
test('local-day boundaries, overnight arrival and deterministic pagination are correct', async () => {
  const all = (await request()).body.data; assert.deepEqual(all.items.map(row => row.id), [first.id, soldOut.id, overnight.id]);
  assert.equal(railwayDate(new Date(all.items[2].arrivalTime)), railwayDate(end));
  const page = await request(`/schedules/search?${query({ page: 2, pageSize: 1 })}`); assert.equal(page.body.data.items[0].id, soldOut.id); assert.equal(page.body.data.pages, 3);
  const beyond = await request(`/schedules/search?${query({ page: 4, pageSize: 1 })}`); assert.deepEqual(beyond.body.data.items, []); assert.equal(beyond.body.data.total, 3);
});
test('cancelled, boarding, departed, completed and inactive-train journeys are excluded', async () => {
  const all = (await request()).body.data.items; assert.equal(all.length, 3); assert.ok(all.every(row => row.train.id !== disabledTrain.id));
  await db.schedule.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
  assert.equal((await request()).body.data.total, 2);
  await db.schedule.update({ where: { id: first.id }, data: { status: 'SCHEDULED' } });
});
test('sold-out schedules remain visible with an honest zero availability count', async () => {
  assert.equal((await request()).body.data.items.find(row => row.id === soldOut.id).availableSeats, 0);
});
test('inactive routes are excluded and inactive/unknown stations return validation errors', async () => {
  await db.route.update({ where: { id: route.id }, data: { status: 'INACTIVE' } }); assert.equal((await request()).body.data.total, 0); await db.route.update({ where: { id: route.id }, data: { status: 'ACTIVE' } });
  for (const destinationId of [inactive.id, 'missing-station']) { const result = await request(`/schedules/search?${query({ destinationId })}`); assert.equal(result.status, 422); assert.ok(result.body.fields.destinationId); }
  await db.station.update({ where: { id: origin.id }, data: { status: 'INACTIVE' } }); assert.equal((await request()).status, 422); await db.station.update({ where: { id: origin.id }, data: { status: 'ACTIVE' } });
});
test('same station, past/impossible dates, missing/extra parameters and invalid pagination are rejected', async () => {
  const yesterday = railwayDate(new Date(Date.now() - 86400000));
  for (const changes of [{ destinationId: origin.id }, { date: yesterday }, { date: '2026-02-30' }, { date: 'not-a-date' }, { date: '2026-09-21T00:00:00Z' }, { originId: '' }, { page: '0' }, { pageSize: '51' }, { role: 'ADMIN' }]) assert.equal((await request(`/schedules/search?${query(changes)}`)).status, 422);
  assert.equal((await request('/schedules/search')).status, 422);
  assert.equal((await request(`/schedules/search?${query()}&originId=duplicate`)).status, 422);
});
test('a valid route/date without journeys returns an empty result, not a fabricated timetable', async () => {
  const result = await request(`/schedules/search?${query({ originId: destination.id, destinationId: origin.id })}`); assert.equal(result.status, 200); assert.equal(result.body.data.total, 0); assert.deepEqual(result.body.data.items, []);
});
test('today search hides departures at or before the current time', async () => {
  const result = await searchSchedules(db, { originId: origin.id, destinationId: destination.id, date, page: 1, pageSize: 10 }, new Date(start.getTime() + 3600000));
  assert.deepEqual(result.items.map(row => row.id), [overnight.id]);
});
test('popular demo cards use real active routes and their next matching demo departure', async () => {
  const result = await request('/routes/popular'); assert.equal(result.status, 200); assert.ok(result.body.data.items.length <= 4);
  const item = result.body.data.items.find(row => row.id === route.id); assert.ok(item); assert.equal(item.economyFare, '4500.50'); assert.equal(item.nextDeparture, new Date(start.getTime() - 1).toISOString());
  const later = await popularDemoRoutes(db, new Date(end.getTime() + 86400000)); const unavailable = later.find(row => row.id === route.id); assert.equal(unavailable.economyFare, null); assert.equal(unavailable.nextDeparture, null);
  await db.route.update({ where: { id: route.id }, data: { status: 'INACTIVE' } }); assert.ok(!(await request('/routes/popular')).body.data.items.some(row => row.id === route.id)); await db.route.update({ where: { id: route.id }, data: { status: 'ACTIVE' } });
});
test('fare and inventory changes are visible in the next search response', async () => {
  await db.schedule.update({ where: { id: first.id }, data: { fareEconomy: '6789.12' } });
  const available = await db.scheduleSeat.findFirst({ where: { scheduleId: first.id, status: 'AVAILABLE', seat: { status: 'ACTIVE' }, activeBooking: { is: null } } });
  await db.scheduleSeat.update({ where: { id: available.id }, data: { status: 'BLOCKED' } });
  const row = (await request()).body.data.items.find(row => row.id === first.id); assert.equal(row.fareEconomy, '6789.12'); assert.equal(row.availableSeats, 0);
});
