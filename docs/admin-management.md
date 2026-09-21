# Phase 4 — Admin core management

Administrators can manage stations, routes, trains, seats and schedules at `/admin/dashboard`. Each resource has a searchable, paginated table, status filters, create/edit forms, loading and empty states, retryable errors, success notifications and confirmation dialogs. Seat and schedule tables also filter by train; seats filter by class. No browser `alert()` or `confirm()` is used.

These interfaces prepare the network used by [public train search](public-search.md), [recommendations](recommendations.md), [Phase 7 reservations](bookings.md) and [Phase 8 demo payments](demo-payments.md). Phase 9 adds [passenger QR tickets and PDFs](qr-tickets.md); officer scanning is deferred. Existing booking-history and held/booked-seat protections continue to apply to admin edits. Seeded schedules and fares remain labelled demonstration data, not official Nigerian Railway Corporation data.

## Run and use

From the project root, with the existing environment files:

```powershell
./scripts/mysql.ps1 start
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run dev:server
```

In a second terminal, run `npm.cmd run dev:client`. If an application is already running, use that instance rather than starting another on the same port.

Open <http://localhost:5173/login>, sign in using `admin@example.com` and the current `DEMO_ADMIN_PASSWORD` in `server/.env`, then open **My dashboard**. The user's existing demo credentials were preserved in this phase.

1. **Stations:** create a name, unique code, city and state. Edit details or activate/deactivate using the power button.
2. **Routes:** select different origin and destination stations, then provide distance and estimated duration. Each direction is a separate route. Duplicate station pairs are rejected.
3. **Trains:** enter a unique code, name and capacity. The table shows configured seats against capacity. Statuses are Active, Inactive, Maintenance and Retired.
4. **Seats:** choose a train, unique seat number within that train, Economy/Business class and Active/Out of service status. The train table's **Seats** link opens its filtered inventory.
5. **Schedules:** select a train and route, departure and arrival, both fares and status. The form identifies your device timezone; the API stores UTC instants. Existing seconds are preserved when editing unrelated fields. Fares are NGN amounts with up to two decimal places.

Searches are debounced and performed on the server. Tables show 15 rows per page. On narrow screens, tables scroll within their containers. Native modal dialogs keep keyboard focus inside, support Escape when not saving and return focus on close. Validation errors preserve form values.

## Integrity rules

- Station/train codes and route pairs are unique. Codes and seat numbers are normalized to uppercase. Route stations must differ, with positive distance and duration. Active routes require active stations.
- Train capacity is an integer from 1 to 1000 and cannot be reduced below its physical seat count. Adding seats cannot exceed it, including concurrent requests. A train can be configured gradually; a schedule uses the seats that exist, not imaginary seats up to capacity. At least one active seat is required for an active schedule.
- New/rescheduled journeys require future departure and arrival after departure. Overlapping non-cancelled journeys for the same train are rejected. Adjacent journeys may share an arrival/departure boundary.
- Schedule creation and its complete `ScheduleSeat` inventory commit in one transaction. Active physical seats become `AVAILABLE`; out-of-service seats become `BLOCKED`. The existing unique `(scheduleId, seatId)` and composite train foreign keys remain enforced.
- Newly added seats are also added to that train's future `SCHEDULED` journeys. Physical status changes synchronize `AVAILABLE`/`BLOCKED` on those journeys. Held/booked seats cannot change status. Seat changes are blocked while a train has a `BOARDING` or `DEPARTED` journey.
- A seat already used by any schedule cannot change its number or class. It cannot move to another train. A route already used by schedules cannot change its stations. These restrictions preserve historical identity.
- Upcoming `SCHEDULED`/`BOARDING` journeys must be cancelled before deactivating their train, route or either station. Previously deactivated station dependencies are also checked when creating a new schedule.
- Only future journeys that have not started can change train, route, times or fares. Status-only updates remain available for unbooked journeys. A cancelled journey restored to another status rebuilds its unclaimed inventory from the current seat configuration; changing its train does the same.
- Any booking history, including cancelled bookings, blocks schedule edits/deletion in this phase. Held/booked inventory also blocks those operations. Booking-aware cancellation, refunds and ticket changes belong to later phases.
- Physical deletion is limited by foreign keys: remove unused schedules, then seats/routes, then trains/stations as appropriate. Deleting an unbooked schedule removes its journey seats transactionally. Otherwise use status controls to preserve records.
- Every successful create/update/delete writes an AuditLog entry in the same transaction. Validation failures and rolled-back conflicts leave neither partial rows nor successful-operation audit events.

Management mutations use serializable transactions with up to three attempts for serialization/deadlock conflicts. Capacity checks, overlap checks and inventory updates therefore see a consistent transaction state. The integration suite tests concurrent seat and schedule creation directly.

## API

