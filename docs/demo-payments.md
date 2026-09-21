# Phase 8 — Demo payment system

RailConnect now has an academic **DEMO PAYMENT ENVIRONMENT**. Passengers can choose Card, Bank Transfer or USSD, observe pending/successful/failed payment states, and complete a booking without a real payment gateway. Every checkout and demo ticket summary explains that no real money is charged and demonstration tickets are not valid for real travel.

There are no card number, account number, CVV, PIN, OTP or USSD-code fields. The backend rejects unknown request fields rather than accepting banking credentials. No gateway keys, live financial accounts or new dependencies are required.

Successful payments generate the ticket database record, number and secure token atomically. Phase 9 now adds [passenger QR tickets, printing, PDF downloads and read-only server validation](qr-tickets.md). Officer scanning and boarding remain deferred to Phase 10.

## Use the demo

1. Search for a future journey, select a seat and create a pending booking.
2. From the booking details, choose **Continue to demo payment**.
3. Select Card, Bank Transfer or USSD and submit the simulated payment.
4. The payment is first recorded as PENDING. The backend resolves it after approximately two seconds; polling/worker scheduling can add a short delay.
5. Success confirms the booking, books the seat and generates one demo ticket. The receipt lists the transaction reference and amount. My Bookings reflects CONFIRMED.
6. A failed attempt creates no ticket. While the original seat hold remains valid, use **Retry demo payment** or cancel the reservation. Retrying does not extend the hold.

If the response is interrupted, check the payment history. The page retains its request key for retries during that visit, and reloads retrieve persisted attempts. Duplicate requests cannot create a second successful payment or another ticket.

## Server-controlled scenarios

The server owns the outcome. In `server/.env`, optionally configure:

```dotenv
DEMO_PAYMENTS_ENABLED=true
DEMO_PAYMENT_SCENARIO=SUCCESS
```

| Setting | Behavior |
| --- | --- |
| `SUCCESS` | Every new demo attempt succeeds if the booking remains payable |
| `FAILURE` | Every new demo attempt fails |
| `FAIL_THEN_SUCCESS` | The first demo attempt for each booking fails; subsequent attempts succeed if the hold remains valid |

Restart the backend after changing these settings. They are documented in `server/.env.example`; existing local credentials are preserved. Scenario defaults to SUCCESS. When the enable flag is absent, demo payments default on outside production and off in production. The development example explicitly enables them; use `false` when deploying an environment that should not accept demo payments.

The planned outcome and ready time are saved when the attempt is initialized. Changing the setting later does not change an already recorded attempt. The browser sends only its selected payment method and an idempotency key. It cannot send `status`, `amount`, `bookingStatus`, `demoOutcome`, `provider`, or ticket fields. No public callback can declare success.

## API

