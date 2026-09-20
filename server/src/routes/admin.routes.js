import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { authMutationGuard } from '../middleware/authMutationGuard.js';
import { validateBody } from '../validators/auth.validators.js';
import { adminSchemas, listSchema } from '../validators/admin.validators.js';
import { resources, listRecords, getRecord, saveRecord, deleteRecord } from '../services/admin.service.js';
import { ApiError } from '../utils/ApiError.js';

export function createAdminRouter(getDatabase, config) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.use(authenticate(getDatabase, config), authorize('ADMIN'));
  router.get('/overview', async (_request, response) => {
    const db = getDatabase();
    const counts = await db.$transaction(Object.values(resources).map(model => db[model].count()));
    response.json({ success: true, data: { counts: Object.fromEntries(Object.keys(resources).map((key, index) => [key, counts[index]])) } });
  });
  for (const resource of Object.keys(resources)) {
    router.get(`/${resource}`, async (request, response) => {
      const parsed = listSchema(resource).safeParse(request.query);
      if (!parsed.success) throw new ApiError(422, 'Invalid search, filter or pagination parameters.');
      response.json({ success: true, data: await listRecords(getDatabase(), resource, parsed.data) });
    });
    router.get(`/${resource}/:id`, async (request, response) => response.json({ success: true, data: await getRecord(getDatabase(), resource, request.params.id) }));
    router.post(`/${resource}`, authMutationGuard, validateBody(adminSchemas[resource]), async (request, response) => {
      response.status(201).json({ success: true, message: 'Record created.', data: await saveRecord(getDatabase(), resource, null, request.validated, request.user.id) });
    });
    router.put(`/${resource}/:id`, authMutationGuard, validateBody(adminSchemas[resource]), async (request, response) => {
      response.json({ success: true, message: 'Changes saved.', data: await saveRecord(getDatabase(), resource, request.params.id, request.validated, request.user.id) });
    });
    router.delete(`/${resource}/:id`, authMutationGuard, async (request, response) => {
      await deleteRecord(getDatabase(), resource, request.params.id, request.user.id);
      response.json({ success: true, message: 'Record deleted.' });
    });
  }
  return router;
}