All endpoints below require the existing authenticated ADMIN session. Anonymous requests receive 401; PASSENGER and TICKET_OFFICER receive 403, including on every write method. JWT, cookies, login, registration, logout and role middleware were reused without changing their behavior.

For each resource `stations`, `routes`, `trains`, `seats`, `schedules`:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/admin/{resource}` | Search/filter/paginated list |
| GET | `/api/admin/{resource}/:id` | Details with useful relations/counts |
| POST | `/api/admin/{resource}` | Create; HTTP 201 |
| PUT | `/api/admin/{resource}/:id` | Replace editable fields, including status; HTTP 200 |
| DELETE | `/api/admin/{resource}/:id` | Delete only when permitted; HTTP 200 |
| GET | `/api/admin/overview` | Live counts for all five resources |

Lists accept `q`, `status`, `page` (default 1) and `pageSize` (default 15, maximum 100). Seats/schedules accept `trainId`; seats also accept `seatClass`. Responses use `{ success: true, data: { items, total, page, pageSize, pages } }`. Detail/create/update return the record in `data`.

Mutations require `Content-Type: application/json` and `X-Requested-With: XMLHttpRequest`; DELETE sends `{}`. Credentialed CORS now permits PUT and DELETE for configured origins. The existing CSRF guard is reused. Admin responses disable caching. Unknown fields are rejected rather than written to the database.

| Resource | Required editable fields |
| --- | --- |
| Station | `name`, `code`, `city`, `state`, `status` |
| Route | `originStationId`, `destinationStationId`, `distanceKm`, `estimatedDuration`, `status` |
| Train | `name`, `code`, `capacity`, `status` |
| Seat | `trainId`, `seatNumber`, `seatClass`, `status` |
| Schedule | `trainId`, `routeId`, `departureTime`, `arrivalTime`, `fareEconomy`, `fareBusiness`, `status` |

Send decimal distances/fares as strings (for example `"4500.50"`), capacity/duration as integers, and datetimes as ISO strings with `Z` or an explicit offset. Currency is NGN. Status values match Prisma enums. Validation returns 422 with field messages; conflicts return 409 with an actionable safe message; missing records return 404. Passwords, hashes and tokens are never part of management responses.

Example schedule body:

```json
{
  "trainId": "<existing active train ID>",
  "routeId": "<existing active route ID>",
  "departureTime": "2027-01-10T08:00:00+01:00",
  "arrivalTime": "2027-01-10T10:30:00+01:00",
  "fareEconomy": "4500.50",
  "fareBusiness": "9000.00",
  "status": "SCHEDULED"
}
```

The example is demonstration data; use a future date when trying it.

## Database migration and files

`20260920000500_admin_management` adds `INACTIVE` to TrainStatus and `BLOCKED` to ScheduleSeatStatus. Existing tables, keys, data and custom CHECK constraints remain intact. Regenerate Prisma and deploy migrations on other checkouts; do not use `db push` or reset the database.

- Backend: `server/src/routes/admin.routes.js`, `services/admin.service.js`, `validators/admin.validators.js`; application wiring and CORS methods updated.
- Frontend: `client/src/layouts/AdminLayout.jsx`, `pages/admin/AdminDashboard.jsx`, `pages/admin/ManagementPage.jsx`, `components/admin/AdminModal.jsx`, `components/admin/managementConfig.js`, `api/admin.js`, `styles/admin.css`; routing/style imports updated.
- Tests: `server/tests/admin.test.js`; root/server `test:admin` scripts.
- Documentation: this guide, root README, authentication guide and database guide.

No additional dependencies were installed.

## Verification

Run against the local development database only:

```powershell
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:admin
npm.cmd run test:auth
npm.cmd run test:db
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd test
npm.cmd run build
```

Verified on 20 September 2026:

- All five migrations are applied and Prisma reports the schema is up to date. The production frontend build and demonstration-data verification passed.
- 16 admin integration tests passed: all CRUD resources, normalization/duplicates, field validation, status changes, filters/pagination, safe conflicts, foreign-key protection, schedule inventory generation/replacement, booking/hold protection, CSRF, audit events and two concurrency races.
- Every management list/detail/create/update/delete endpoint rejected anonymous users, passengers and officers.
- All 40 prior foundation, authentication and database tests passed.
- Real Edge browser created, edited and deleted all five resource types; verified activation, confirmation cancellation, referenced-record error messages, search empty state and network-failure retry. Editing a fare preserved the original departure seconds and milliseconds.
- Overview, station/schedule tables and schedule dialog checked at 320, 390, 768 and 1440 pixels without page overflow. Desktop/mobile screenshots reviewed; no uncaught browser exceptions.
- Temporary test accounts and domain fixtures were cleaned up. Browser scripts/screenshots are ignored under `.verification/`.

Passenger booking functionality remains outside this phase.
