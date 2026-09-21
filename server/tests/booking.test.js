import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseAuthConfig } from '../src/config/auth.js';
import { signSession } from '../src/security/tokens.js';
import { env } from '../src/config/env.js';
import { releaseExpiredHolds, bookingReference, createPendingBooking } from '../src/services/booking.service.js';
import { startHoldCleanup } from '../src/services/hold-cleanup.js';
import { railwayDate } from '../src/services/search.service.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Booking tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex'), config = parseAuthConfig();
const users = [], cookies = [], stations = [], schedules = [], seats = [];
let train, route, server, base;
const headers = { Origin: env.clientUrls[0], 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
async function request(path, { cookie = cookies[0], body, method = body ? 'POST' : 'GET', extraHeaders = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const input = (index, schedule = schedules[0]) => ({ scheduleId: schedule.id, seatId: seats[index].id, expectedAmount: seats[index].seatClass === 'ECONOMY' ? '2500.00' : '5000.00' });
const reserve = (index, options = {}) => request('/bookings', { body: input(index), ...options });
before(async () => {
  for (const [index, role] of ['PASSENGER', 'PASSENGER', 'ADMIN', 'TICKET_OFFICER'].entries()) {
    const user = await db.user.create({ data: { fullName: `Booking test ${index}`, email: `${index}@booking-${tag}.test`, phone: `+8${index}${BigInt(`0x${tag}`)}`, passwordHash: 'unused-test-hash', role } }); users.push(user);
    const session = await db.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } }); cookies.push(`${config.cookieName}=${signSession(session, config)}`);
  }
  for (const suffix of ['A', 'B']) stations.push(await db.station.create({ data: { name: `Booking ${tag} ${suffix}`, code: `${tag}-${suffix}`, city: 'Test', state: 'Test' } }));
  route = await db.route.create({ data: { originStationId: stations[0].id, destinationStationId: stations[1].id, distanceKm: '100', estimatedDuration: 90 } });
  train = await db.train.create({ data: { name: `Booking ${tag}`, code: tag, capacity: 20 } });
  for (let i = 0; i < 20; i++) seats.push(await db.seat.create({ data: { trainId: train.id, seatNumber: `S${i + 1}`, seatClass: i === 1 ? 'BUSINESS' : 'ECONOMY', status: i === 19 ? 'OUT_OF_SERVICE' : 'ACTIVE' } }));
  for (let i = 0; i < 2; i++) {
    const departureTime = new Date(Date.now() + (10 + i) * 86400000);
    const schedule = await db.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime, arrivalTime: new Date(departureTime.getTime() + 5400000), fareEconomy: '2500', fareBusiness: '5000' } }); schedules.push(schedule);
    await db.scheduleSeat.createMany({ data: seats.map(seat => ({ trainId: train.id, seatId: seat.id, scheduleId: schedule.id, status: seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' })) });
  }
  server = createApp({ database: db }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try { await db.$transaction(async tx => {
    const bookings = await tx.booking.findMany({ where: { userId: { in: users.map(row => row.id) } }, select: { id: true } });
    await tx.fraudAlert.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: users.map(row => row.id) } }, { entityType: 'Booking', entityId: { in: bookings.map(row => row.id) } }] } });
    await tx.booking.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: schedules.map(row => row.id) } } });
    await tx.schedule.deleteMany({ where: { id: { in: schedules.map(row => row.id) } } });
    if (train) { await tx.seat.deleteMany({ where: { trainId: train.id } }); await tx.train.delete({ where: { id: train.id } }); }
    if (route) await tx.route.delete({ where: { id: route.id } }); await tx.station.deleteMany({ where: { id: { in: stations.map(row => row.id) } } });
    await tx.authSession.deleteMany({ where: { userId: { in: users.map(row => row.id) } } }); await tx.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
  }); } finally { await db.$disconnect(); }
});

