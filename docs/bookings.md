# Phase 7 — Seat selection and pending bookings

Passengers can search, open a schedule, choose an Economy or Business seat, review the journey, create a pending reservation and view it in **My Bookings**. Public seat maps show Available, Selected, Held, Booked and Unavailable states. Selected is a browser selection only; a ten-minute hold starts when the passenger submits **Create pending booking**.

Phase 8 now adds [demo payments and atomic demo ticket generation](demo-payments.md). Pending reservations and demonstration tickets are not valid for real travel. Phase 9 adds [QR ticket pages, printing and PDFs](qr-tickets.md). Real gateways and officer scanning are not implemented. All demonstration schedules and fares remain labelled as university project data, not official Nigerian Railway Corporation information.

## Try the flow

Existing local database settings are preserved. For an installation that has not received this migration:

```powershell
./scripts/mysql.ps1 start
npm.cmd run db:deploy
npm.cmd run db:generate
```

Start the two applications in separate terminals, unless they are already running:

```powershell
npm.cmd run dev:server
```

```powershell
npm.cmd run dev:client
```

1. Open <http://localhost:5173/search> and search for a future schedule.
2. Choose **Select seat**, then select an available Economy or Business seat.
3. Choose **Review booking**. Guests are asked to sign in, then returned to that review. Only passenger accounts can reserve; administrators and ticket officers retain their existing role restrictions.
4. Check the server-provided route, departure/arrival in WAT, class and fare, then create the pending booking.
5. The reservation page shows its reference, status, fare, seat and hold countdown, with a link to the Phase 8 demo checkout. **My Bookings** is available from the passenger dashboard and signed-in navigation.
6. A passenger may cancel their own unpaid pending reservation using a confirmation dialog. Expiry releases it automatically. History remains visible after cancellation or expiry.

If an HTTP response is lost, check My Bookings before retrying. A seat already claimed by the same account also produces a conflict rather than another booking. Selecting a seat, searching and opening the review page do not extend or create a hold.

The map is an inventory view, not a claim about the physical carriage layout. It refreshes every 15 seconds and provides a manual refresh button. My Bookings and reservation details refresh every 10 seconds. The countdown uses the API's time to offset the browser clock; the backend deadline remains authoritative.

## API

| Method and path | Access | Result |
| --- | --- | --- |
| `GET /api/schedules/:id/seats` | Public | Safe schedule details, server time, reservable flag, classes, current seat states and fares |
| `POST /api/bookings` | Passenger | Creates a pending booking and holds its seat atomically; HTTP 201 |
| `GET /api/bookings?page=1&pageSize=10` | Passenger | Paginated bookings belonging to the signed-in user |
| `GET /api/bookings/:id` | Owning passenger | Reservation details and server time |
| `POST /api/bookings/:id/cancel` | Owning passenger | Cancels an unpaid pending booking and releases its claim |

Create body:

```json
{
  "scheduleId": "<schedule-id>",
  "seatId": "<physical-seat-id>",
  "expectedAmount": "2500.00"
}
```

`expectedAmount` detects a stale review. It does not set the price: the server reads the physical seat's class and chooses the corresponding current schedule fare. A mismatch returns HTTP 409 and asks the passenger to refresh. The API rejects unknown fields, including injected user IDs, booking status, class or actual amount. The session supplies the passenger identity.

Creation returns `{ success, message, data: { booking, serverTime } }`. The booking DTO contains its ID, reference, booking/payment status, amount, currency, hold deadline, creation time, safe schedule details and selected seat. No passwords, other passengers' details or ticket tokens are returned. The public map contains no booking owner information.

All routes use `Cache-Control: no-store`. Mutation requests use the existing HttpOnly session cookie, JSON validation and CSRF protections. Anonymous mutations return 401, disallowed roles return 403, another passenger's booking returns 404, invalid fields return 422, and availability or stale-fare conflicts return 409.

