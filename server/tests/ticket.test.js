import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { parseAuthConfig } from '../src/config/auth.js';
import { signSession } from '../src/security/tokens.js';
import { env } from '../src/config/env.js';
import { settlePayment } from '../src/payments/payment.service.js';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Ticket tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex'), config = parseAuthConfig();
const users = [], cookies = [], stations = [], schedules = [], seats = [];
let nextSeat = 0;
let train, route, server, base;
const headers = { Origin: env.clientUrls[0], 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
async function request(path, { cookie = cookies[0], body, method = body ? 'POST' : 'GET', extraHeaders = {}, apiBase = base } = {}) {
  const response = await fetch(`${apiBase}${path}`, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const input = (index, schedule = schedules[0]) => ({ scheduleId: schedule.id, seatId: seats[index].id, expectedAmount: seats[index].seatClass === 'ECONOMY' ? '2500.00' : '5000.00' });
const reserve = (index, options = {}) => request('/bookings', { body: input(index), ...options });
before(async () => {
  for (const [index, role] of ['PASSENGER', 'PASSENGER', 'ADMIN', 'TICKET_OFFICER'].entries()) {
    const user = await db.user.create({ data: { fullName: `Ọlá Adéyẹmí ${index}`, email: `${index}@ticket-${tag}.test`, phone: `+8${index}${BigInt(`0x${tag}`)}`, passwordHash: 'unused-test-hash', role } }); users.push(user);
    const session = await db.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } }); cookies.push(`${config.cookieName}=${signSession(session, config)}`);
  }
  for (const suffix of ['A', 'B']) stations.push(await db.station.create({ data: { name: `Booking ${tag} ${suffix}`, code: `${tag}-${suffix}`, city: 'Test', state: 'Test' } }));
  route = await db.route.create({ data: { originStationId: stations[0].id, destinationStationId: stations[1].id, distanceKm: '100', estimatedDuration: 90 } });
  train = await db.train.create({ data: { name: `Booking ${tag}`, code: tag, capacity: 24 } });
  for (let i = 0; i < 24; i++) seats.push(await db.seat.create({ data: { trainId: train.id, seatNumber: `S${i + 1}`, seatClass: i === 1 ? 'BUSINESS' : 'ECONOMY', status: 'ACTIVE' } }));
  for (let i = 0; i < 2; i++) {
    const departureTime = new Date(Date.now() + (10 + i) * 86400000);
    const schedule = await db.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime, arrivalTime: new Date(departureTime.getTime() + 5400000), fareEconomy: '2500', fareBusiness: '5000' } }); schedules.push(schedule);
    await db.scheduleSeat.createMany({ data: seats.map(seat => ({ trainId: train.id, seatId: seat.id, scheduleId: schedule.id, status: seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' })) });
  }
  server = createApp({ database: db, paymentConfig: { enabled: true, scenario: 'SUCCESS' } }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try { await db.$transaction(async tx => {
    const bookings = await tx.booking.findMany({ where: { userId: { in: users.map(row => row.id) } }, select: { id: true } });
    const paymentIds = (await tx.payment.findMany({ where: { bookingId: { in: bookings.map(row => row.id) } }, select: { id: true } })).map(row => row.id);
    const ticketIds = (await tx.ticket.findMany({ where: { bookingId: { in: bookings.map(row => row.id) } }, select: { id: true } })).map(row => row.id);
    await tx.fraudAlert.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.auditLog.deleteMany({ where: { OR: [{ entityType: 'Payment', entityId: { in: paymentIds } }, { entityType: 'Ticket', entityId: { in: ticketIds } }] } });
    await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: users.map(row => row.id) } }, { entityType: 'Booking', entityId: { in: bookings.map(row => row.id) } }] } });
    await tx.ticket.deleteMany({ where: { bookingId: { in: bookings.map(row => row.id) } } });
    await tx.payment.deleteMany({ where: { bookingId: { in: bookings.map(row => row.id) } } });
    await tx.booking.deleteMany({ where: { userId: { in: users.map(row => row.id) } } });
    await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: schedules.map(row => row.id) } } });
    await tx.schedule.deleteMany({ where: { id: { in: schedules.map(row => row.id) } } });
    if (train) { await tx.seat.deleteMany({ where: { trainId: train.id } }); await tx.train.delete({ where: { id: train.id } }); }
    if (route) await tx.route.delete({ where: { id: route.id } }); await tx.station.deleteMany({ where: { id: { in: stations.map(row => row.id) } } });
    await tx.authSession.deleteMany({ where: { userId: { in: users.map(row => row.id) } } }); await tx.user.deleteMany({ where: { id: { in: users.map(row => row.id) } } });
  }); } finally { await db.$disconnect(); }
});

