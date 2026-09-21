// No network calls, banking details or money movement. The planned outcome is
// persisted on the server so retries/restarts cannot choose a different result.
export const demoProvider = Object.freeze({
  name: 'DEMO',
  createIntent({ scenario, previousAttempts, now }) {
    const demoOutcome = scenario === 'FAILURE' || (scenario === 'FAIL_THEN_SUCCESS' && previousAttempts === 0) ? 'FAILURE' : 'SUCCESS';
    return { demoOutcome, readyAt: new Date(now.getTime() + 2000) };
  },
  async verify(payment, now = new Date()) {
    if (payment.provider !== 'DEMO' || !payment.isDemo || !payment.readyAt || !['SUCCESS', 'FAILURE'].includes(payment.demoOutcome)) throw new Error('Invalid demo intent.');
    return { status: payment.readyAt > now ? 'PENDING' : payment.demoOutcome === 'SUCCESS' ? 'PAID' : 'FAILED',
      transactionReference: payment.transactionReference, amount: payment.amount.toFixed(2), currency: payment.currency,
      failureReason: payment.demoOutcome === 'FAILURE' ? 'The demo provider declined this simulated payment. No money was charged.' : null };
  },
});
