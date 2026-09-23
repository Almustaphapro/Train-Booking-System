# Project defense guide

Use these answers to explain the implemented system. Demonstrate it with future demonstration schedules and describe simulated services honestly. The [final status report](final-status.md) records what was actually verified.

## 1. How does the system work?

Administrators define stations, routes, trains, seats and schedules. A passenger searches real database schedules, compares explainable recommendations, selects a seat and creates a temporary reservation. The server processes a demonstration payment; success confirms the booking and produces a QR ticket. An officer validates that ticket for the selected schedule and confirms boarding once. Administrators monitor bookings, payments, suspicious-activity alerts and audit evidence.

## 2. Why did we use React?

React lets us reuse components such as forms, seat maps, tables and ticket cards across role-specific pages. State updates keep availability, loading, errors and payment results synchronized with the API. React Router organizes navigation and frontend access guards. React improves the interface; backend checks still enforce security.

## 3. Why Node.js and Express?

Node.js lets the frontend and backend use JavaScript, reducing the project's language overhead. Its asynchronous I/O suits API/database operations. Express provides routing and middleware without requiring a large framework. Separate services keep business rules testable. Database transactions, rather than Node's event loop, provide reservation correctness.

## 4. Why MySQL and Prisma?

The domain is relational: passengers own bookings, trains contain seats, schedules use routes and payments relate to bookings. MySQL provides foreign keys, unique constraints and transactions. Prisma describes relationships, generates a query client and manages migration history. Custom SQL migrations add integrity checks/triggers that complement Prisma and service validation.

## 5. How is double booking prevented?

Each schedule/seat pair has one inventory record. A reservation transaction conditionally claims AVAILABLE inventory and creates a unique active booking claim. Two competing transactions cannot both acquire that claim. Conflict handling returns HTTP 409 to the loser and rolls back incomplete writes. Cancelled/expired bookings remain historical records but release the active claim. The critical API test submits competing requests and checks one winner.

## 6. How does JWT authentication work?

After verifying credentials, the server creates an expiring database session and signs a JWT containing the user and session identifiers. An HttpOnly cookie carries it. Protected requests verify its signature, algorithm, issuer, audience and expiry, then check the live session and current user status/role. Logout revokes the session and clears the cookie. A JWT is signed, not encrypted; it contains no password.

## 7. How are passwords protected?

Passwords are hashed with bcrypt at cost 12 and a salt, then checked using bcrypt comparison. Plaintext passwords and password hashes are never returned by the API. Registration enforces length/complexity and bcrypt's 72-byte limit. Demo seeding deliberately permits simpler local presentation passwords; this exception does not weaken public registration. Production transport still requires HTTPS.

## 8. How does QR validation work?

The QR contains a cryptographically random 32-byte token, not passenger details. The server locates the ticket and checks current ticket usage, booking confirmation, matching paid amount/currency, seat state, expiry and selected schedule. A successful check gives the officer a short-lived verification record. Confirm Boarding rechecks the state and atomically marks the ticket USED with a timestamp and scan log.

## 9. Why can't copied QR tickets be reused?

After the first successful boarding, the database marks the ticket USED. Every later presentation is rejected and logged, and a HIGH duplicate-use alert is created. Concurrent boarding requests have only one winner. However, copying a QR is still possible: a copy could be presented before the rightful passenger. The token is a bearer credential, so staff identity checks remain necessary. The design prevents repeated consumption, not image copying.

## 10. What makes the system intelligent?

It derives decisions from multiple factors and explains them: normalized weighted train recommendations and a hybrid of suspicious-activity rules with anomaly scoring. Scores depend on actual schedules, availability and activity history. This is explainable decision support; the project does not claim learned intelligence or an empirically calibrated fraud probability.

## 11. How does the recommendation algorithm work?

For all eligible journeys in a search, fare, departure and duration are cost factors: lower is better. Available seats are a benefit factor: higher is better. Each becomes a value between zero and one:

```text
costScore    = (maximum - value) / (maximum - minimum)
benefitScore = (value - minimum) / (maximum - minimum)
overall      = 100 × (0.35×price + 0.20×departure + 0.20×duration + 0.25×availability)
```

If a factor is identical for every candidate, its score is one for all and cannot change their relative order. Single-preference choices assign weight one to that factor; ties use overall utility, then departure and ID. Normalization happens before pagination. Sold-out options receive no recommendation. A single option is labelled explicitly, so its score is not presented as evidence of superior service. See the [worked numerical example](recommendations.md).

