import bcrypt from 'bcrypt';
import { createDatabaseClient } from '../src/config/database.js';
import { demoRoutes, demoStations, demoTrains, demoUsers } from './demo-data.js';

if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Demo seeding requires ALLOW_DEMO_SEED=true and a non-production environment.');
}

for (const { passwordVariable } of demoUsers) {
  const password = process.env[passwordVariable] ?? '';
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^\w\s]/.test(password)) {
    throw new Error(`${passwordVariable} must be 12+ characters with upper/lowercase, a number and a symbol, and at most 72 UTF-8 bytes.`);
  }
}

const dateValue = process.env.DEMO_START_DATE;
const start = dateValue ? new Date(`${dateValue}T00:00:00.000Z`) : new Date();
if (!dateValue) { start.setUTCDate(start.getUTCDate() + 1); start.setUTCHours(0, 0, 0, 0); }
if (!Number.isFinite(start.getTime()) || (dateValue && (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || start.toISOString().slice(0, 10) !== dateValue))) {
  throw new Error('DEMO_START_DATE must be a valid YYYY-MM-DD date.');
}

const prisma = createDatabaseClient();

async function preserveOrCreate(model, where, data) {
  const existing = await model.findUnique({ where });
  if (existing && !existing.isDemo) throw new Error('A seed key conflicts with non-demo data; no data was changed.');
  return model.upsert({ where, update: {}, create: { ...data, isDemo: true } });
}

try {
  const hashes = await Promise.all(demoUsers.map(user => bcrypt.hash(process.env[user.passwordVariable], 12)));
  const result = await prisma.$transaction(async (tx) => {
    for (const [index, { passwordVariable, ...user }] of demoUsers.entries()) {
      await preserveOrCreate(tx.user, { email: user.email }, { ...user, passwordHash: hashes[index] });
    }

    const stations = new Map();
    for (const station of demoStations) {
      stations.set(station.code, await preserveOrCreate(tx.station, { code: station.code }, station));
    }

    const trains = new Map();
    const seats = new Map();
    for (const trainData of demoTrains) {
      const train = await preserveOrCreate(tx.train, { code: trainData.code }, trainData);
      trains.set(train.code, train);
      const trainSeats = [];
      for (let number = 1; number <= trainData.capacity; number++) {
        const seatNumber = `${number <= 4 ? 'B' : 'E'}${String(number <= 4 ? number : number - 4).padStart(2, '0')}`;
        trainSeats.push(await tx.seat.upsert({
          where: { trainId_seatNumber: { trainId: train.id, seatNumber } }, update: {},
          create: { trainId: train.id, seatNumber, seatClass: number <= 4 ? 'BUSINESS' : 'ECONOMY' },
        }));
      }
      seats.set(train.id, trainSeats);
    }

    let createdSchedules = 0;
    for (const [routeIndex, definition] of demoRoutes.entries()) {
      const originStationId = stations.get(definition.origin).id;
      const destinationStationId = stations.get(definition.destination).id;
      const route = await preserveOrCreate(tx.route, {
        originStationId_destinationStationId: { originStationId, destinationStationId },
      }, { originStationId, destinationStationId, distanceKm: definition.distanceKm, estimatedDuration: definition.estimatedDuration });
      const train = trains.get(definition.train);
      for (let day = 0; day < 3; day++) {
        const departureTime = new Date(start);
        departureTime.setUTCDate(departureTime.getUTCDate() + day);
        departureTime.setUTCHours(definition.hourUtc);
        const id = `demo-schedule-${routeIndex + 1}-${day + 1}`;
        if (!(await tx.schedule.findUnique({ where: { id } }))) createdSchedules++;
        const schedule = await preserveOrCreate(tx.schedule, { id }, {
          id, trainId: train.id, routeId: route.id, departureTime,
          arrivalTime: new Date(departureTime.getTime() + definition.estimatedDuration * 60000),
          fareEconomy: definition.economy, fareBusiness: definition.business,
        });
        if (schedule.trainId !== train.id || schedule.routeId !== route.id) {
          throw new Error('An existing demo schedule has different relationships; review it before seeding.');
        }
        await tx.scheduleSeat.createMany({
          data: seats.get(train.id).map(seat => ({ scheduleId: schedule.id, seatId: seat.id, trainId: train.id })),
          skipDuplicates: true,
        });
      }
    }
    return { createdSchedules };
  }, { maxWait: 10000, timeout: 60000 });

  console.info('DEMONSTRATION DATA ONLY — not official Nigerian Railway Corporation schedules, fares or operational data.');
  console.info(`Seed complete. ${result.createdSchedules} schedules created; existing data and passwords preserved.`);
  console.info('Demo accounts: admin@trainapp.test, officer@trainapp.test, passenger@trainapp.test.');
  console.info('Passwords come from server/.env. Authentication is not implemented in Phase 2.');
} finally {
  await prisma.$disconnect();
}
