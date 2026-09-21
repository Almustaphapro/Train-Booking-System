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
import { confirmBoarding } from '../src/officer/officer.service.js';
import { railwayDate } from '../src/services/search.service.js';


if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Officer tests require ALLOW_DB_TESTS=true and a non-production database.');
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
  for (const [index, role] of ['PASSENGER', 'PASSENGER', 'ADMIN', 'TICKET_OFFICER', 'TICKET_OFFICER'].entries()) {
    const user = await db.user.create({ data: { fullName: `Ọlá Adéyẹmí ${index}`, email: `${index}@ticket-${tag}.test`, phone: `+8${index}${BigInt(`0x${tag}`)}`, passwordHash: 'unused-test-hash', role } }); users.push(user);
    const session = await db.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } }); cookies.push(`${config.cookieName}=${signSession(session, config)}`);
  }
  for (const suffix of ['A', 'B']) stations.push(await db.station.create({ data: { name: `Booking ${tag} ${suffix}`, code: `${tag}-${suffix}`, city: 'Test', state: 'Test' } }));
  route = await db.route.create({ data: { originStationId: stations[0].id, destinationStationId: stations[1].id, distanceKm: '100', estimatedDuration: 90 } });
  train = await db.train.create({ data: { name: `Booking ${tag}`, code: tag, capacity: 36 } });
  for (let i = 0; i < 36; i++) seats.push(await db.seat.create({ data: { trainId: train.id, seatNumber: `S${i + 1}`, seatClass: i === 1 ? 'BUSINESS' : 'ECONOMY', status: 'ACTIVE' } }));
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
    await tx.ticketScanLog.deleteMany({ where: { officerId: { in: users.map(row => row.id) } } });
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

const verify = (rowOrEntry, options = {}) => request('/officer/verify', { cookie: cookies[3], body: { entry: typeof rowOrEntry === 'string' ? rowOrEntry : rowOrEntry.qrToken, scheduleId: schedules[0].id }, ...options });
const board = (verificationId, options = {}) => request('/officer/board', { cookie: cookies[3], body: { verificationId }, ...options });
async function validCheck(row, options) { const result = await verify(row, options); assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.data.status, 'VALID'); return result.body.data; }

test('officer APIs enforce authentication and exact role without granting admin management access', async () => {
  for (const [cookie, expected] of [[null, 401], [cookies[0], 403], [cookies[2], 403]]) {
    for (const path of ['/officer/activity', `/officer/schedules?date=${railwayDate(schedules[0].departureTime)}`]) assert.equal((await request(path, { cookie })).status, expected);
    assert.equal((await verify('a'.repeat(64), { cookie })).status, expected); assert.equal((await board('missing', { cookie })).status, expected);
  }
  assert.equal((await request('/admin/stations', { cookie: cookies[3] })).status, 403);
  assert.equal((await request('/admin/trains', { cookie: cookies[3], body: {} })).status, 403);
  assert.equal((await request('/bookings', { cookie: cookies[3] })).status, 403);
});

test('schedules are database-backed and date-validated; activity begins empty for a new officer', async () => {
  const response = await request(`/officer/schedules?date=${railwayDate(schedules[0].departureTime)}`, { cookie: cookies[3] });
  assert.equal(response.status, 200); assert.ok(response.body.data.items.some(s => s.id === schedules[0].id && s.boardable));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const query of ['date=2026-02-30', '', 'date=2026-09-21&userId=forged']) assert.equal((await request(`/officer/schedules?${query}`, { cookie: cookies[3] })).status, 422);
  const empty = await request('/officer/activity', { cookie: cookies[3] }); assert.deepEqual(empty.body.data.recent, []); assert.equal(empty.body.data.boarded, 0);
});

