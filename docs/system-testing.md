# Phase 14 — Full System Testing and Bug Fixing

This report covers the RailConnect workspace on **23 September 2026**. Tests use the real Express application, Prisma and the workspace MySQL database. Test accounts and transport records have unique random identifiers and are removed after each run; existing demonstration accounts and passenger data are preserved.

## Original Phase 14 results

These are the original successful Phase 14 results. A later repeated run produced 206 passes and one intermittent authentication failure; the targeted authentication rerun passed all 14 tests. Phase 16 also encountered a stopped local MySQL service, recorded the resulting setup failures, and restarted the existing instance without resetting data. See [final status](final-status.md) for the latest complete checks and remaining uncertainty.

| Check | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Complete automated suite | **207** | **0** | **0** |
| Connected browser journey checks | **24** | **0** | **0** |
| Frontend production build | 1 | 0 | 0 |
| Prisma schema validation | 1 | 0 | 0 |
| Migration status | All 10 applied | 0 pending | — |

The automated run completed in approximately 117 seconds. It includes 44 foundation/validation/scoring/rate-limit tests, 14 authentication, 12 database, 16 admin CRUD, 17 booking, 22 payment, 14 ticket, 21 officer, 15 fraud integration, 12 public search, 7 recommendation integration and 13 connected-system tests. The browser's 24 checks include 14 responsive-screen checks, each repeated at five widths. No required automated scenario remains failing.

## Reproduce the automated checks

From the repository root:

```powershell
./scripts/mysql.ps1 start
npm.cmd run db:deploy
npm.cmd run db:generate
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:all
npm.cmd run build
npm.cmd run db:validate --workspace server
npm.cmd run db:status --workspace server
Remove-Item Env:ALLOW_DB_TESTS
```

`test:all` runs every `server/tests/*.test.js` file sequentially. It does not stop after the first failing file, skip failing cases or remove assertions. The database opt-in is required and integration fixtures refuse production. Run this on a development/test database, without another test runner or active manual edits, so reporting snapshots remain deterministic. `npm.cmd test` runs the fast foundation, validation, recommendation, fraud-scoring and rate-limit tests. `npm.cmd run test:system` runs the new connected HTTP journey and monitoring regressions.

## Failures found and fixes

The first full automated run had **179 passing and 13 failing tests out of 192**. All 13 failures originated from payment throttling: requests in the payment and officer suites exhausted the newly added quota before their intended assertions. Some subsequent tests consequently lacked the payment object they expected.

- Payment requests were grouped by IP address before authentication. The payment limiter now runs after authentication, passenger authorization and CSRF checks, and groups by the authenticated passenger ID. Passengers on a shared network no longer consume each other's payment quota. The global API limiter remains active.
- The production payment policy remains **20 attempts per passenger per 15 minutes**. Bulk payment/officer domain suites inject a separate 1,000-request quota into their isolated application instances. Dedicated tests explicitly verify the real 20/21 boundary, HTTP 429, retry headers and separation of accounts on the same IP. The API limiter's expiry/recovery is also tested. No production environment setting disables these safeguards.
- Admin booking and payment lists were missing from the requested journey. Added protected, read-only `/api/admin/bookings` and `/api/admin/payments`, plus `/admin/bookings` and `/admin/payments` pages. Both support reference/passenger search, status filters, WAT creation-date filters and pagination. Responses select necessary fields and exclude password hashes, ticket bearer tokens, contact details and payment idempotency keys.
- The shared request hook retained the previous record when its URL changed. Data is now associated with the requested path, so a previous ticket or schedule is not displayed under a new record's URL. Refreshing the same record can retain its data; existing error guards still apply.
- Fraud detail screens now distinguish a fixed rule-priority score from a calculated anomaly score, and label invalid-scan subjects as recording officers. Disabled passenger accounts no longer show a suspension action that the API cannot perform. The chart inspector also clamps its selected day when its data range shrinks.
- The first new browser run exposed a malformed selector string in the test harness. Correcting that string allowed the journey to continue; no application behavior was bypassed.

No new dependency was installed, no local secret was replaced, and no database was reset. All ten existing migrations were checked/applied through Prisma's migration history.

## Connected journey coverage