All payment endpoints require an authenticated PASSENGER. They return safe DTOs with `Cache-Control: no-store`, and mutation requests use the existing JSON and CSRF protections.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/bookings/:id/payments` | Initialize a pending demo attempt; 201 for a new attempt, 200 for a matching replay |
| `GET /api/bookings/:id/payments` | Owner's payment history, demo environment label and enabled/scenario metadata; due pending attempts are verified by the server |
| `GET /api/payments/:id` | Verify a due attempt and return its current state, only to its booking owner |
| `GET /api/bookings/:id` | Existing owner-only booking response now includes safe ticket summary fields when issued |

Initialize body:

```json
{
  "paymentMethod": "CARD",
  "idempotencyKey": "a5022826-87b7-43ad-9e6a-56f24d0af67e"
}
```

Methods are `CARD`, `BANK_TRANSFER`, and `USSD`. Generate a fresh UUID for a genuinely new attempt; reuse the same key and method when retrying an uncertain request. Reusing a key for another booking or method returns 409. A different new request while an attempt is already pending also returns 409.

Initialization returns `{ success, message, data: { payment, replayed, environment } }`. The payment DTO includes ID, booking ID, unique transaction reference, amount, currency, method, status, demo flag, provider name, failure reason and timestamps. It never exposes the planned outcome or idempotency key. Transaction references use `DMP-<year>-<20 random hex characters>`; database uniqueness is enforced.

Amounts and currency come from the booking's server-calculated fare. Another passenger receives 404 for an owned payment/booking resource; admin/officer requests receive 403; anonymous requests receive 401; invalid or injected fields receive 422. Disabled demo payments return 503. Expired, cancelled, confirmed or otherwise unpayable bookings reject new attempts with 409.

## State changes and atomicity

| Outcome | Payment | Booking payment status | Booking status | Schedule seat | Ticket |
| --- | --- | --- | --- | --- | --- |
| Initialized | PENDING | PENDING | PENDING | HELD | None |
| Successful verification | PAID | PAID | CONFIRMED | BOOKED | One VALID demo record |
| Provider failure | FAILED | FAILED | PENDING | HELD until original deadline | None |
| Hold expires before completion | FAILED if an attempt was pending | FAILED if an attempt failed | EXPIRED | AVAILABLE / BLOCKED as appropriate | None |
| Passenger cancels before completion | Pending attempt becomes FAILED | FAILED if an attempt failed | CANCELLED | AVAILABLE / BLOCKED as appropriate | None |

Initialization uses a Serializable transaction, checks the booking's ownership, live hold, active claim, seat, route/train/station states and future scheduled departure, then records the pending attempt and audit event. A unique nullable idempotency key protects replay, and transaction locks prevent two distinct pending attempts being created concurrently for one booking.

Provider verification happens outside the retryable transaction. The result must match the stored reference, amount and currency, and its state must be one of PENDING, PAID or FAILED. Settlement then uses a new Serializable transaction and rechecks eligibility and the current payment state. Duplicate worker/polling completions see the terminal result and do nothing.

Successful settlement commits these changes together:

1. Payment becomes PAID with its payment timestamp.
2. Booking becomes CONFIRMED and its payment status becomes PAID.
3. The claimed inventory becomes BOOKED and its hold deadline is cleared.
4. One Ticket is inserted with a unique number, a cryptographically random 32-byte token, VALID status and expiry at schedule arrival.
5. Payment and ticket audit events are inserted.

If ticket creation or another step fails, all changes roll back. The existing database trigger also requires a confirmed booking and a successful payment matching its amount/currency before a ticket can be inserted. The unique ticket booking ID prevents issuing two tickets. The raw token is not exposed by these APIs.

Failure sets both the attempt and booking payment status to FAILED. The booking remains pending and the original hold is retained for a retry. The Phase 7 expiry/cancellation logic now handles both PENDING and FAILED unpaid booking statuses, and invalidates any in-flight payment while releasing the claim. Settlement cannot resurrect an expired/cancelled booking or overwrite a completed payment. A cancellation-versus-payment race results in either a fully confirmed booking with one ticket or a cancelled booking with no ticket.

## Backend worker and provider separation

`payment.worker.js` checks up to 100 due DEMO pending attempts at startup and every two seconds. It avoids overlapping its own runs, retries failed processing on a later interval, and finishes an active pass during shutdown. Intent/outcome persistence lets another process or a restarted server finish a pending payment even if the browser closes. Owner payment reads can also trigger verification; the frontend never supplies the result.

`providers/demo.provider.js` contains the simulation policy and provider verification contract. `payment.service.js` contains ownership, idempotency, amount checking, transitions and ticket issuance. This separation supplies an integration point for later Paystack or Flutterwave adapters, without pretending that a live gateway is already implemented.

A future real integration must add hosted/tokenized checkout, authenticated server-to-server verification or signature-checked webhooks, trusted amount/currency/reference checks and reconciliation. Create external payment operations outside retried database transactions, using durable intents/outbox processing and provider idempotency. A real charge received after a seat has expired needs a refund/reconciliation policy; the current demo-specific “no money charged” failure path must not be reused for real funds. Store gateway secrets only on the server. No provider SDK, external network payment request or real banking credential storage exists in Phase 8.

## Migration and verification

Migration `20260921000700_demo_payments` adds nullable provider, idempotency-key, planned outcome, ready-time and failure-reason fields to Payment. It adds a unique idempotency-key index and a CHECK constraint requiring complete demo intents. Null fields preserve existing historical records.

For an installation that has not received this migration:

```powershell
./scripts/mysql.ps1 start
npm.cmd run db:deploy
npm.cmd run db:generate
```

Use the existing frontend and backend startup commands. Do not launch duplicates if they are already running.

```powershell
npm.cmd run dev:server
# Another terminal:
npm.cmd run dev:client
```

Payment and regression tests:

```powershell
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:payment
npm.cmd run test:booking
npm.cmd run test:auth
npm.cmd run test:admin
npm.cmd run test:db
npm.cmd run test:search
npm.cmd run test:recommendation
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd test
npm.cmd run build
npm.cmd run db:verify
```

The 22 payment integration tests cover all three methods, server-selected failure, retry, persistent pending state, strict validation, credential-field rejection, role/ownership/CSRF enforcement, matching and conflicting request-key races, exactly-once ticket issuance, expiry and cancellation races, reference/amount/currency verification, rollback on ticket failure, background completion and the disabled environment. Combined with the previous suites, **129 automated tests passed**.

Final verification on 21 September 2026:

- All seven migrations are applied; Prisma reports the database schema up to date. Production frontend build passed.
- Real Edge browser checks passed using temporary fixtures and an isolated API configured for FAIL_THEN_SUCCESS: login returns to checkout, only method-selection fields are present, double clicks create one attempt, Card failure issues no ticket, USSD retry succeeds, Bank Transfer failure survives reload and can be retried, and the confirmed booking/ticket summary persists.
- Checkout, failure, success and ticket-summary pages had no horizontal page overflow at 320, 390, 768, 1024 and 1440 pixels. Payment history scrolls inside its keyboard-accessible region. Desktop/mobile screenshots were reviewed; no uncaught browser exceptions occurred. Successful payments immediately remove the hold countdown and pending-payment guidance, even before the next booking poll.
- Temporary fixtures were removed. Demo verification preserved three users, four stations, four routes, two trains, 48 seats, 12 schedules and 288 schedule-seat records. Existing local credentials and demo dates were not changed.
- Phase 8 added no packages or real payment integrations. The subsequent Phase 9 additions are described in the [QR ticket guide](qr-tickets.md).

## Files

- `server/src/payments/payment.service.js`, `payment.worker.js`, `providers/demo.provider.js`: payment lifecycle, worker, references, provider contract and atomic ticket issuance.
- `server/src/config/payments.js`, `validators/payment.validators.js`, `routes/payment.routes.js`: configuration, strict inputs and passenger APIs.
- `server/src/services/booking.service.js`, `app.js`, `server.js`: failed-payment expiry/cancellation, safe ticket DTO, routing and worker lifecycle.
- `server/prisma/schema.prisma`, `migrations/20260921000700_demo_payments/migration.sql`: durable intents and idempotency safeguards.
- `server/tests/payment.test.js`, root/server `package.json`, `server/.env.example`: tests, commands and optional demo settings.
- `client/src/pages/passenger/DemoPaymentPage.jsx`, `components/passenger/DemoPaymentBanner.jsx`, `styles/payment.css`: responsive checkout, required demo label, methods, result and receipt history.
- Booking details/review, routing, passenger return path, dashboard/home/auth/status descriptions and guides: current Phase 8 entry points and accurate feature descriptions.