test('strict validation and CSRF prevent injected status, passenger, timestamp and unrelated booking changes', async () => {
  const row = await paidTicket();
  assert.equal((await verify(row, { extraHeaders: { 'X-Requested-With': '' } })).status, 403);
  for (const body of [{ entry: row.qrToken }, { entry: { token: row.qrToken }, scheduleId: schedules[0].id }, { entry: row.qrToken, scheduleId: schedules[0].id, status: 'USED' }]) assert.equal((await verify(row, { body })).status, 422);
  assert.equal((await verify(row, { body: { entry: row.qrToken, scheduleId: 'missing' } })).status, 404);
  const v = await validCheck(row);
  for (const extra of [{ ticketId: row.id }, { usedAt: '2000-01-01' }, { bookingStatus: 'CONFIRMED' }, { officerId: users[4].id }, { scheduleId: schedules[1].id }]) assert.equal((await board(v.verificationId, { body: { verificationId: v.verificationId, ...extra } })).status, 422);
  assert.equal((await board(v.verificationId, { extraHeaders: { 'X-Requested-With': '' } })).status, 403);
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).usedAt, null);
});

test('valid QR and manual ticket number checks return only necessary information and create fingerprint-only logs', async () => {
  const row = await paidTicket();
  for (const entry of [row.qrToken, ` ${row.ticketNumber.toLowerCase()} `]) {
    const v = await validCheck(entry); assert.equal(v.valid, true); assert.equal(v.ticket.passengerName, users[0].fullName); assert.equal(v.usedAt, null); assert.ok(new Date(v.confirmBefore) > new Date(v.checkedAt));
    for (const value of [row.qrToken, users[0].email, users[0].phone, 'passwordHash', 'fare', 'bookingReference']) assert.ok(!JSON.stringify(v).includes(value));
    const log = await db.ticketScanLog.findUnique({ where: { id: v.verificationId } }); assert.equal(log.result, 'VALID'); assert.equal(log.officerId, users[3].id); assert.equal(log.scheduleId, schedules[0].id); assert.match(log.tokenFingerprint, /^[a-f0-9]{64}$/); assert.notEqual(log.tokenFingerprint, row.qrToken); assert.ok(!JSON.stringify(log).includes(row.qrToken));
  }
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).status, 'VALID');
});

test('unrecognized token or ticket number records INVALID without leaking passenger information', async () => {
  for (const entry of [randomBytes(32).toString('hex'), 'TKT-UNKNOWN-NUMBER']) {
    const result = await verify(entry); assert.equal(result.body.data.status, 'INVALID'); assert.equal(result.body.data.ticket, null); assert.equal(result.body.data.verificationId, null);
  }
  assert.equal(await db.ticketScanLog.count({ where: { officerId: users[3].id, result: 'INVALID', ticketId: null } }), 2);
});

test('pending and failed bookings cannot produce a valid boarding result', async () => {
  const b = await reserveNext(); assert.equal(await payBooking(b, 'FAILURE'), null);
  assert.equal((await verify(b.bookingReference, { body: { entry: b.bookingReference, scheduleId: schedules[0].id } })).body.data.status, 'INVALID');
  assert.equal((await board(b.id)).status, 404);
});

test('wrong schedule is rejected and logged without issuing a boarding confirmation', async () => {
  const row = await paidTicket(); const result = await verify(row, { body: { entry: row.qrToken, scheduleId: schedules[1].id } });
  assert.equal(result.body.data.status, 'WRONG_SCHEDULE'); assert.equal(result.body.data.verificationId, null);
  const log = await db.ticketScanLog.findFirst({ where: { ticketId: row.id } }); assert.equal(log.result, 'REJECTED'); assert.equal(log.scheduleId, schedules[1].id);
});

test('confirmed boarding changes only ticket usage, writes BOARDED log and audit atomically', async () => {
  const row = await paidTicket(), v = await validCheck(row);
  const before = await db.booking.findUnique({ where: { id: row.bookingId }, include: { payments: true, activeSeat: true } });
  const result = await board(v.verificationId); assert.equal(result.status, 200); assert.equal(result.body.data.status, 'BOARDED'); assert.ok(result.body.data.usedAt);
  const stored = await db.ticket.findUnique({ where: { id: row.id } }); assert.equal(stored.status, 'USED'); assert.equal(stored.usedAt.toISOString(), result.body.data.usedAt);
  assert.deepEqual(await db.booking.findUnique({ where: { id: row.bookingId }, include: { payments: true, activeSeat: true } }), before);
  assert.equal(await db.ticketScanLog.count({ where: { ticketId: row.id, result: 'BOARDED', officerId: users[3].id } }), 1);
  assert.equal(await db.auditLog.count({ where: { entityId: row.id, action: 'TICKET_BOARDED' } }), 1);
});

