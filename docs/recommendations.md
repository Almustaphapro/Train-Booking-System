# Phase 6 — Explainable train recommendations

The public search now compares real database journeys using a transparent multi-criteria decision model. Open `/search`, choose a route and future date, then select **Best Overall**, **Cheapest**, **Earliest**, **Fastest**, or **Most Seats Available**. Each eligible result includes a score, label, explanation, strengths badges and an expandable calculation table. The preference is stored in the URL and survives reloads; changing it returns to the first result page.

This is a rule-based recommendation engine, not a trained machine-learning model. It uses no passenger history or personal data. Phase 7 adds [seat selection and pending bookings](bookings.md) after search, followed by [Phase 8 demo payments](demo-payments.md). Recommendation calculations alone never reserve seats. Phase 9 adds [electronic QR tickets, printing and PDFs](qr-tickets.md). Demonstration schedules and fares are not official Nigerian Railway Corporation data.

## Model and calculation

The backend first finds all valid schedules for the selected route and Nigerian departure date, applying the existing public-search rules. Cancelled/departed schedules and inactive trains, routes or stations are excluded. A candidate must have at least one genuinely available seat, valid comparison values and an NGN fare to receive a score. Sold-out results remain visible at the end without a score or recommendation badge.

Four factors are calculated from the database:

| Factor | Measurement | Preferred direction |
| --- | --- | --- |
| Price | Economy fare in NGN | Lower |
| Departure | Actual departure timestamp | Earlier |
| Duration | Arrival minus departure, in minutes | Shorter |
| Availability | Total active available seats across both classes | Higher |

Normalization converts these different units to a common 0–1 scale. For candidate value `x`, calculate the minimum and maximum across every eligible journey in this search:

```text
Cost factor (price, departure, duration): (maximum - x) / (maximum - minimum)
Benefit factor (availability):           (x - minimum) / (maximum - minimum)

Score = 100 × (priceWeight × normalizedPrice
             + departureWeight × normalizedDeparture
             + durationWeight × normalizedDuration
             + availabilityWeight × normalizedAvailability)
```

When maximum equals minimum, the normalized factor is 1 for everyone. It cannot distinguish candidates and cannot change their order. This avoids division by zero. A single candidate consequently scores 100 but is labelled **Only available option**, with an explicit explanation that there is no comparative evidence. Scores are relative utility values, not probabilities, service quality ratings or guarantees.

| Preference | Price | Departure | Duration | Availability |
| --- | ---: | ---: | ---: | ---: |
| Best Overall | 35% | 20% | 20% | 25% |
| Cheapest | 100% | 0% | 0% | 0% |
| Earliest | 0% | 100% | 0% | 0% |
| Fastest | 0% | 0% | 100% | 0% |
| Most Seats Available | 0% | 0% | 0% | 100% |

Best Overall balances affordability, convenient departure, journey duration and inventory. These weights are explicit project design choices, not learned or empirically validated passenger preferences. A specific preference uses all weight on its requested factor so, for example, Cheapest actually returns the cheapest eligible journey first. The intelligence claim rests on the normalized multi-factor Best Overall model and its explainable trade-offs, not simply renaming a fare sort as AI.

All matching candidates are scored **before pagination**. This prevents a best journey on another page from being missed and keeps scores independent of page size. Results sort by unrounded preference score descending, then unrounded Best Overall score descending, departure ascending and schedule ID ascending. Joint top scores are labelled jointly; an epsilon of `1e-9` handles floating-point equality for labels/badges. Displayed scores are rounded to two decimals. A factor badge identifies its best eligible value only when that factor varies; tied factor leaders can share badges.

Explanations are generated from the measured factors. Best Overall highlights up to three relatively strong factors and a weak factor when present. Specific preferences name the requested advantage and disclose tie-breaks. Each result exposes normalized factors, weights and weighted point contributions, allowing the calculation to be checked independently.

## Worked demonstration

These deliberately contrasting test fixtures are demonstration values, not published railway fares or schedules. All departures are on the same day.

| Journey | Economy fare (NGN) | Departure | Duration (minutes) | Seats available |
| --- | ---: | --- | ---: | ---: |
| Budget | 100 | 08:00 | 300 | 1 |
| Early | 500 | 06:00 | 200 | 4 |
| Fast | 600 | 10:00 | 60 | 3 |
| Spacious | 700 | 12:00 | 180 | 20 |
| Balanced | 250 | 07:00 | 90 | 15 |

Balanced has normalized values:

```text
Price:        (700 - 250) / (700 - 100) = 0.75
Departure:    (12 - 7) / (12 - 6)       = 0.833333...
Duration:     (300 - 90) / (300 - 60)   = 0.875
Availability: (15 - 1) / (20 - 1)       = 0.736842...

Best Overall = 100 × (0.35 × 0.75 + 0.20 × 5/6
                   + 0.20 × 0.875 + 0.25 × 14/19)
             = 78.84 (rounded)
```

Balanced wins Best Overall despite not being the best on any single factor. The other four preferences select Budget, Early, Fast and Spacious respectively. This demonstrates a genuine weighted trade-off rather than a fixed ordering presented under different names.

## API contract

