# Phase 5 — Public website and train search

The public railway website is available at <http://localhost:5173/>. Visitors can search at <http://localhost:5173/search> without an account. Results come from Prisma/MySQL records created through the admin workspace; no result schedules, fares or availability counts are hardcoded in the frontend.

The homepage contains navigation, a hero with an original SVG rail illustration, train search, popular demo routes, how it works, secure ticketing information, reasons to use the platform, accessible FAQ accordions and a footer. Planned ticketing is explicitly marked as future functionality. Demo schedules and fares are not official Nigerian Railway Corporation data.

Phase 6 extends this search with [explainable recommendations](recommendations.md). Phase 7 adds [seat selection and pending bookings](bookings.md), accessed from each result; [Phase 8 demo payments](demo-payments.md) can confirm them and generate demo ticket records. Searching alone does not create a reservation. Phase 9 adds [electronic QR tickets, printing and PDFs](qr-tickets.md); officer scanning is deferred.

## Start and try it

Use the existing environment configuration and database. No dependencies, environment variables or schema migrations were added for Phase 5.

```powershell
./scripts/mysql.ps1 start
npm.cmd run dev:server
```

In another terminal:

```powershell
npm.cmd run dev:client
```

If these applications are already running, use them rather than starting duplicate instances. Fresh checkouts should first follow the root README and database guide for installation, environment setup, client generation and migration deployment.

Select an origin, destination and travel date, then choose **Search trains**. The swap button reverses the two stations. Results show train name/code, stations, departure/arrival dates and times, calculated duration, Economy fare, Business fare and total available seats. Searches are stored in the URL so they survive reloads and can be shared. Since Phase 6, results are ranked by the selected recommendation preference (Best Overall by default), then paginated; sold-out journeys remain at the end without a recommendation.

All public dates and times use **Africa/Lagos (WAT, UTC+01:00)**, even when the browser is in another timezone. The selected date refers to the departure day in Nigeria; an overnight arrival shows its later date. The admin schedule editor continues to identify and use the administrator's device timezone when entering timestamps.

Existing seed dates remain 20–22 September 2026. The homepage's route cards link to the next future demo departure when one exists. As dates pass, use the admin Schedules page to create another future journey. The app does not silently change seed dates or invent journeys to fill empty results.

## Search rules

- Both station IDs must exist, be active and be different. Missing, unknown or inactive stations return helpful validation errors.
- A travel date must be a real `YYYY-MM-DD` date, today or later in Nigerian time. Invalid dates such as 30 February and past dates return HTTP 422.
- Only `SCHEDULED` journeys with departure strictly after the current time are shown. `CANCELLED`, `BOARDING`, `DEPARTED` and `COMPLETED` journeys are excluded.
- The train, route and both route stations must all be active. Admin changes are reflected in the next search.
- A seat counts as available only when its ScheduleSeat is `AVAILABLE`, has no hold deadline or active booking claim, and its physical Seat is `ACTIVE`. `HELD`, `BOOKED`, `BLOCKED` and out-of-service seats do not count. Phase 7 releases expired holds for matching upcoming journeys before computing search availability and recommendations; a background worker also performs cleanup.
- A sold-out journey remains visible with **No seats currently available**. A valid search without matching journeys returns HTTP 200 with an empty list and a helpful no-trains state.
- Results are a snapshot. `Cache-Control: no-store` prevents serving an old cached availability response, but searching does not guarantee that a seat remains available later.
- Repeatable-read transactions keep station validation, total counts and returned schedules consistent within one search. Existing route/date indexes are reused.

For a Nigerian travel date, the backend searches from local midnight inclusive to the next midnight exclusive. For example, 21 September means `2026-09-20T23:00:00Z` through just before `2026-09-21T23:00:00Z`. This avoids mistakenly searching a UTC calendar day.

## Public API

| Method and path | Purpose |
| --- | --- |
| `GET /api/stations` | Active station choices: ID, name, code, city and state |
| `GET /api/routes/popular` | Up to four active demo routes with their next future demo departure and Economy fare, if any |
| `GET /api/schedules/search` | Validated, paginated schedule search |

The popular section is a showcase of database demonstration routes, not a ranking derived from passenger demand. It selects active demo routes in creation order and displays no fare when a future demo departure is unavailable. Route distance/duration come from the route record; search duration is calculated from each actual schedule's timestamps.