test('repeated scan and confirmation return ALREADY_USED with the original timestamp and log both attempts', async () => {
  const row = await paidTicket(), v = await validCheck(row), first = await board(v.verificationId);
  for (const result of [await verify(row), await board(v.verificationId)]) { assert.equal(result.body.data.status, 'ALREADY_USED'); assert.equal(result.body.data.usedAt, first.body.data.usedAt); }
  assert.equal(await db.ticketScanLog.count({ where: { ticketId: row.id, result: 'ALREADY_USED' } }), 2);
  assert.equal(await db.ticketScanLog.count({ where: { ticketId: row.id, result: 'BOARDED' } }), 1);
});

test('CRITICAL: simultaneous boarding by two officers yields one success and one already-used conflict', async () => {
  const row = await paidTicket();
  const [a, b] = await Promise.all([validCheck(row), validCheck(row, { cookie: cookies[4] })]);
  const results = await Promise.all([board(a.verificationId), board(b.verificationId, { cookie: cookies[4] })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.deepEqual(results.map(r => r.body.data.status).sort(), ['ALREADY_USED', 'BOARDED']);
  assert.equal(results[0].body.data.usedAt, results[1].body.data.usedAt);
  assert.equal(await db.ticketScanLog.count({ where: { ticketId: row.id, result: 'BOARDED' } }), 1);
  assert.equal(await db.ticketScanLog.count({ where: { ticketId: row.id, result: 'ALREADY_USED' } }), 1);
});

test('officers cannot confirm someone else’s verification or an unverified ticket', async () => {
  const row = await paidTicket(), v = await validCheck(row);
  assert.equal((await board(v.verificationId, { cookie: cookies[4] })).status, 404); assert.equal((await board(row.id)).status, 404);
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).status, 'VALID');
});

test('expired verification requires a fresh check and cannot board', async () => {
  const row = await paidTicket(), v = await validCheck(row);
  await db.ticketScanLog.update({ where: { id: v.verificationId }, data: { scannedAt: new Date(Date.now() - 121000) } });
  const result = await board(v.verificationId); assert.equal(result.status, 409); assert.equal(result.body.data.status, 'VERIFICATION_EXPIRED');
  assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).usedAt, null);
});

for (const status of ['CANCELLED', 'EXPIRED', 'USED']) test(`${status} tickets cannot be verified for boarding`, async () => {
  const row = await paidTicket(); await db.ticket.update({ where: { id: row.id }, data: { status, ...(status === 'USED' ? { usedAt: new Date() } : {}) } });
  const result = await verify(row); assert.equal(result.body.data.status, status === 'USED' ? 'ALREADY_USED' : status); assert.equal(result.body.data.valid, false); assert.equal(result.body.data.verificationId, null);
});

test('schedule cancellation, completion, departure status and passed departure time reject boarding', async () => {
  const row = await paidTicket();
  for (const [status, expected] of [['CANCELLED', 'CANCELLED'], ['COMPLETED', 'EXPIRED'], ['DEPARTED', 'SCHEDULE_CLOSED']]) {
    await db.schedule.update({ where: { id: schedules[0].id }, data: { status } });
    try { assert.equal((await verify(row)).body.data.status, expected); }
    finally { await db.schedule.update({ where: { id: schedules[0].id }, data: { status: 'SCHEDULED' } }); }
  }
  await db.schedule.update({ where: { id: schedules[0].id }, data: { departureTime: new Date(Date.now() - 1000) } });
  try { assert.equal((await verify(row)).body.data.status, 'SCHEDULE_CLOSED'); }
  finally { await db.schedule.update({ where: { id: schedules[0].id }, data: { departureTime: schedules[0].departureTime } }); }
});

test('BOARDING schedule allows verification and confirmation', async () => {
  const row = await paidTicket(); await db.schedule.update({ where: { id: schedules[0].id }, data: { status: 'BOARDING' } });
  try { const v = await validCheck(row); assert.equal((await board(v.verificationId)).status, 200); }
  finally { await db.schedule.update({ where: { id: schedules[0].id }, data: { status: 'SCHEDULED' } }); }
});

