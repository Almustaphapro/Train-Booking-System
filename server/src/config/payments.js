import './env.js';

export function parsePaymentConfig(source = process.env) {
  const enabled = source.DEMO_PAYMENTS_ENABLED ?? (source.NODE_ENV === 'production' ? 'false' : 'true');
  const scenario = source.DEMO_PAYMENT_SCENARIO ?? 'SUCCESS';
  if (!['true', 'false'].includes(enabled)) throw new Error('DEMO_PAYMENTS_ENABLED must be true or false.');
  if (!['SUCCESS', 'FAILURE', 'FAIL_THEN_SUCCESS'].includes(scenario)) throw new Error('DEMO_PAYMENT_SCENARIO must be SUCCESS, FAILURE or FAIL_THEN_SUCCESS.');
  return Object.freeze({ enabled: enabled === 'true', scenario });
}