## 12. How does anomaly scoring work?

The server counts events in defined time windows, converts them to bounded points and caps the rounded total at 100. The current policy is:

| Factor | Points, clamped between zero and the stated maximum |
| --- | --- |
| Booking attempts in 10 minutes | `(attempts - 8) × 5`, maximum 25 |
| Invalid scans in 10 minutes | `count × 7`, maximum 40 |
| Provider declines in 30 minutes | `count × 10`, maximum 30 |
| Created bookings in 24 hours | `(count - 20) × 1.5`, maximum 15 |
| Cancellation rate | `(rate - 0.30) / 0.50 × 25`, maximum 25; at least 10 bookings required |
| Used-ticket repeats in 24 hours | Zero when none; otherwise `55 + 5 × count`, maximum 80 |

LOW is 0–29, MEDIUM 30–59, HIGH 60–79 and CRITICAL 80–100. Twelve booking attempts contribute 20 points; three declines add 30; six cancellations among ten created bookings add 15: total **65, HIGH**. Explanations show these contributions.

Rules also produce alerts independently: a used ticket always produces a HIGH duplicate-use alert. Its rule-priority score need not equal the separate anomaly snapshot. Invalid scans are associated with the recording officer when the passenger cannot be identified; ownership of a copied ticket is not proof that its owner presented it. All alerts require human interpretation.

## 13. Is the fraud system machine learning?

No. It combines deterministic rules and manually specified, explainable anomaly weights. The model version labels a policy version, not a trained model. No training dataset, learned parameters or predictive accuracy claim is involved.

## 14. Why not use full machine learning?

This academic project has no representative, reliably labelled railway fraud dataset. Training on tiny invented examples could produce misleading accuracy and unreliable accusations. Explainable policies are reproducible and defensible. Future ML would require lawful data collection, labels, train/test separation, evaluation for false positives and drift, and comparison against this rule baseline.

## 15. How is role-based access implemented?

Backend middleware authenticates the live session and compares the current database role with the route's required role. Passengers access only their own records, officers verify/board tickets, and admins manage/monitor the system. Public registration always creates PASSENGER and rejects injected roles. React protected routes provide appropriate navigation and Unauthorized pages, but the API remains the enforcement point.

## 16. What security controls were implemented?

Controls include bcrypt, signed expiring JWTs, revocable database sessions, HttpOnly/SameSite cookies, Secure production cookies, role/ownership checks, strict backend validation, configured CORS and mutation origin/header checks, Helmet, body-size limits, request throttling, safe error responses, random references/tokens, database constraints and atomic state changes. Audit metadata is sanitized and sensitive fields are excluded from normal responses. These controls are tested locally; no independent penetration-test certification is claimed.

## 17. What are the project's limitations?

Payments/timetables are demonstrations; no official railway feed, real gateway, refunds or offline boarding exists. Account recovery/email verification and comprehensive operational deployment are future work. Fraud thresholds are uncalibrated policy choices and may produce false positives. A copied QR can be presented first. Rate limiting is process-local. Browser tests emulate widths and camera frames, not every physical device/browser. Local concurrency tests do not establish production capacity, and audit storage is not cryptographically immutable. Consult final status for any unresolved verification issue.

## 18. What could be added in the future?

Real gateway adapters with verified idempotent webhooks and refunds; official schedule integration; passenger identity checks; account recovery and notifications; shared rate limiting; production TLS/secrets/backups/observability; broader accessibility/device/security/load testing; and carefully evaluated ML using suitable governed data. Each addition should retain the database integrity and server-side authorization guarantees.

## Suggested live demonstration

1. Start MySQL, the API and Vite. Prepare a future demo schedule with available Economy and Business seats.
2. Register/login as a passenger, search that route/date and change recommendation preferences. Explain the factors and relative scores.
3. Reserve a seat, show its hold, complete the labelled demo payment and open/print the ticket. Do not expose environment secrets on screen.
4. Login as the officer, select the same schedule, verify and confirm boarding. Present the same ticket again and show rejection with original usage time.
5. Login as admin, inspect the duplicate-use alert, review/resolve it and show the retained audit reason. Show reports from actual records.
6. Present the competing-booking test and final verification report. Distinguish the camera simulation and local tests from real-device/production validation.