## How double booking is prevented

The physical Seat and its ScheduleSeat are separate records. Seat E1 can be reserved on Monday and again on Tuesday because each schedule has a different inventory record. The database's unique `(scheduleId, seatId)` constraint prevents duplicate inventory rows.

Every reservation uses a **Serializable MySQL transaction**:

1. Read the schedule, train, route, stations and physical seat. Check that the journey is scheduled, future and active, the seat belongs to its train and its class determines the fare.
2. Read the schedule-seat state and active booking claim. Reject held, booked, blocked, out-of-service or already claimed seats.
3. Conditionally update the inventory from `AVAILABLE` to `HELD`, requiring the row still to be available, without a deadline or active claim. Exactly one updated row is required.
4. Insert the PENDING booking with the server fare, deadline and `activeScheduleSeatId` pointing to that same inventory record.
5. Insert the audit event and commit all changes together.

The nullable **unique `Booking.activeScheduleSeatId`** supplies an additional database safeguard: only one active booking can claim an inventory record. Existing SQL checks require an active booking to claim its own seat. Historical cancelled/expired bookings clear the claim but retain `scheduleSeatId` for their history.

Competing serializable transactions may encounter a deadlock. The service retries serialization/unique conflicts up to four attempts, using fresh database reads. Once the winning request commits, the loser sees the held/claimed seat and returns:

```text
HTTP 409 Conflict
That seat is no longer available. Please choose another seat.
```

The transaction coordinates with existing serializable admin edits. Admin protections continue to reject changes to a schedule with booking history and changes to held/booked physical seats. All inventory, booking and audit changes roll back if any reservation step fails.

## Hold lifecycle

```text
AVAILABLE
  → passenger creates booking → HELD + PENDING booking + unique active claim
  → deadline reached          → AVAILABLE + EXPIRED booking + cleared claim
  → passenger cancels         → AVAILABLE + CANCELLED booking + cleared claim
```

The deadline is the earlier of ten minutes from reservation or the schedule departure. `ScheduleSeat.heldUntil` controls inventory release; `Booking.expiresAt` records that booking's own deadline even after another passenger later holds the same seat.

An API-process worker checks expired holds at startup and every 30 seconds, avoids overlapping its own runs, catches failures for retry, and drains an active cleanup operation during shutdown. Expiration is also checked when opening seats, creating a reservation, reading one's bookings, or searching matching upcoming journeys. The database keeps the deadline across restarts; startup/request cleanup catches up after downtime. No Redis service or extra package is needed.

Cleanup uses a serializable transaction to expire an unpaid PENDING booking, clear its unique claim, release its inventory and audit the expiry. Phase 8 also permits FAILED unpaid payment status and invalidates pending payment attempts on expiry or cancellation. Concurrent workers are safe under the same database locks and transaction retries. It does not release a confirmed/paid claim. Out-of-service seats return to `BLOCKED`, not `AVAILABLE`. Cancellation of an old already-cancelled booking is idempotent and cannot release a later passenger's replacement hold.

The current worker processes matching expired inventory in one transaction. This is appropriate for this project's workload. A large deployment should batch cleanup and monitor lock contention/retry failures; it must retain atomic release and claim checks. There is no durable job queue in this phase.

## References and migration

References look like `TRN-2026-X7K92PM4QH`: year plus ten characters from an unambiguous 32-character alphabet. Node's cryptographic `randomInt` produces 50 bits of random suffix; the database also enforces uniqueness. A rare collision rolls back and retries with a fresh reference. A reference is a human-readable identifier, not an access credential: every detail lookup still enforces ownership.

Migration `20260920000600_booking_expiry` adds nullable `Booking.expiresAt` and backfills any existing pending held booking from `heldUntil`. Null preserves legacy rows that did not have a hold; all new reservations set a deadline. Existing tables, demo credentials, schedules, booking history and integrity constraints are preserved. No dependency or environment-variable changes were required.