async function reserveNext() {
  const result = await reserve(nextSeat++); assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.data.booking;
}
async function payBooking(b, outcome = 'SUCCESS') {
  const result = await request(`/bookings/${b.id}/payments`, { body: { paymentMethod: 'CARD', idempotencyKey: randomUUID() } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const p = result.body.data.payment;
  await db.payment.update({ where: { id: p.id }, data: { demoOutcome: outcome, readyAt: new Date(Date.now() - 1000) } });
  await settlePayment(db, p.id);
  return db.ticket.findUnique({ where: { bookingId: b.id } });
}
async function paidTicket() { return payBooking(await reserveNext()); }
const verify = (token, options = {}) => request('/tickets/verify', { body: { token }, cookie: cookies[3], ...options });

test('pending and failed payments cannot issue tickets, even through direct database writes', async () => {
  const b = await reserveNext();
  const insert = () => db.ticket.create({ data: { bookingId: b.id, ticketNumber: `TKT-TEST-${randomBytes(8).toString('hex')}`, qrToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 86400000) } });
  await assert.rejects(insert());
  assert.equal(await payBooking(b, 'FAILURE'), null); await assert.rejects(insert());
  // Forging the flags still cannot bypass the matching successful Payment row.
  await db.booking.update({ where: { id: b.id }, data: { bookingStatus: 'CONFIRMED', paymentStatus: 'PAID' } });
  try { await assert.rejects(insert()); }
  finally { await db.booking.update({ where: { id: b.id }, data: { bookingStatus: 'PENDING', paymentStatus: 'FAILED' } }); }
  assert.equal(await db.ticket.count({ where: { bookingId: b.id } }), 0);
  assert.equal((await request('/tickets', { body: { bookingId: b.id, status: 'VALID' } })).status, 404);
});

test('ticket list is empty until payment succeeds', async () => {
  const result = await request('/tickets'); assert.equal(result.status, 200); assert.deepEqual(result.body.data.items, []);
  assert.equal((await request('/tickets/missing')).status, 404);
});

test('paid ticket exposes required owner fields and a QR that decodes to only its random token', async () => {
  const row = await paidTicket(), result = await request(`/tickets/${row.id}`); assert.equal(result.status, 200);
  const t = result.body.data.ticket;
  for (const key of ['passengerName', 'bookingReference', 'ticketNumber', 'train', 'origin', 'destination', 'departureTime', 'arrivalTime', 'seatNumber', 'seatClass', 'fare', 'status', 'qrDataUrl']) assert.ok(t[key], key);
  assert.equal(t.passengerName, users[0].fullName); assert.equal(t.status, 'VALID'); assert.equal(t.valid, true); assert.equal(t.isDemo, true); assert.equal(t.timezone, 'Africa/Lagos');
  const png = PNG.sync.read(Buffer.from(t.qrDataUrl.split(',')[1], 'base64'));
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, row.qrToken); assert.match(decoded.data, /^[a-f0-9]{64}$/);
  for (const privateValue of [row.qrToken, users[0].email, users[0].phone, users[0].passwordHash, 'qrToken']) assert.ok(!JSON.stringify(result.body).includes(privateValue));
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
  const list = await request('/tickets'); assert.equal(list.body.data.items[0].id, row.id); assert.ok(!JSON.stringify(list.body).includes('qrDataUrl'));
  assert.equal((await request(`/bookings/${row.bookingId}`)).body.data.booking.ticket.id, row.id);
});

test('all passenger ticket and PDF endpoints require authentication, role and ownership', async () => {
  const row = await paidTicket();
  for (const path of ['/tickets', `/tickets/${row.id}`, `/tickets/${row.id}/download`]) {
    for (const [cookie, expected] of [[null, 401], [cookies[2], 403], [cookies[3], 403]]) assert.equal((await request(path, { cookie })).status, expected);
  }
  for (const path of [`/tickets/${row.id}`, `/tickets/${row.id}/download`]) assert.equal((await request(path, { cookie: cookies[1] })).status, 404);
  assert.deepEqual((await request('/tickets', { cookie: cookies[1] })).body.data.items, []);
});

test('PDF downloads contain a complete document, embedded fonts and QR image without creating another ticket', async () => {
  const row = await paidTicket();
  const response = await fetch(`${base}/tickets/${row.id}/download`, { headers: { Cookie: cookies[0] } });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.match(response.headers.get('content-disposition'), new RegExp(`attachment; filename="RailConnect-${row.ticketNumber}.pdf"`));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const pdf = Buffer.from(await response.arrayBuffer()).toString('latin1');
  assert.ok(pdf.startsWith('%PDF-')); assert.ok(pdf.trimEnd().endsWith('%%EOF')); assert.match(pdf, /\/Subtype \/Image/); assert.match(pdf, /\/FontFile2/); assert.match(pdf, /\/Count 1\b/);
  await request(`/tickets/${row.id}`); assert.equal(await db.ticket.count({ where: { bookingId: row.bookingId } }), 1);
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).qrToken, row.qrToken);
});

