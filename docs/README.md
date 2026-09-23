# Documentation index

Start with the [project README](../README.md) for installation, environment configuration, migrations, seed, accounts, commands and limitations.

| Document | Purpose |
| --- | --- |
| [Architecture](architecture.md) | Components, request boundaries and background work |
| [Database relationships](database-relationships.md) | Entities, keys, history and integrity guarantees |
| [Database setup](../server/prisma/README.md) | MySQL provisioning, migration details and seed verification |
| [Authentication](authentication.md) | Registration, JWT/session cookies, roles and logout |
| [Admin management](admin-management.md) | Station, route, train, seat and schedule operations |
| [Public search](public-search.md) | Database search, Nigerian travel dates and availability |
| [Recommendation algorithm](recommendations.md) | Normalization, weights, tie handling and worked example |
| [Booking flow](bookings.md) | Seat selection, transactions, competing claims and hold expiry |
| [Demo payments](demo-payments.md) | Server-controlled outcomes and atomic settlement |
| [QR tickets](qr-tickets.md) | Ticket creation, ownership, PDF and validity |
| [Officer verification](officer-verification.md) | Camera/manual verification, boarding and reuse rejection |
| [Fraud/anomaly detection](fraud-monitoring.md) | Rules, scores, explanations, reviews and audit history |
| [System testing](system-testing.md) | Reproduction commands, coverage and historical fixes |
| [Final status](final-status.md) | Latest verification results and unresolved limitations |
| [Defense guide](defense-guide.md) | Answers to all 18 defense questions and presentation sequence |

Phase-labelled verification sections in older guides describe historical checks. Use the final status report for the latest run. All example railway services and payments are academic demonstrations.
