import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { createDatabaseClient } from '../src/config/database.js';
import { railwayDate } from '../src/services/search.service.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DB_TESTS !== 'true') throw new Error('Recommendation integration tests require ALLOW_DB_TESTS=true and a non-production database.');
const db = createDatabaseClient(), tag = randomBytes(5).toString('hex').toUpperCase();
const date = railwayDate(new Date(Date.now() + 15 * 86400000));
const stationIds = [], trainIds = [], scheduleIds = [], byName = {};
let route, server, base;
const definitions = [['cheap', 100, 8, 300, 1], ['early', 500, 6, 200, 4], ['fast', 600, 10, 60, 3], ['seats', 700, 12, 180, 20], ['balanced', 250, 7, 90, 15], ['sold', 0, 1, 1, 0]];
before(async () => {
  for (const suffix of ['A', 'B']) { const station = await db.station.create({ data: { name: `Recommendation ${tag} ${suffix}`, code: `${tag}-${suffix}`, city: 'Test', state: 'Test' } }); stationIds.push(station.id); }
  route = await db.route.create({ data: { originStationId: stationIds[0], destinationStationId: stationIds[1], distanceKm: '100', estimatedDuration: 90 } });
  for (const [name, price, hour, minutes, seats] of definitions) {
    const train = await db.train.create({ data: { name: `Recommendation ${name}`, code: `${tag}-${name}`, capacity: Math.max(seats, 1) } }); trainIds.push(train.id);
    const departureTime = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+01:00`);
    const schedule = await db.schedule.create({ data: { trainId: train.id, routeId: route.id, departureTime, arrivalTime: new Date(departureTime.getTime() + minutes * 60000), fareEconomy: price.toFixed(2), fareBusiness: '1500.00' } }); scheduleIds.push(schedule.id); byName[name] = schedule.id;
    for (let i = 0; i < seats; i++) { const seat = await db.seat.create({ data: { trainId: train.id, seatNumber: `E${i}`, seatClass: 'ECONOMY' } }); await db.scheduleSeat.create({ data: { scheduleId: schedule.id, seatId: seat.id, trainId: train.id } }); }
  }
  server = createApp({ database: db }).listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/schedules/search`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try { await db.$transaction(async tx => {
    await tx.scheduleSeat.deleteMany({ where: { scheduleId: { in: scheduleIds } } }); await tx.schedule.deleteMany({ where: { id: { in: scheduleIds } } });
    await tx.seat.deleteMany({ where: { trainId: { in: trainIds } } }); await tx.train.deleteMany({ where: { id: { in: trainIds } } });
    if (route) await tx.route.delete({ where: { id: route.id } }); await tx.station.deleteMany({ where: { id: { in: stationIds } } });
  }); } finally { await db.$disconnect(); }
});
async function search(params = {}) {
  const response = await fetch(`${base}?${new URLSearchParams({ originId: stationIds[0], destinationId: stationIds[1], date, ...params })}`); return { status: response.status, body: await response.json() };
}
test('default Best Overall ranks a balanced database journey above all single-factor winners', async () => {
  const { status, body } = await search(); assert.equal(status, 200); assert.equal(body.data.items[0].id, byName.balanced); assert.equal(body.data.items[0].recommendation.score, 78.84);
  assert.equal(body.data.recommendation.preference, 'BEST_OVERALL'); assert.equal(body.data.recommendation.eligibleCount, 5); assert.equal(body.data.total, 6);
});
test('each validated preference changes the winning schedule through the public API', async () => {
  for (const [preference, name] of [['CHEAPEST', 'cheap'], ['EARLIEST', 'early'], ['FASTEST', 'fast'], ['MOST_SEATS_AVAILABLE', 'seats']]) {
    const { body } = await search({ preference }); assert.equal(body.data.items[0].id, byName[name]); assert.ok(body.data.items[0].recommendation.isRecommended); assert.ok(body.data.items[0].recommendation.explanation);
  }
});
test('ranking and normalization use the complete set before pagination', async () => {
  const all = (await search()).body.data; const pages = [];
  for (let page = 1; page <= 6; page++) {
    const result = (await search({ page, pageSize: 1 })).body.data; assert.deepEqual(result.recommendation, all.recommendation); pages.push(result.items[0]);
  }
  assert.deepEqual(pages, all.items); assert.equal(pages[0].id, byName.balanced); assert.equal(pages.at(-1).id, byName.sold); assert.equal(pages.at(-1).recommendation.score, null);
});
test('invalid preferences, duplicate preferences and client-supplied weights are rejected', async () => {
  for (const params of [{ preference: 'LOWEST_PRICE' }, { priceWeight: '1' }, { preference: '' }]) assert.equal((await search(params)).status, 422);
  const response = await fetch(`${base}?${new URLSearchParams({ originId: stationIds[0], destinationId: stationIds[1], date })}&preference=CHEAPEST&preference=FASTEST`); assert.equal(response.status, 422);
});
test('cancelled and sold-out bargains never become recommendations', async () => {
  await db.schedule.update({ where: { id: byName.cheap }, data: { status: 'CANCELLED' } });
  const { body } = await search({ preference: 'CHEAPEST' }); assert.equal(body.data.items[0].id, byName.balanced); assert.ok(!body.data.items.some(row => row.id === byName.cheap)); assert.equal(body.data.items.at(-1).id, byName.sold);
  await db.schedule.update({ where: { id: byName.cheap }, data: { status: 'SCHEDULED' } });
});
test('a change in real seat availability changes the next recommendation', async () => {
  await db.scheduleSeat.updateMany({ where: { scheduleId: byName.seats }, data: { status: 'BLOCKED' } });
  const { body } = await search({ preference: 'MOST_SEATS_AVAILABLE' }); assert.equal(body.data.items[0].id, byName.balanced); assert.equal(body.data.recommendation.eligibleCount, 4);
  assert.equal(body.data.items.find(row => row.id === byName.seats).recommendation.score, null);
});
test('no matching journeys produces empty recommendations with finite serializable metadata', async () => {
  const { status, body } = await search({ originId: stationIds[1], destinationId: stationIds[0] }); assert.equal(status, 200); assert.deepEqual(body.data.items, []); assert.equal(body.data.recommendation.eligibleCount, 0); assert.equal(body.data.recommendation.ranges, null);
});