test('verification is staff-only, validates input, requires CSRF header and returns no passenger details', async () => {
  const row = await paidTicket();
  assert.equal((await verify(row.qrToken, { cookie: null })).status, 401); assert.equal((await verify(row.qrToken, { cookie: cookies[0] })).status, 403);
  assert.equal((await verify(row.qrToken, { extraHeaders: { 'X-Requested-With': '' } })).status, 403);
  for (const token of ['short', 'g'.repeat(64), 'a'.repeat(65)]) assert.equal((await verify(token)).status, 422);
  assert.equal((await verify(row.qrToken, { body: { token: row.qrToken, status: 'VALID' } })).status, 422);
  for (const cookie of [cookies[2], cookies[3]]) {
    const result = await verify(row.qrToken, { cookie }); assert.equal(result.status, 200); assert.equal(result.body.data.valid, true);
    for (const value of [row.qrToken, users[0].fullName, users[0].email, users[0].phone]) assert.ok(!JSON.stringify(result.body).includes(value));
  }
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).status, 'VALID');
  assert.equal(await db.ticketScanLog.count({ where: { ticketId: row.id } }), 0);
});

test('unknown or altered tokens never validate', async () => {
  const row = await paidTicket(), modified = `${row.qrToken[0] === 'a' ? 'b' : 'a'}${row.qrToken.slice(1)}`;
  for (const token of [randomBytes(32).toString('hex'), modified]) {
    const result = await verify(token); assert.equal(result.body.data.valid, false); assert.equal(result.body.data.status, 'INVALID');
  }
});

for (const status of ['USED', 'CANCELLED', 'EXPIRED']) test(`${status} tickets are visible in the archive but never validate`, async () => {
  const row = await paidTicket(); await db.ticket.update({ where: { id: row.id }, data: { status, ...(status === 'USED' ? { usedAt: new Date() } : {}) } });
  const result = await verify(row.qrToken); assert.equal(result.body.data.valid, false); assert.equal(result.body.data.status, status);
  const detail = await request(`/tickets/${row.id}`); assert.equal(detail.body.data.ticket.status, status); assert.equal(detail.body.data.ticket.valid, false);
});

test('time expiry is enforced at read time without relying on a background worker', async () => {
  const row = await paidTicket();
  await db.ticket.update({ where: { id: row.id }, data: { issuedAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await verify(row.qrToken)).body.data.status, 'EXPIRED'); assert.equal((await request(`/tickets/${row.id}`)).body.data.ticket.status, 'EXPIRED');
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).status, 'VALID');
});

test('saved QR is revoked by refund, lost seat claim, or cancelled schedule in the current database', async () => {
  const row = await paidTicket(), b = await db.booking.findUnique({ where: { id: row.bookingId } });
  const p = await db.payment.findFirst({ where: { bookingId: b.id, status: 'PAID' } });
  await db.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED' } });
  assert.equal((await verify(row.qrToken)).body.data.status, 'CANCELLED');
  await db.payment.update({ where: { id: p.id }, data: { status: 'PAID' } });
  await db.scheduleSeat.update({ where: { id: b.scheduleSeatId }, data: { status: 'AVAILABLE' } });
  assert.equal((await verify(row.qrToken)).body.data.valid, false);
  await db.scheduleSeat.update({ where: { id: b.scheduleSeatId }, data: { status: 'BOOKED' } });
  await db.schedule.update({ where: { id: b.scheduleId }, data: { status: 'CANCELLED' } });
  try { assert.equal((await verify(row.qrToken)).body.data.status, 'CANCELLED'); }
  finally { await db.schedule.update({ where: { id: b.scheduleId }, data: { status: 'SCHEDULED' } }); }
  assert.equal((await verify(row.qrToken)).body.data.valid, true);
});

test('ticket list paginates without leaking another account and validates query parameters', async () => {
  const result = await request('/tickets?page=1&pageSize=2'); assert.equal(result.body.data.items.length, 2); assert.ok(result.body.data.pages > 1);
  const second = await request('/tickets?page=2&pageSize=2'); assert.ok(second.body.data.items.every(t => !result.body.data.items.some(first => first.id === t.id)));
  for (const query of ['page=0', 'pageSize=51', 'userId=forged']) assert.equal((await request(`/tickets?${query}`)).status, 422);
  assert.deepEqual((await request('/tickets?page=1000')).body.data.items, []);
});

test('issued tickets keep unique numbers and cryptographic tokens, protected by database constraints', async () => {
  const rows = await db.ticket.findMany({ where: { booking: { userId: users[0].id } } });
  assert.equal(new Set(rows.map(r => r.qrToken)).size, rows.length); assert.equal(new Set(rows.map(r => r.ticketNumber)).size, rows.length);
  for (const row of rows) assert.match(row.qrToken, /^[a-f0-9]{64}$/);
  await assert.rejects(db.ticket.update({ where: { id: rows[1].id }, data: { qrToken: rows[0].qrToken } }), error => error.code === 'P2002');
  await assert.rejects(db.ticket.update({ where: { id: rows[1].id }, data: { ticketNumber: rows[0].ticketNumber } }), error => error.code === 'P2002');
});
