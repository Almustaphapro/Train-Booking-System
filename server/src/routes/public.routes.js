import { Router } from 'express';
import { validateSearch } from '../validators/search.validators.js';
import { listPublicStations, popularDemoRoutes, searchSchedules } from '../services/search.service.js';
import { getScheduleSeats } from '../services/booking.service.js';

export function createPublicRouter(getDatabase) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.get('/stations', async (_request, response) => response.json({ success: true, data: { items: await listPublicStations(getDatabase()) } }));
  router.get('/routes/popular', async (_request, response) => response.json({ success: true, data: { items: await popularDemoRoutes(getDatabase()) } }));
  router.get('/schedules/search', validateSearch, async (request, response) => response.json({ success: true, data: await searchSchedules(getDatabase(), request.validated) }));
  router.get('/schedules/:id/seats', async (request, response) => response.json({ success: true, data: await getScheduleSeats(getDatabase(), request.params.id) }));
  return router;
}