## Tests and defense explanation

Run against the local non-production development database:

```powershell
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:booking
npm.cmd run test:search
npm.cmd run test:recommendation
npm.cmd run test:auth
npm.cmd run test:admin
npm.cmd run test:db
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd test
npm.cmd run build
npm.cmd run db:verify
```

The 17 booking integration tests exercise real MySQL transactions and HTTP requests. The critical test sends two requests simultaneously from distinct authenticated passengers using `Promise.all`, repeats this on three independent seats, and asserts exactly one 201, one 409, one booking row and one active claim for each seat. Tests also cover ownership, roles, CSRF, stale/injected fares, Economy/Business prices, different schedules, expiry, concurrent cleanup and rebooking, automatic worker cleanup, cancellation replay, paid/booked protection, departure cutoffs, references and full rollback after an injected audit failure.

Verified on 21 September 2026:

- **107 automated tests passed:** 17 booking tests plus the 90 existing foundation, authentication, admin, database, public-search and recommendation tests. The final worker error-handling adjustment also passed its focused cleanup test.
- All six migrations are applied and Prisma reports the database schema up to date. Production frontend build passed.
- Real Edge browser checks passed for search-to-seat navigation, all seat states/classes, passenger login returning to review, fare review, pending reservation/countdown, My Bookings, cancellation confirmation, stale-seat HTTP 409, Business fare, expiry/release after reload and missing-journey errors.
- Seat selection, review, pending details and My Bookings had no horizontal page overflow at 320, 390, 768, 1024 and 1440 pixels. Desktop/mobile screenshots were reviewed and no uncaught browser exceptions occurred.
- Temporary fixtures were removed. Demo verification passed with three users, four stations, four routes, two trains, 48 seats, 12 schedules and 288 schedule-seat records. No demo passwords or schedule dates were changed.

The initial migration attempt found the local MySQL instance stopped; starting the existing workspace instance resolved it. Search-triggered expiry was narrowed to upcoming journeys so the existing simulated-time search test does not change departed inventory. Browser verification required waiting for the development API restart and correcting a quoted selector in the test script. All affected checks then passed.

For a project defense: “The browser only requests a seat; it cannot declare one available. The server rechecks inventory and creates the hold and pending booking within a database transaction. A unique active-seat claim prevents two successful reservations for the same schedule-seat. The losing concurrent request receives a conflict. A stored deadline and transactional cleanup return unpaid expired seats to availability while keeping their booking history.”

## Files

- `server/src/services/booking.service.js`, `hold-cleanup.js`: reservation, safe inventory reads, ownership, expiry, cancellation and worker lifecycle.
- `server/src/routes/booking.routes.js`, `validators/booking.validators.js`: passenger APIs and strict input validation.
- `server/src/routes/public.routes.js`, `services/search.service.js`, `app.js`, `server.js`: public seat endpoint, search availability, routing and worker startup/shutdown.
- `server/prisma/schema.prisma`, `migrations/20260920000600_booking_expiry/migration.sql`: persistent booking deadline.
- `server/tests/booking.test.js`, `tests/search.test.js`, root/server `package.json`: booking tests and updated unexpired-hold search fixture.
- `client/src/pages/passenger/SeatSelectionPage.jsx`, `BookingReviewPage.jsx`, `BookingDetailPage.jsx`, `MyBookingsPage.jsx`: full passenger flow.
- `client/src/components/passenger/BookingSummary.jsx`, `hooks/useBookingData.js`, `styles/booking.css`: journey summary, polling, countdown, responsive seats and booking styling.
- `client/src/App.jsx`, `main.jsx`, search/home/dashboard/navigation components: entry points and current feature descriptions.
- `client/src/utils/returnPath.js`, common auth form/route guards: narrowly allowlisted passenger return path after login or registration. Existing authentication mechanisms are preserved.
- Project guides: Phase 7 setup, API, concurrency and phase boundary.