test('public seat inventory exposes classes, prices and safe states without passenger data', async () => {
  const result = await request(`/schedules/${schedules[0].id}/seats`, { cookie: null }); assert.equal(result.status, 200); assert.equal(result.body.data.seats.length, 20); assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.body.data.seats.find(row => row.id === seats[1].id).fare, '5000.00'); assert.equal(result.body.data.seats.find(row => row.id === seats[19].id).status, 'BLOCKED');
  for (const secret of ['userId', 'passwordHash', 'bookingReference', 'activeBooking']) assert.ok(!JSON.stringify(result.body).includes(secret));
  assert.equal((await request('/schedules/missing/seats')).status, 404);
});
test('booking endpoints enforce passenger authentication, roles and mutation protection', async () => {
  for (const [cookie, expected] of [[null, 401], [cookies[2], 403], [cookies[3], 403]]) {
    assert.equal((await reserve(0, { cookie })).status, expected);
    assert.equal((await request('/bookings', { cookie })).status, expected);
    assert.equal((await request('/bookings/missing', { cookie })).status, expected);
    assert.equal((await request('/bookings/missing/cancel', { cookie, body: {} })).status, expected);
  }
  assert.equal((await reserve(0, { extraHeaders: { 'X-Requested-With': '' } })).status, 403);
});
test('pending reservation atomically claims the seat, freezes its fare, records a deadline and audits creation', async () => {
  const before = Date.now(), result = await reserve(0); assert.equal(result.status, 201, JSON.stringify(result.body)); const booking = result.body.data.booking;
  assert.equal(booking.bookingStatus, 'PENDING'); assert.equal(booking.paymentStatus, 'PENDING'); assert.equal(booking.amount, '2500.00'); assert.match(booking.bookingReference, /^TRN-\d{4}-[A-HJ-NP-Z2-9]{10}$/);
  assert.ok(new Date(booking.expiresAt).getTime() - before >= 590000); assert.ok(new Date(booking.expiresAt).getTime() - before <= 610000);
  const stored = await db.booking.findUnique({ where: { id: booking.id }, include: { activeSeat: true } }); assert.equal(stored.activeScheduleSeatId, stored.scheduleSeatId); assert.equal(stored.activeSeat.status, 'HELD'); assert.equal(stored.activeSeat.heldUntil.getTime(), stored.expiresAt.getTime());
  assert.equal(await db.auditLog.count({ where: { entityId: booking.id, action: 'BOOKING_CREATED' } }), 1);
  assert.equal((await reserve(0)).status, 409);
});
test('CRITICAL: competing HTTP requests from two passengers yield exactly one 201 and one 409', async () => {
  // Repeat on independent seats to exercise actual overlapping transactions.
  for (const index of [2, 3, 4]) {
    const results = await Promise.all([reserve(index, { cookie: cookies[0] }), reserve(index, { cookie: cookies[1] })]);
    assert.deepEqual(results.map(row => row.status).sort(), [201, 409], JSON.stringify(results));
    assert.match(results.find(row => row.status === 409).body.message, /seat.*no longer available/i);
    const inventory = await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedules[0].id, seatId: seats[index].id } } });
    assert.equal(inventory.status, 'HELD'); assert.equal(await db.booking.count({ where: { activeScheduleSeatId: inventory.id } }), 1); assert.equal(await db.booking.count({ where: { scheduleSeatId: inventory.id } }), 1);
  }
});
test('the same physical seat can be reserved on different schedules and Business uses the server fare', async () => {
  assert.equal((await reserve(0, { body: input(0, schedules[1]) })).status, 201);
  const business = await reserve(1); assert.equal(business.status, 201); assert.equal(business.body.data.booking.amount, '5000.00'); assert.equal(business.body.data.booking.seat.seatClass, 'BUSINESS');
});
test('invalid input, injected owner/status/amount and stale fare never create a booking', async () => {
  for (const extra of [{ userId: users[1].id }, { amount: '0.01' }, { bookingStatus: 'CONFIRMED' }, { seatClass: 'BUSINESS' }]) assert.equal((await reserve(5, { body: { ...input(5), ...extra } })).status, 422);
  assert.equal((await reserve(5, { body: { ...input(5), expectedAmount: '1.00' } })).status, 409);
  assert.equal((await reserve(5, { body: { ...input(5), expectedAmount: 'NaN' } })).status, 422);
  assert.equal((await reserve(5, { body: { ...input(5), seatId: 'missing' } })).status, 409);
  assert.equal((await reserve(19)).status, 409);
  const available = (await request(`/schedules/${schedules[0].id}/seats`)).body.data.seats.find(row => row.id === seats[5].id); assert.equal(available.status, 'AVAILABLE');
});
test('booking history and detail are scoped to the owner; another passenger cannot view or cancel', async () => {
  const created = (await reserve(6)).body.data.booking;
  assert.equal((await request(`/bookings/${created.id}`, { cookie: cookies[1] })).status, 404);
  assert.equal((await request(`/bookings/${created.id}/cancel`, { cookie: cookies[1], body: {} })).status, 404);
  const list = await request('/bookings?page=1&pageSize=2'); assert.equal(list.status, 200); assert.equal(list.body.data.items.length, 2); assert.ok(list.body.data.pages > 1);
  assert.equal((await request('/bookings?userId=someone')).status, 422);
  const other = await request('/bookings', { cookie: cookies[1] }); assert.ok(!other.body.data.items.some(row => row.id === created.id));
});
async function expire(booking) {
  const deadline = new Date(Date.now() - 1000);
  await db.$transaction([db.booking.update({ where: { id: booking.id }, data: { expiresAt: deadline } }), db.scheduleSeat.update({ where: { scheduleId_seatId: { scheduleId: booking.schedule.id, seatId: booking.seat.id } }, data: { heldUntil: deadline } })]);
}
test('expired holds release atomically, preserve old booking history and can be reserved again', async () => {
  const original = (await reserve(7)).body.data.booking; await expire(original);
  const inventory = await request(`/schedules/${schedules[0].id}/seats`); assert.equal(inventory.body.data.seats.find(row => row.id === seats[7].id).status, 'AVAILABLE');
  const old = (await request(`/bookings/${original.id}`)).body.data.booking; assert.equal(old.bookingStatus, 'EXPIRED');
  const replacement = await reserve(7, { cookie: cookies[1] }); assert.equal(replacement.status, 201); assert.notEqual(replacement.body.data.booking.bookingReference, original.bookingReference);
  assert.equal((await db.booking.findUnique({ where: { id: original.id } })).activeScheduleSeatId, null);
  assert.equal(await releaseExpiredHolds(db, { scheduleId: schedules[0].id }), 0);
  const current = (await request(`/schedules/${schedules[0].id}/seats`)).body.data.seats.find(row => row.id === seats[7].id); assert.equal(current.status, 'HELD');
});
test('simultaneous expiry workers and a new reservation cannot release the new hold', async () => {
  const old = (await reserve(8)).body.data.booking; await expire(old);
  const [newBooking] = await Promise.all([reserve(8, { cookie: cookies[1] }), releaseExpiredHolds(db, { scheduleId: schedules[0].id }), releaseExpiredHolds(db, { scheduleId: schedules[0].id })]);
  assert.equal(newBooking.status, 201, JSON.stringify(newBooking.body));
  const row = await db.booking.findUnique({ where: { id: newBooking.body.data.booking.id }, include: { activeSeat: true } }); assert.equal(row.activeSeat.status, 'HELD'); assert.equal(row.bookingStatus, 'PENDING');
});
test('background cleanup returns expired holds to availability without a browser request', async () => {
  const old = (await reserve(9)).body.data.booking; await expire(old);
  const stop = startHoldCleanup(() => db, 20);
  try { for (let i = 0; i < 50; i++) { if ((await db.booking.findUnique({ where: { id: old.id } })).bookingStatus === 'EXPIRED') break; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.equal((await db.booking.findUnique({ where: { id: old.id } })).bookingStatus, 'EXPIRED');
  } finally { await stop(); }
});
test('pending cancellation releases the claim and can be safely repeated', async () => {
  const booking = (await reserve(10)).body.data.booking;
  const cancelled = await request(`/bookings/${booking.id}/cancel`, { body: {} }); assert.equal(cancelled.status, 200); assert.equal(cancelled.body.data.booking.bookingStatus, 'CANCELLED');
  assert.equal((await request(`/bookings/${booking.id}/cancel`, { body: {} })).status, 200);
  assert.equal((await reserve(10, { cookie: cookies[1] })).status, 201);
  // Replaying cancellation of the old booking must leave its replacement held.
  assert.equal((await request(`/bookings/${booking.id}/cancel`, { body: {} })).status, 200);
  assert.equal((await request(`/schedules/${schedules[0].id}/seats`)).body.data.seats.find(row => row.id === seats[10].id).status, 'HELD');
});
test('confirmed/booked claims are never released by pending cancellation or the expiry worker', async () => {
  const booking = (await reserve(11)).body.data.booking;
  await db.$transaction([db.booking.update({ where: { id: booking.id }, data: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } }), db.scheduleSeat.update({ where: { scheduleId_seatId: { scheduleId: schedules[0].id, seatId: seats[11].id } }, data: { status: 'BOOKED', heldUntil: null } })]);
  assert.equal((await request(`/bookings/${booking.id}/cancel`, { body: {} })).status, 409);
  await releaseExpiredHolds(db, { scheduleId: schedules[0].id }, new Date(Date.now() + 86400000));
  assert.equal((await reserve(11)).status, 409); assert.equal((await request(`/schedules/${schedules[0].id}/seats`)).body.data.seats.find(row => row.id === seats[11].id).status, 'BOOKED');
});
test('cancelled, departed and inactive journeys reject new reservations', async () => {
  for (const status of ['CANCELLED', 'BOARDING', 'DEPARTED', 'COMPLETED']) {
    await db.schedule.update({ where: { id: schedules[1].id }, data: { status } }); assert.equal((await reserve(12, { body: input(12, schedules[1]) })).status, 409);
  }
  await db.schedule.update({ where: { id: schedules[1].id }, data: { status: 'SCHEDULED' } });
  await db.train.update({ where: { id: train.id }, data: { status: 'INACTIVE' } }); assert.equal((await reserve(12)).status, 409); await db.train.update({ where: { id: train.id }, data: { status: 'ACTIVE' } });
  await db.station.update({ where: { id: stations[0].id }, data: { status: 'INACTIVE' } }); assert.equal((await reserve(12)).status, 409); await db.station.update({ where: { id: stations[0].id }, data: { status: 'ACTIVE' } });
});
test('search releases expired holds before computing availability and recommendations', async () => {
  const booking = (await reserve(13)).body.data.booking; await expire(booking);
  const result = await request(`/schedules/search?${new URLSearchParams({ originId: stations[0].id, destinationId: stations[1].id, date: railwayDate(schedules[0].departureTime) })}`);
  assert.equal(result.status, 200); assert.equal((await db.booking.findUnique({ where: { id: booking.id } })).bookingStatus, 'EXPIRED');
  const count = await db.scheduleSeat.count({ where: { scheduleId: schedules[0].id, status: 'AVAILABLE', seat: { status: 'ACTIVE' }, activeBooking: { is: null } } }); assert.equal(result.body.data.items[0].availableSeats, count);
});
test('near-departure holds stop at departure and past journeys cannot be reserved', async () => {
  const departureTime = new Date(Date.now() + 120000);
  await db.schedule.update({ where: { id: schedules[1].id }, data: { departureTime, arrivalTime: new Date(departureTime.getTime() + 5400000) } });
  const booking = await reserve(14, { body: input(14, schedules[1]) }); assert.equal(booking.status, 201); assert.equal(new Date(booking.body.data.booking.expiresAt).getTime(), departureTime.getTime());
  await db.schedule.update({ where: { id: schedules[1].id }, data: { departureTime: new Date(Date.now() - 60000) } });
  assert.equal((await reserve(15, { body: input(15, schedules[1]) })).status, 409);
});
test('references use a cryptographic unambiguous alphabet with ample uniqueness', () => {
  const refs = Array.from({ length: 1000 }, () => bookingReference(new Date('2026-01-01'))); assert.equal(new Set(refs).size, 1000);
  assert.ok(refs.every(ref => /^TRN-2026-[A-HJ-NP-Z2-9]{10}$/.test(ref)));
});
test('failure after inventory and booking writes rolls the entire reservation back', async () => {
  const failure = new Error('Injected audit failure');
  const failingDb = { $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, { get(target, key) { return key === 'auditLog' ? { create: () => { throw failure; } } : target[key]; } })), options) };
  await assert.rejects(createPendingBooking(failingDb, users[0].id, input(16)), error => error === failure);
  const inventory = await db.scheduleSeat.findUnique({ where: { scheduleId_seatId: { scheduleId: schedules[0].id, seatId: seats[16].id } } });
  assert.equal(inventory.status, 'AVAILABLE'); assert.equal(inventory.heldUntil, null); assert.equal(await db.booking.count({ where: { scheduleSeatId: inventory.id } }), 0);
});
