import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { createDatabaseClient } from '../src/config/database.js';
import { demoStations, demoTrains, demoUsers, expectedDemoCounts } from './demo-data.js';

const prisma = createDatabaseClient();
try {
  const users = await prisma.user.findMany({ where: { email: { in: demoUsers.map(user => user.email) } } });
  const stations = await prisma.station.findMany({ where: { code: { in: demoStations.map(station => station.code) } } });
  const trains = await prisma.train.findMany({ where: { code: { in: demoTrains.map(train => train.code) } }, include: { seats: true } });
  const schedules = await prisma.schedule.findMany({
    where: { id: { startsWith: 'demo-schedule-' } },
    include: { route: true, scheduleSeats: { include: { seat: true } } },
  });
  const counts = {
    users: users.length, stations: stations.length,
    routes: await prisma.route.count({ where: { isDemo: true } }), trains: trains.length,
    seats: trains.reduce((sum, train) => sum + train.seats.length, 0), schedules: schedules.length,
    scheduleSeats: schedules.reduce((sum, schedule) => sum + schedule.scheduleSeats.length, 0),
  };
  assert.deepEqual(counts, expectedDemoCounts);
  for (const definition of demoUsers) {
    const user = users.find(user => user.email === definition.email);
    assert.equal(user.role, definition.role);
    assert.equal(user.isDemo, true);
    assert.match(user.passwordHash, /^\$2[aby]\$12\$/);
    if (process.env[definition.passwordVariable]) {
      assert.ok(await bcrypt.compare(process.env[definition.passwordVariable], user.passwordHash), `Password does not match ${definition.email}; seeding preserves existing hashes.`);
    }
  }
  for (const train of trains) assert.equal(train.capacity, train.seats.length);
  for (const schedule of schedules) {
    assert.equal(schedule.isDemo, true);
    assert.equal(schedule.route.isDemo, true);
    assert.notEqual(schedule.route.originStationId, schedule.route.destinationStationId);
    assert.ok(schedule.arrivalTime > schedule.departureTime);
    const train = trains.find(train => train.id === schedule.trainId);
    assert.equal(schedule.scheduleSeats.length, train.capacity);
    for (const row of schedule.scheduleSeats) {
      assert.equal(row.trainId, schedule.trainId);
      assert.equal(row.seat.trainId, schedule.trainId);
    }
  }
  const [{ version }] = await prisma.$queryRaw`SELECT VERSION() AS version`;
  console.info(JSON.stringify({ result: 'passed', database: `MySQL ${version}`, label: 'DEMONSTRATION DATA', counts, datesUtc: schedules.map(s => s.departureTime.toISOString()).sort() }, null, 2));
} finally {
  await prisma.$disconnect();
}