The existing `GET /api/schedules/search` accepts an optional `preference` query parameter:

```text
BEST_OVERALL (default)
CHEAPEST
EARLIEST
FASTEST
MOST_SEATS_AVAILABLE
```

For example:

```text
/api/schedules/search?originId=<id>&destinationId=<id>&date=<future-date>&preference=FASTEST
```

The existing station, date and pagination parameters remain supported. Unknown preferences, duplicate query parameters and attempts to supply arbitrary weights return HTTP 422. Search remains a public read-only API. Authentication and admin permissions are unchanged.

Every `data.items[]` result adds a `recommendation` object:

| Field | Meaning |
| --- | --- |
| `eligible` | Whether this journey has usable data and available seats |
| `score`, `overallScore` | Selected preference score and Best Overall score, 0–100; null when excluded |
| `rank` | Stable position among all eligible results, not just this page |
| `label`, `explanation` | Human-readable outcome and reasons |
| `badges` | Best Overall and individual factor strengths |
| `isRecommended`, `tied` | Whether it shares the selected top score and whether that top score is joint |
| `factors` | Per-factor raw `value`, `normalized`, `weight`, and `contribution` in score points |

`data.recommendation` describes the model: version `weighted-minmax-v1`, preference, selected and Best Overall weights, price/currency/availability bases, candidate and eligible counts, factor min/max ranges, score scale and tie-break policy. Departure raw values and ranges are Unix milliseconds. Empty or wholly ineligible results have null ranges. Excluded journeys have null scores/rank/factors and an explanation; no phantom winners are generated.

## Boundaries and limitations

- Economy fare and total seat availability are compared separately. This phase does not guarantee availability in Economy or Business specifically; the interface discloses that distinction. Class selection belongs with later seat selection.
- Compare scores only within the same search and preference. Different candidates or inventory changes alter min/max ranges and can change scores and rankings. Min-max normalization is sensitive to outliers.
- Earlier departure is a declared preference, not a prediction that every passenger prefers early travel. Duration comes from planned timestamps; this model does not predict delays.
- Availability is a database snapshot. Searching creates no reservation. Held, booked, blocked, out-of-service or actively claimed seats remain excluded under the Phase 5 rules.
- All matching records for one route/day are fetched, with safe projections and existing indexes. Ranking takes O(n log n) time and O(n) application memory. This suits the current demonstration workload; substantially larger datasets would need profiling and database-side aggregation/ranking, not silent candidate truncation that changes recommendations.
- There is no model training, external fare source, personalization, recommendation write endpoint or new schema migration.

For a B.Sc. defense: “The system is a multi-criteria decision support engine. It retrieves valid train journeys, normalizes fare, departure, duration and available seats, and combines them with documented weights. It explains both advantages and trade-offs and changes the recommendation when the user's preference changes. Its decisions can be reproduced from the returned factor values. It is an explainable rule-based system, not a claim of machine learning.”

## Implementation and verification

- `server/src/recommendation/scoring.js`: factors, weights, normalization and weighted utility.
- `server/src/recommendation/recommendation.service.js`: eligibility, global ranking, badges, explanations and metadata.
- `server/src/services/search.service.js`, `validators/search.validators.js`: database-search integration and validated preference.
- `client/src/components/passenger/Recommendation.jsx`, `styles/recommendation.css`: preference control, responsive badges, explanations and score tables.
- `client/src/pages/public/SearchResultsPage.jsx`, `components/passenger/TrainSearchForm.jsx`, `main.jsx`: search integration and URL persistence.
- `server/tests/recommendation.test.js`: 15 deterministic mathematical and edge-case tests, included in `npm test`.
- `server/tests/recommendation.integration.test.js`: seven database/API tests, including contrasting winners, pagination invariance, invalid inputs, cancelled journeys, changed inventory and empty results.
- Root/server `package.json` and project guides: test commands and documentation. No dependencies were added.

Use the existing MySQL development database:

```powershell
npm.cmd test
$env:ALLOW_DB_TESTS = 'true'
npm.cmd run test:recommendation
npm.cmd run test:search
npm.cmd run test:auth
npm.cmd run test:admin
npm.cmd run test:db
Remove-Item Env:ALLOW_DB_TESTS
npm.cmd run build
```

The automated suite passed all **90 tests**: 29 foundation/validation/recommendation tests, seven recommendation API tests, 12 public-search tests, 14 authentication tests, 16 admin tests and 12 database tests. Test records use unique identifiers and are removed afterwards; existing demonstration data is preserved.

Verified on 20 September 2026: the production frontend build passed. Real Edge browser checks confirmed all five distinct preference winners, the calculated 78.84 Best Overall score, badge/explanation rendering, expandable weights and factor tables, pagination reset, reload and search-form preference persistence, invalid-preference recovery, and single-option/all-sold-out states. Results and expanded explanations had no horizontal page overflow at 320, 390, 768, 1024 and 1440 pixels. Desktop/mobile screenshots were reviewed; no uncaught browser exceptions occurred. Temporary browser fixtures were removed. The seed verification still reports three users, four stations, four routes, two trains, 48 seats, 12 schedules and 288 schedule-seat records.
