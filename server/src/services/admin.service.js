import { ApiError } from '../utils/ApiError.js';

export const resources = { stations: 'station', routes: 'route', trains: 'train', seats: 'seat', schedules: 'schedule' };
const routeInclude = { originStation: true, destinationStation: true };
const includes = {
  stations: { _count: { select: { originatingRoutes: true, arrivingRoutes: true } } },
  routes: { ...routeInclude, _count: { select: { schedules: true } } },
  trains: { _count: { select: { seats: true, schedules: true } } },
  seats: { train: true, _count: { select: { scheduleSeats: true } } },
  schedules: { train: true, route: { include: routeInclude }, _count: { select: { scheduleSeats: true, bookings: true } } },
};
const conflict = message => { throw new ApiError(409, message); };
const upcoming = () => ({ status: { in: ['SCHEDULED', 'BOARDING'] }, departureTime: { gt: new Date() } });
async function requireRow(tx, model, id) {
  const row = await tx[model].findUnique({ where: { id } });
  if (!row) throw new ApiError(404, 'The requested record was not found.');
  return row;
}

// Serializable transactions protect capacity, seat propagation and overlap checks
// from concurrent administrator edits. Retry only serialization/deadlock failures.
export async function adminTransaction(db, work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 10000 }); }
    catch (error) {
      if (error.code === 'P2034' && attempt < 2) continue;
      if (error.code === 'P2002') conflict('A record with those unique details already exists.');
      if (error.code === 'P2003') conflict('This record is still referenced. Deactivate it or remove unused dependent records first.');
      if (error.code === 'P2025') throw new ApiError(404, 'The requested record was not found.');
      if (error.code === 'P2034') conflict('Another administrator changed this data. Refresh and try again.');
      throw error;
    }
  }
}
export async function listRecords(db, resource, query) {
  const { q, status, trainId, seatClass, page, pageSize } = query;
  const where = { ...(status ? { status } : {}), ...(trainId ? { trainId } : {}), ...(seatClass ? { seatClass } : {}) };
  if (q) {
    const contains = { contains: q };
    where.OR = resource === 'routes' ? [{ originStation: { name: contains } }, { destinationStation: { name: contains } }]
      : resource === 'seats' ? [{ seatNumber: contains }, { train: { name: contains } }, { train: { code: contains } }]
      : resource === 'schedules' ? [{ train: { name: contains } }, { train: { code: contains } }, { route: { originStation: { name: contains } } }, { route: { destinationStation: { name: contains } } }]
      : [{ name: contains }, { code: contains }, ...(resource === 'stations' ? [{ city: contains }, { state: contains }] : [])];
  }
  const [items, total] = await db.$transaction([
    db[resources[resource]].findMany({ where, include: includes[resource], orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
    db[resources[resource]].count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
export async function getRecord(db, resource, id) {
  const row = await db[resources[resource]].findUnique({ where: { id }, include: includes[resource] });
  if (!row) throw new ApiError(404, 'The requested record was not found.');
  return row;
}

async function validateParents(tx, data) {
  const train = await requireRow(tx, 'train', data.trainId);
  const route = await requireRow(tx, 'route', data.routeId);
  const origin = await requireRow(tx, 'station', route.originStationId);
  const destination = await requireRow(tx, 'station', route.destinationStationId);
  if ([train, route, origin, destination].some(row => row.status !== 'ACTIVE')) conflict('Select an active train, route and stations.');
  const seats = await tx.seat.findMany({ where: { trainId: train.id } });
  if (!seats.some(seat => seat.status === 'ACTIVE')) conflict('Configure at least one active seat before scheduling this train.');
  if (seats.length > train.capacity) conflict('Configured seats exceed train capacity.');
  return seats;
}
async function ensureNoBooking(tx, scheduleId) {
  if (await tx.booking.count({ where: { scheduleId } })) conflict('This schedule has booking history and cannot be changed in this phase.');
  if (await tx.scheduleSeat.count({ where: { scheduleId, status: { in: ['HELD', 'BOOKED'] } } })) conflict('This schedule contains held or booked seats.');
}
async function scheduleRows(tx, schedule, seats) {
  await tx.scheduleSeat.createMany({ data: seats.map(seat => ({ scheduleId: schedule.id, trainId: schedule.trainId, seatId: seat.id, status: seat.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' })) });
}

export async function saveRecord(db, resource, id, input, actorId) {
  return adminTransaction(db, async tx => {
    const model = resources[resource];
    const old = id ? await requireRow(tx, model, id) : null;
    const data = { ...input };
    if (resource === 'stations' && old && data.status === 'INACTIVE') {
      if (await tx.schedule.count({ where: { ...upcoming(), route: { OR: [{ originStationId: id }, { destinationStationId: id }] } } })) conflict('Cancel upcoming schedules before deactivating this station.');
    }
    if (resource === 'routes') {
      const origin = await requireRow(tx, 'station', data.originStationId);
      const destination = await requireRow(tx, 'station', data.destinationStationId);
      if (data.status === 'ACTIVE' && (origin.status !== 'ACTIVE' || destination.status !== 'ACTIVE')) conflict('Both stations must be active for an active route.');
      if (old && (old.originStationId !== data.originStationId || old.destinationStationId !== data.destinationStationId) && await tx.schedule.count({ where: { routeId: id } })) conflict('A route used by schedules cannot change its stations. Create another route.');
      if (old && data.status === 'INACTIVE' && await tx.schedule.count({ where: { ...upcoming(), routeId: id } })) conflict('Cancel upcoming schedules before deactivating this route.');
    }
    if (resource === 'trains' && old) {
      if (data.capacity < await tx.seat.count({ where: { trainId: id } })) conflict('Capacity cannot be smaller than the number of configured seats.');
      if (data.status !== 'ACTIVE' && await tx.schedule.count({ where: { ...upcoming(), trainId: id } })) conflict('Cancel upcoming schedules before deactivating this train.');
    }
    if (resource === 'seats') {
      const train = await requireRow(tx, 'train', data.trainId);
      if (old && old.trainId !== data.trainId) conflict('A seat cannot be moved to another train.');
      if (!old && await tx.seat.count({ where: { trainId: train.id } }) >= train.capacity) conflict('Train capacity reached. Increase capacity before adding seats.');
      if (old && (old.seatNumber !== data.seatNumber || old.seatClass !== data.seatClass) && await tx.scheduleSeat.count({ where: { seatId: id } })) conflict('A seat used by schedules cannot change its number or class.');
      if (await tx.schedule.count({ where: { trainId: train.id, status: { in: ['BOARDING', 'DEPARTED'] } } })) conflict('Seats cannot change while this train is boarding or travelling.');
      if (old && old.status !== data.status && await tx.scheduleSeat.count({ where: { seatId: id, OR: [{ status: { in: ['HELD', 'BOOKED'] } }, { activeBooking: { isNot: null } }] } })) conflict('A held or booked seat cannot change status.');
    }
    let seats;
    let changedTrain = false;
    if (resource === 'schedules') {
      data.departureTime = new Date(data.departureTime); data.arrivalTime = new Date(data.arrivalTime);
      const structuralChange = !old || ['trainId', 'routeId'].some(key => old[key] !== data[key]) || ['fareEconomy', 'fareBusiness'].some(key => Number(old[key]) !== Number(data[key])) || old.departureTime.getTime() !== data.departureTime.getTime() || old.arrivalTime.getTime() !== data.arrivalTime.getTime();
      if (old) await ensureNoBooking(tx, id);
      if (structuralChange && data.departureTime <= new Date()) conflict('Departure must be in the future when creating or rescheduling a journey.');
      if (old && structuralChange && (old.departureTime <= new Date() || ['BOARDING', 'DEPARTED', 'COMPLETED'].includes(old.status))) conflict('Only future journeys that have not started can be rescheduled.');
      if (data.status !== 'CANCELLED' && (!old || structuralChange || old.status === 'CANCELLED')) seats = await validateParents(tx, data);
      else seats = await tx.seat.findMany({ where: { trainId: data.trainId } });
      if (!old && !seats.length) conflict('Configure train seats before creating a schedule.');
      if (data.status !== 'CANCELLED' && await tx.schedule.count({ where: { trainId: data.trainId, ...(id ? { id: { not: id } } : {}), status: { not: 'CANCELLED' }, departureTime: { lt: data.arrivalTime }, arrivalTime: { gt: data.departureTime } } })) conflict('This train already has an overlapping journey.');
      // Rebuild unused inventory when changing trains or restoring a cancelled
      // journey: seat configuration may have changed during cancellation.
      changedTrain = old && (old.trainId !== data.trainId || (old.status === 'CANCELLED' && data.status !== 'CANCELLED'));
      if (changedTrain) await tx.scheduleSeat.deleteMany({ where: { scheduleId: id } });
    }
    const row = old ? await tx[model].update({ where: { id }, data }) : await tx[model].create({ data });
    if (resource === 'schedules' && (!old || changedTrain)) await scheduleRows(tx, row, seats);
    if (resource === 'seats') {
      const schedules = await tx.schedule.findMany({ where: { ...upcoming(), status: 'SCHEDULED', trainId: row.trainId }, select: { id: true } });
      if (!old) await tx.scheduleSeat.createMany({ data: schedules.map(schedule => ({ scheduleId: schedule.id, seatId: row.id, trainId: row.trainId, status: row.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' })) });
      else if (old.status !== row.status) await tx.scheduleSeat.updateMany({ where: { seatId: row.id, scheduleId: { in: schedules.map(schedule => schedule.id) }, status: { in: ['AVAILABLE', 'BLOCKED'] } }, data: { status: row.status === 'ACTIVE' ? 'AVAILABLE' : 'BLOCKED' } });
    }
    await tx.auditLog.create({ data: { userId: actorId, action: `ADMIN_${old ? 'UPDATE' : 'CREATE'}_${model.toUpperCase()}`, entityType: model, entityId: row.id,
      metadata: { changedFields: Object.keys(input), ...(old ? { fromStatus: old.status } : {}), toStatus: row.status } } });
    return getRecord(tx, resource, row.id);
  });
}
export async function deleteRecord(db, resource, id, actorId) {
  return adminTransaction(db, async tx => {
    const model = resources[resource];
    await requireRow(tx, model, id);
    if (resource === 'schedules') {
      await ensureNoBooking(tx, id);
      await tx.scheduleSeat.deleteMany({ where: { scheduleId: id } });
    }
    await tx[model].delete({ where: { id } });
    await tx.auditLog.create({ data: { userId: actorId, action: `ADMIN_DELETE_${model.toUpperCase()}`, entityType: model, entityId: id } });
  });
}
