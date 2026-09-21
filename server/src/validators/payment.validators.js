import { z } from 'zod';
export const paymentSchema = z.strictObject({
  paymentMethod: z.enum(['CARD', 'BANK_TRANSFER', 'USSD']),
  idempotencyKey: z.uuid(),
});
