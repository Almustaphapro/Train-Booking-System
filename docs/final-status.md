# Final project verification — Phase 16

Verified on **23 September 2026** in the RailConnect workspace. This is an academic demonstration with verified local workflows, not a production-readiness certification. No real railway service, banking transaction or deployed infrastructure was tested.

## Latest completed checks

| Check | Passed | Failed | Skipped / pending |
| --- | ---: | ---: | --- |
| Complete backend/unit/database/API suite | **208** | **0** | 0 skipped |
| Browser journey checks | **24** | **0** | 0 skipped |
| Frontend production build | 1 | 0 | None |
| Prisma schema validation | 1 | 0 | None |
| Database migration status | 10 applied | 0 | 0 pending |
| Targeted authentication rerun | 14 | 0 | 0 skipped |

The full successful backend run took approximately **61.5 seconds**. It includes 45 foundation/validation/scoring/rate-limit tests, 14 authentication, 12 database, 16 admin CRUD, 17 booking, 22 payment, 14 ticket, 21 officer, 15 fraud integration, 12 public search, 7 recommendation integration and 13 connected-system tests. The additional foundation test verifies that diagnostic logging permits only a formatted Prisma code and does not expose arbitrary error strings or credentials.

The browser run completed at `2026-09-23T20:03:29.649Z`. Its 24 checks include 14 screens assessed at **320, 390, 768, 1024 and 1440 pixels**. The connected journey produced no uncaught browser JavaScript exceptions. Camera decoding used a real generated QR image in a simulated video stream, not physical camera hardware.

## Critical requirements demonstrated

- Passenger registration/login, database search and recommendation, seat selection/review, pending booking, server-controlled demo payment and generated QR ticket.
- Concurrent booking requests produce one successful reservation and one HTTP 409; duplicate seat constraints, hold expiry and rollback behavior pass.
- Failed/unpaid reservations do not produce valid tickets. Settlement checks provider identity, amount, currency and current booking/seat state.
- Officer camera/manual verification checks current records; boarding consumes a ticket once. A second presentation is rejected, logged and creates a HIGH duplicate-use alert. Concurrent boarding has one winner.
- Invalid, expired, cancelled, used and wrong-schedule tickets fail validation. Officer permissions do not permit unrelated administrative mutations.
- Admin station/route/train/seat/schedule operations, real reports, booking/payment lists, fraud review/resolution and audit evidence pass. Competing reviews return a conflict instead of overwriting a newer decision.
- Backend role and ownership restrictions, CSRF checks, input validation, session revocation and rate-limit boundaries pass.
- Browser error/retry handling, confirmation dialogs and responsive page widths pass.

## Failures observed and how they were handled

1. The initial Phase 14 run had 13 payment-related failures caused by a shared-IP payment quota. The limiter was moved after authentication/authorization/CSRF and keyed by passenger. Production limits remain 20 attempts per 15 minutes; dedicated tests verify the 20/21 boundary and independent users. Bulk domain suites use an explicitly injected larger quota. See [the detailed testing report](system-testing.md).
2. A subsequent Phase 14 rerun had **206 passes and one authentication failure**: a role-access test received an unexpected login HTTP 500. The next targeted authentication run passed 14/14, and the latest full run passed that same role-access case. The original error lacked a diagnostic code, so **its root cause remains unconfirmed**. Safe Prisma-code logging was added, with a regression test. No timing assertion was removed and no unsupported authentication change was made. A successful rerun is evidence of current behavior, not proof that an intermittent issue can never recur.
3. On resuming Phase 16, MySQL was no longer running. The initial full attempt reported **59 passing and 157 failing runner entries** (including file-level setup/cleanup failures). Database suites could not acquire connections. The existing workspace instance was restarted, preserving its data; the complete rerun then passed 208/208. The failed attempt is retained rather than hidden.

There are **no failing tests in the latest completed runs**. No database reset, password replacement, weakened production limit or skipped failing scenario was used to obtain those results.

## Documentation and code changes in Phase 16

- Replaced the historical README with installation, environment, database, migration, seed, role, API, security, algorithm, test and limitation guidance.
- Added the documentation index, architecture, database relationship explanation, 18-question defense guide and this status report.
- Retained the detailed authentication, booking, recommendation, fraud, QR and officer guides; corrected outdated database/officer statements about deferred features.
- Marked the original Phase 14 result table as historical and linked the current report.
- Added safe unexpected-database-error diagnostic codes and a test proving arbitrary error content remains private.

No new dependency was needed for Phase 16. Existing Phase 14 fixes and tests remain in the working tree.

## Reproduction and evidence

Use the commands in the [README](../README.md#testing-commands) and [browser test instructions](system-testing.md#browser-checks). Start the existing local MySQL instance before database tests, and run integration suites sequentially without competing test runners or manual reporting-data edits.

Ignored local artifacts:

| File | Evidence |
| --- | --- |
| `.verification/phase16-auth.txt` | Targeted authentication, 14 passing |
| `.verification/phase16-final-tests.txt` | Initial attempt with stopped-database setup failures |
| `.verification/phase16-recheck-tests.txt` | Final complete suite, 208 passing |
| `.verification/phase16-browser-run.txt` and `phase16-browser.json` | Successful browser run and check list |
| `.verification/phase16-build.txt` | Successful production build |
| `.verification/phase16-schema.txt` | Valid Prisma schema |
| `.verification/phase16-migrations.txt` | Ten migrations, database up to date |

The browser harness retains its original `phase14-*.png` screenshot naming; the rerun refreshed those local screenshots. These artifacts are not committed project data. PowerShell may format Prisma's informational stderr output as `NativeCommandError`; schema validation and migration status both completed successfully. Judge the process exit status and final Prisma result, not that redirection formatting alone.

## Remaining limitations

- The earlier isolated login HTTP 500 has not reproduced and its original cause is unconfirmed. The new safe diagnostic code should help if it recurs.
- Payments, schedules and fares are academic demonstrations, not official NRC data. Existing seed dates are preserved and may be past; prepare a future admin schedule before presenting.
- No real gateway, refund workflow, password reset/email verification or offline boarding is implemented.
- QR tokens prevent repeated consumption after boarding, but a copied token could be presented first; staff identity checks are still necessary.
- Fraud scores are explainable policy indicators, not trained predictions or calibrated probabilities. Human review is required.
- Physical cameras/devices, Safari/Firefox, sustained load, multi-instance operation, independent penetration testing and disaster recovery have not been verified.
- Rate limits use process memory. Production TLS, database transport security, shared limit storage, secret management and operational monitoring need deployment work.
- Audit history is append-oriented through the API, not tamper-proof against privileged database changes.

Phase 16 documentation and local verification are complete within these limits. Deployment/Phase 15 work was not performed.
