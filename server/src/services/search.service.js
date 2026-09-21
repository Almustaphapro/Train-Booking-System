import { ApiError } from '../utils/ApiError.js';
import { recommendJourneys } from '../recommendation/recommendation.service.js';
import { releaseExpiredHolds } from './booking.service.js';

export const railwayTimezone = 'Africa/Lagos';
export function railwayDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: railwayTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function travelDayBounds(date) {
  // Nigeria uses UTC+01:00, without daylight saving. Use a half-open day range.
  const start = new Date(`${date}T00:00:00+01:00`);
  return { start, end: new Date(start.getTime() + 86400000) };
}
const stationSelect = { id: true, name: true, code: true, city: true, state: true };
const activeRoute = { status: 'ACTIVE', originStation: { status: 'ACTIVE' }, destinationStation: { status: 'ACTIVE' } };
const availableSeat = { status: 'AVAILABLE', heldUntil: null, seat: { status: 'ACTIVE' }, activeBooking: { is: null } };
const discoverable = now => ({ status: 'SCHEDULED', departureTime: { gt: now }, train: { status: 'ACTIVE' }, route: activeRoute });
const scheduleSelect = {
  id: true, departureTime: true, arrivalTime: true, fareEconomy: true, fareBusiness: true, currency: true, isDemo: true,
  train: { select: { id: true, name: true, code: true, isDemo: true } },
  route: { select: { id: true, isDemo: true, originStation: { select: stationSelect }, destinationStation: { select: stationSelect } } },
  _count: { select: { scheduleSeats: { where: availableSeat } } },
};
export function listPublicStations(db) {
  return db.station.findMany({ where: { status: 'ACTIVE' }, select: stationSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
}
export async function popularDemoRoutes(db, now = new Date()) {
  const routes = await db.route.findMany({
    where: { ...activeRoute, isDemo: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 4,
    select: { id: true, isDemo: true, distanceKm: true, estimatedDuration: true, originStation: { select: stationSelect }, destinationStation: { select: stationSelect },
      schedules: { where: { ...discoverable(now), isDemo: true }, orderBy: [{ departureTime: 'asc' }, { id: 'asc' }], take: 1, select: { departureTime: true, fareEconomy: true, currency: true } },
    },
  });
  return routes.map(({ schedules, ...route }) => ({ ...route, nextDeparture: schedules[0]?.departureTime ?? null, economyFare: schedules[0]?.fareEconomy.toFixed(2) ?? null, currency: schedules[0]?.currency ?? 'NGN' }));
}
export async function searchSchedules(db, query, now = new Date()) {
  if (query.date < railwayDate(now)) { const error = new ApiError(422, 'Choose today or a future travel date.'); error.fields = { date: error.message }; throw error; }
  const bounds = travelDayBounds(query.date);
  await releaseExpiredHolds(db, { schedule: { route: { originStationId: query.originId, destinationStationId: query.destinationId }, departureTime: { gte: bounds.start, lt: bounds.end, gt: now } } }, now);
  return db.$transaction(async tx => {
    const stations = await tx.station.findMany({ where: { id: { in: [query.originId, query.destinationId] }, status: 'ACTIVE' }, select: stationSelect });
    const origin = stations.find(station => station.id === query.originId), destination = stations.find(station => station.id === query.destinationId);
    if (!origin || !destination) {
      const error = new ApiError(422, 'Select valid, active origin and destination stations.');
      error.fields = { ...(!origin ? { originId: 'This origin station is unavailable.' } : {}), ...(!destination ? { destinationId: 'This destination station is unavailable.' } : {}) }; throw error;
    }
    const where = { ...discoverable(now), departureTime: { gte: bounds.start, lt: bounds.end, gt: now }, route: { ...activeRoute, originStationId: origin.id, destinationStationId: destination.id } };
    // Normalize and rank the entire matching day before pagination. Scoring only
    // one page could omit the best journey and make scores change across pages.
    const records = await tx.schedule.findMany({ where, select: scheduleSelect, orderBy: [{ departureTime: 'asc' }, { id: 'asc' }] });
    const candidates = records.map(({ _count, route, ...schedule }) => ({ ...schedule,
      fareEconomy: schedule.fareEconomy.toFixed(2), fareBusiness: schedule.fareBusiness.toFixed(2),
      origin: route.originStation, destination: route.destinationStation,
      isDemo: schedule.isDemo || route.isDemo || schedule.train.isDemo,
      durationMinutes: Math.round((schedule.arrivalTime - schedule.departureTime) / 60000), availableSeats: _count.scheduleSeats,
    }));
    const ranked = recommendJourneys(candidates, query.preference);
    const total = ranked.items.length, offset = (query.page - 1) * query.pageSize;
    return { items: ranked.items.slice(offset, offset + query.pageSize), total, page: query.page, pageSize: query.pageSize, pages: Math.ceil(total / query.pageSize), timezone: railwayTimezone, criteria: { origin, destination, date: query.date }, recommendation: ranked.metadata };
  }, { isolationLevel: 'RepeatableRead' });
}