test('confirmation rechecks cancellation, payment, expiry and seat after a green verification', async () => {
  for (const mutation of ['cancel', 'payment', 'expiry', 'seat', 'departure']) {
    const row = await paidTicket(), v = await validCheck(row), b = await db.booking.findUnique({ where: { id: row.bookingId } });
    if (mutation === 'cancel') await db.ticket.update({ where: { id: row.id }, data: { status: 'CANCELLED' } });
    if (mutation === 'payment') await db.payment.updateMany({ where: { bookingId: row.bookingId }, data: { status: 'REFUNDED' } });
    if (mutation === 'expiry') await db.ticket.update({ where: { id: row.id }, data: { issuedAt: new Date(Date.now() - 60000), expiresAt: new Date(Date.now() - 1000) } });
    if (mutation === 'seat') await db.scheduleSeat.update({ where: { id: b.scheduleSeatId }, data: { status: 'AVAILABLE' } });
    if (mutation === 'departure') await db.schedule.update({ where: { id: b.scheduleId }, data: { status: 'DEPARTED' } });
    try { const result = await board(v.verificationId); assert.equal(result.status, 409, mutation); assert.notEqual(result.body.data.status, 'BOARDED'); assert.equal((await db.ticket.findUnique({ where: { id: row.id } })).usedAt, null); }
    finally { if (mutation === 'departure') await db.schedule.update({ where: { id: b.scheduleId }, data: { status: 'SCHEDULED' } }); }
  }
});

test('booking confirmation and paid amount/currency are checked against current records', async () => {
  const row = await paidTicket(), p = await db.payment.findFirst({ where: { bookingId: row.bookingId } });
  await db.booking.update({ where: { id: row.bookingId }, data: { bookingStatus: 'PENDING' } });
  assert.equal((await verify(row)).body.data.valid, false);
  await db.booking.update({ where: { id: row.bookingId }, data: { bookingStatus: 'CONFIRMED', paymentStatus: 'FAILED' } });
  assert.equal((await verify(row)).body.data.valid, false);
  await db.booking.update({ where: { id: row.bookingId }, data: { paymentStatus: 'PAID' } });
  await db.payment.update({ where: { id: p.id }, data: { amount: '1.00' } }); assert.equal((await verify(row)).body.data.valid, false);
  await db.payment.update({ where: { id: p.id }, data: { amount: p.amount, currency: 'USD' } }); assert.equal((await verify(row)).body.data.valid, false);
});

test('scan-log storage failure rolls back ticket use and boarding audit together', async () => {
  const row = await paidTicket(), v = await validCheck(row), failure = new Error('Injected scan-log failure');
  const failingDb = { $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, { get(target, key) { return key === 'ticketScanLog' ? new Proxy(target.ticketScanLog, { get(model, field) { return field === 'create' ? () => { throw failure; } : model[field]; } }) : target[key]; } })), options) };
  await assert.rejects(confirmBoarding(failingDb, users[3].id, v.verificationId, '127.0.0.1'), error => error === failure);
  const stored = await db.ticket.findUnique({ where: { id: row.id } }); assert.equal(stored.status, 'VALID'); assert.equal(stored.usedAt, null);
  assert.equal(await db.auditLog.count({ where: { entityId: row.id, action: 'TICKET_BOARDED' } }), 0);
});

test('dashboard shows only the requesting officer’s activity without raw tokens or passenger contact details', async () => {
  const result = await request('/officer/activity', { cookie: cookies[4] }); assert.equal(result.status, 200);
  const ids = result.body.data.recent.map(r => r.id), own = await db.ticketScanLog.findMany({ where: { officerId: users[4].id }, select: { id: true } });
  assert.ok(ids.every(id => own.some(r => r.id === id))); assert.ok(result.body.data.recent.length <= 20);
  for (const field of ['tokenFingerprint', 'qrToken', 'email', 'phone', 'passengerName']) assert.ok(!JSON.stringify(result.body).includes(field));
});
