import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import bcrypt from 'bcrypt';
import assert from 'node:assert/strict';
import { createApp } from '../../src/app.js';
import { createDatabaseClient } from '../../src/config/database.js';
import { env } from '../../src/config/env.js';

export async function systemFixture({ host = '127.0.0.1', worker = false } = {}) {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('System tests require ALLOW_DB_TESTS=true and a non-production database.');
  const db = createDatabaseClient(), tag = `E2E${randomBytes(5).toString('hex').toUpperCase()}`;
  const password = `Test!${randomBytes(14).toString('hex')}Q9`, users = [], cookies = {};
  const ids = { stations: [], routes: [], trains: [], seats: [], schedules: [] };
  const app = createApp({ database: db, authRateLimits: { loginLimit: 100, registrationLimit: 100 }, paymentConfig: { enabled: true, scenario: 'SUCCESS' } });
  const server = app.listen(0, host); await once(server, 'listening');
  const base = `http://${host}:${server.address().port}/api`;
  const headers = { Origin: env.clientUrls[0], 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  const request = async (path, { role = 'ADMIN', body, method = body === undefined ? 'GET' : 'POST', extraHeaders = {} } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(cookies[role] ? { Cookie: cookies[role] } : {}), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const login = async role => {
    const user = users.find(user => user.role === role);
    const result = await request('/auth/login', { role: '', body: { email: user.email, password } });
    assert.equal(result.status, 200, result.body.message); cookies[role] = result.headers.get('set-cookie').split(';')[0]; return result;
  };
  const create = async (resource, body) => {
    const result = await request(`/admin/${resource}`, { body }); assert.equal(result.status, 201, result.body.message);
    ids[resource].push(result.body.data.id); return result.body.data;
  };
  async function cleanup() {
    await app.locals.disconnectDatabase();
    await new Promise(resolve => server.close(resolve));
    try {
      // Track registered browser accounts by this random test-only email domain too.
      const userIds = (await db.user.findMany({ where: { email: { endsWith: `@${tag}.test` } }, select: { id: true } })).map(row => row.id);
      // Include this fixture's uniquely tagged records created through browser forms.
      ids.stations = (await db.station.findMany({ where: { code: { startsWith: tag } }, select: { id: true } })).map(row => row.id);
      ids.trains = (await db.train.findMany({ where: { code: { startsWith: tag } }, select: { id: true } })).map(row => row.id);
      ids.routes = (await db.route.findMany({ where: { originStationId: { in: ids.stations }, destinationStationId: { in: ids.stations } }, select: { id: true } })).map(row => row.id);
      ids.schedules = (await db.schedule.findMany({ where: { trainId: { in: ids.trains } }, select: { id: true } })).map(row => row.id);
      await db.$transaction(async tx => {
        const bookingIds = (await tx.booking.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map(row => row.id);
        const payments = (await tx.payment.findMany({ where: { bookingId: { in: bookingIds } }, select: { id: true } })).map(row => row.id);
        const tickets = (await tx.ticket.findMany({ where: { bookingId: { in: bookingIds } }, select: { id: true } })).map(row => row.id);
        const alerts = (await tx.fraudAlert.findMany({ where: { OR: [{ userId: { in: userIds } }, { bookingId: { in: bookingIds } }, { reviewedBy: { in: userIds } }] }, select: { id: true } })).map(row => row.id);
        await tx.fraudAlert.deleteMany({ where: { id: { in: alerts } } });
        await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: [...bookingIds, ...payments, ...tickets, ...alerts, ...Object.values(ids).flat()] } }] } });
        await tx.ticketScanLog.deleteMany({ where: { OR: [{ officerId: { in: userIds } }, { ticketId: { in: tickets } }] } });
        await tx.ticket.deleteMany({ where: { id: { in: tickets } } });
        await tx.payment.deleteMany({ where: { id: { in: payments } } });
        await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
        await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: ids.schedules } } });
        await tx.schedule.deleteMany({ where: { id: { in: ids.schedules } } });
        await tx.seat.deleteMany({ where: { trainId: { in: ids.trains } } });
        await tx.train.deleteMany({ where: { id: { in: ids.trains } } });
        await tx.route.deleteMany({ where: { id: { in: ids.routes } } });
        await tx.station.deleteMany({ where: { id: { in: ids.stations } } });
        await tx.authSession.deleteMany({ where: { userId: { in: userIds } } });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { timeout: 15000 });
    } finally { await db.$disconnect(); }
  }
  try {
    const hash = await bcrypt.hash(password, 4);
    for (const [index, role] of ['ADMIN', 'TICKET_OFFICER'].entries()) {
      users.push(await db.user.create({ data: { fullName: `${tag} ${role}`, email: `${role}@${tag}.test`, phone: `+9${index}${BigInt(`0x${tag.slice(3)}`)}`, passwordHash: hash, role } }));
      await login(role);
    }
    const stations = [];
    for (const code of ['A', 'B']) stations.push(await create('stations', { name: `${tag} Station ${code}`, code: `${tag}-${code}`, city: 'Test City', state: 'Test State', status: 'ACTIVE' }));
    const route = await create('routes', { originStationId: stations[0].id, destinationStationId: stations[1].id, distanceKm: '150', estimatedDuration: 90, status: 'ACTIVE' });
    const train = await create('trains', { name: `${tag} Demonstration Train`, code: tag, capacity: 8, status: 'ACTIVE' });
    const seats = [];
    for (let index = 0; index < 8; index++) seats.push(await create('seats', { trainId: train.id, seatNumber: `E${index + 1}`, seatClass: 'ECONOMY', status: 'ACTIVE' }));
    const schedules = [];
    for (let index = 0; index < 2; index++) {
      const departure = new Date(Date.now() + (index + 1) * 86400000);
      schedules.push(await create('schedules', { trainId: train.id, routeId: route.id, departureTime: departure.toISOString(), arrivalTime: new Date(departure.getTime() + 5400000).toISOString(), fareEconomy: '2500.50', fareBusiness: '5000.00', status: 'SCHEDULED' }));
    }
    if (worker) app.locals.startPaymentWorker();
    return { db, app, server, base, tag, password, users, cookies, ids, request, login, create, stations, route, train, seats, schedules, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