| Journey | Verification |
| --- | --- |
| Passenger | Browser registration, logout and login; real database search and recommendation; train selection, visual seat selection, booking review and pending reservation; server-controlled demo payment; generated QR ticket and ticket page |
| Officer | Browser login; actual QR decoding from simulated video frames; server validation; boarding confirmation; ticket becomes USED; repeat presentation rejected with original usage time; persisted rejected scan and HIGH duplicate-use alert |
| Admin | Browser login; create/view/edit/delete stations, routes, trains and schedules; view/search bookings and payments; real dashboard cards/charts and date filtering; filter/view fraud alert; mark under review and resolve; inspect audit history |
| Authorization | Anonymous, passenger and officer access to admin resources rejected; passenger browser navigation redirects to Unauthorized; CSRF and injected fields rejected; ownership checks enforced |
| Reservation integrity | Duplicate seat constraints; repeated competing HTTP booking requests return one 201 and one 409; hold expiry, seat release, cancellation and rollback checks |
| Ticket/payment integrity | Invalid, unpaid, expired, cancelled and used tickets rejected; concurrent boarding has one winner; failed demo payments issue no ticket; provider outcomes, amounts and currency rechecked; transaction failure rolls back related writes |
| Monitoring | Concurrent reviews have one winner and one conflict; audit-write failure rolls back the review; WAT midnight boundaries, zero-filled dates, paid-only revenue and status totals verified; sensitive evidence redacted; manual suspension revokes sessions |
| User interface | Loading, empty and error states; report network error hides stale totals and retry recovers; no uncaught browser exceptions in the connected journey |

Reporting is based on live database records. Cards are lifetime/current totals as labelled; chart date filters apply to chart series. Revenue means PAID NGN payments, using payment time, and excludes pending, failed and refunded records. Tickets Verified counts distinct tickets with a successful verification or boarding log, not the number of repeated scans. The report groups dates in Africa/Lagos (UTC+01:00).

Alert status changes require a reason and the version last read by the administrator. Earlier decisions remain in append-oriented `AuditLog` records; the alert's own reviewer fields describe the latest decision. The inspection API returns the latest 50 reviews and their total count; the audit API supports paginated entity filters for older records. Monitoring does not automatically suspend a passenger.

## Browser checks

The repeatable harness is [scripts/system-browser.mjs](../scripts/system-browser.mjs). It uses an isolated browser context and an Express server on an ephemeral port. Browser requests are forwarded to this real local API; API responses, payment outcomes and database records are not fabricated. The demo payment worker settles the browser's payment normally. The QR scanner decodes a real ticket QR rendered into a simulated camera stream.

Start the frontend in a separate terminal:

```powershell
npm.cmd run dev:client
```

Start an isolated headless Edge debugging profile if one is not already listening on port 9222:

```powershell
$testProfile = Join-Path (Get-Location) '.verification/edge-system-profile'
Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -WindowStyle Hidden -ArgumentList @('--headless=new', '--remote-debugging-port=9222', ('--user-data-dir="' + $testProfile + '"'), 'about:blank')
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:browser
Remove-Item Env:ALLOW_DB_TESTS
```

Use a dedicated debugging profile, not your personal browser session. `BROWSER_CDP_URL` can select another local debugging endpoint. The harness expects the frontend on `localhost:5173` configured with the normal API URL `http://localhost:5000/api`; it does not require the normal backend listener to be running. It closes its own browser context and removes its fixture records on success or failure.

Fourteen screens were checked at **320, 390, 768, 1024 and 1440 pixels**: registration, search, seat selection, booking review, demo payment, ticket, officer validation, duplicate rejection, admin dashboard, booking list, payment list, fraud list, fraud details and audit logs. Table regions scroll within the page where necessary. These checks produced no horizontal page overflow. Desktop and mobile screenshots were inspected.

Ignored local artifacts include `.verification/phase14-browser.json`, screenshots named `phase14-*.png`, `.verification/phase14-baseline-tests.txt`, `.verification/phase14-rate-fix-tests.txt` and `.verification/phase14-final-tests.txt`. These contain only temporary academic test records.

## Scope and remaining limitations

- Camera decoding used simulated video frames, not physical camera hardware. Screen widths were emulated in Chromium/Edge; physical phones/tablets, Safari and Firefox were not tested.
- Payments remain an explicitly labelled academic simulator. No real gateway, banking credentials or money movement was tested. Demonstration schedules, fares and tickets are not official Nigerian Railway Corporation data.
- Transaction races are tested locally, but this is not a sustained production load test, penetration test or multi-server availability test. Rate-limit stores remain in process memory and need shared storage for a multi-instance deployment.
- Fraud thresholds are explainable demonstration policies, not a trained or empirically calibrated fraud probability. Human review remains necessary.
- Report assertions use temporary historical fixtures in otherwise unused dates. Run automated tests on a dedicated development/test database; concurrent manual changes can invalidate exact snapshot comparisons.

**Phase 15 has not been started.**