Search query parameters:

| Parameter | Required | Meaning |
| --- | --- | --- |
| `originId` | Yes | Active origin Station ID |
| `destinationId` | Yes | Different active destination Station ID |
| `date` | Yes | Departure date in Nigeria, `YYYY-MM-DD` |
| `page` | No | Positive integer, default 1 |
| `pageSize` | No | Integer 1–50, default 10 |
| `preference` | No | `BEST_OVERALL` (default), `CHEAPEST`, `EARLIEST`, `FASTEST`, or `MOST_SEATS_AVAILABLE` |

Example shape (replace IDs with values from `/api/stations` and choose a future date):

```text
GET /api/schedules/search?originId=<station-id>&destinationId=<station-id>&date=2027-01-10
```

Successful responses contain `success: true` and `data` with:

- `items`: schedule ID, safe train information, origin/destination, UTC departure/arrival timestamps, `durationMinutes`, `fareEconomy`, `fareBusiness`, `currency`, `availableSeats`, `isDemo`, and a Phase 6 `recommendation` object with scores, label, badges, explanation and factor breakdown.
- `recommendation`: Phase 6 model metadata, weights and eligible candidate ranges; see the [API contract](recommendations.md#api-contract).
- `total`, `page`, `pageSize`, `pages`: pagination metadata.
- `criteria`: validated stations and travel date.
- `timezone`: `Africa/Lagos`.

Fares are decimal strings with two fractional digits to avoid floating-point alteration. A result is marked as demonstration data if its schedule, route or train is flagged as demo. User information, password hashes, booking references and ticket tokens are never selected or returned.

Validation returns HTTP 422 with `{ success: false, message, fields }`. Unknown query fields and duplicate array-valued parameters are rejected. Database failures use the existing safe centralized error handler. Frontend requests cancel when superseded or when leaving the page, and loading, error, retry and empty states are explicit.

## Files added or updated

- `server/src/routes/public.routes.js`, `validators/search.validators.js`, `services/search.service.js`: public read-only endpoints, validation, dates and database queries.
- `server/src/app.js`: public router wiring; existing admin/auth authorization remains intact.
- `server/tests/search.test.js`, root/server `package.json`: search tests and `test:search` command.
- `client/src/pages/public/HomePage.jsx`, `SearchResultsPage.jsx`: complete homepage and search results.
- `client/src/components/passenger/TrainSearchForm.jsx`, `RailIllustration.jsx`: shared search form and decorative vector illustration.
- `client/src/api/journeys.js`, `hooks/usePublicData.js`, `utils/journeys.js`: API calls, loading/retry state and Nigerian date/currency formatting.
- `client/src/styles/public.css`, `main.jsx`, `App.jsx`, `layouts/PublicLayout.jsx`, `index.html`: responsive styling, routing, navigation/footer, anchor navigation and metadata.
- Passenger dashboard future-feature copy and project guides: updated to reflect available train search.

## Verification

Run against the local development database:

```powershell
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:search
npm.cmd run test:auth
npm.cmd run test:admin
npm.cmd run test:db
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd test
npm.cmd run build
```

Verified on 20 September 2026:

- All 12 new search tests passed, covering public access, station choices, actual database results, availability exclusions, Nigerian day boundaries, overnight arrivals, pagination, cancelled/inactive journeys, sold-out results, validation, empty results, current-time filtering, demo cards and fare/inventory changes.
- All 56 existing foundation, authentication, admin and database tests passed: **68 automated tests in total**.
- Production frontend build passed. No new packages or schema changes were required.
- Real Edge browser checks passed for homepage search, station swapping, real fares and availability, sold-out results, cancelled exclusion, URL reload, pagination, validation, empty results, station/search network-error retries, FAQ expansion and anchor navigation.
- With the browser timezone set to Pacific/Honolulu, passenger times still displayed correctly in Nigerian time.
- Homepage, populated results and empty results had no page overflow at 320, 390, 768, 1024 and 1440 pixels. Desktop/mobile screenshots were reviewed; no uncaught browser exceptions were found.
- Temporary test fixtures were removed. Screenshots and local browser scripts are ignored under `.verification/`.

The historical Phase 5 checks above are extended by the [Phase 7 booking tests](bookings.md#tests-and-defense-explanation).
