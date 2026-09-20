import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEST_OVERALL_WEIGHTS, FACTORS, normalize, weightedScore } from '../src/recommendation/scoring.js';
import { recommendJourneys } from '../src/recommendation/recommendation.service.js';

function journey(id, price, hour, minutes, seats) {
  const departureTime = new Date(Date.UTC(2030, 0, 1, hour));
  return { id, fareEconomy: price.toFixed(2), fareBusiness: '1000.00', currency: 'NGN', departureTime: departureTime.toISOString(), arrivalTime: new Date(departureTime.getTime() + minutes * 60000).toISOString(), durationMinutes: minutes, availableSeats: seats };
}
const candidates = () => [journey('cheap', 100, 8, 300, 1), journey('early', 500, 6, 200, 4), journey('fast', 600, 10, 60, 3), journey('seats', 700, 12, 180, 20), journey('balanced', 250, 7, 90, 15)];

test('normalization reverses cost factors and rewards higher seat availability', () => {
  assert.equal(normalize(100, 100, 700), 1); assert.equal(normalize(700, 100, 700), 0); assert.equal(normalize(250, 100, 700), 0.75);
  assert.equal(normalize(1, 1, 20, true), 0); assert.equal(normalize(20, 1, 20, true), 1);
  assert.equal(normalize(7, 6, 12), 5 / 6); assert.equal(normalize(90, 60, 300), 0.875);
});
test('Best Overall combines all four normalized factors with a hand-verifiable weighted score', () => {
  const expected = 100 * (0.35 * 0.75 + 0.20 * (5 / 6) + 0.20 * 0.875 + 0.25 * (14 / 19));
  const result = recommendJourneys(candidates()); const best = result.items[0];
  assert.equal(best.id, 'balanced'); assert.equal(best.recommendation.score, Number(expected.toFixed(2))); assert.equal(best.recommendation.score, 78.84);
  assert.equal(best.recommendation.label, 'Best Overall'); assert.deepEqual(result.metadata.weights, BEST_OVERALL_WEIGHTS);
  assert.ok(!['cheap', 'early', 'fast', 'seats'].includes(best.id));
});
for (const [preference, id] of [['CHEAPEST', 'cheap'], ['EARLIEST', 'early'], ['FASTEST', 'fast'], ['MOST_SEATS_AVAILABLE', 'seats']]) {
  test(`${preference} chooses its own winner and exposes the preference weights`, () => {
    const result = recommendJourneys(candidates(), preference); assert.equal(result.items[0].id, id); assert.equal(result.items[0].recommendation.score, 100);
    assert.equal(Object.values(result.metadata.weights).reduce((sum, value) => sum + value, 0), 1);
    assert.equal(Object.values(result.metadata.weights).filter(value => value === 1).length, 1);
    assert.ok(result.items[0].recommendation.explanation.includes('among journeys with available seats'));
  });
}
test('badges identify genuine factor leaders and explanations include strengths and trade-offs', () => {
  const rows = recommendJourneys(candidates()).items;
  for (const [id, label] of [['cheap', 'Cheapest'], ['early', 'Earliest'], ['fast', 'Fastest'], ['seats', 'Most Seats Available'], ['balanced', 'Best Overall']]) assert.ok(rows.find(row => row.id === id).recommendation.badges.includes(label));
  assert.match(rows[0].recommendation.explanation, /relatively low Economy fare/);
  assert.match(rows.find(row => row.id === 'cheap').recommendation.explanation, /Trade-off:/);
});
test('sold-out options are unscored, cannot win badges, and do not distort normalization', () => {
  const before = recommendJourneys(candidates()); const after = recommendJourneys([...candidates(), journey('unavailable', 0, 1, 1, 0)]);
  assert.deepEqual(after.metadata.ranges, before.metadata.ranges);
  assert.deepEqual(after.items.slice(0, 5), before.items);
  const sold = after.items.at(-1).recommendation; assert.equal(sold.score, null); assert.equal(sold.isRecommended, false); assert.deepEqual(sold.badges, []); assert.match(sold.explanation, /No seats/);
});
test('single available candidate is explicit about the lack of comparative evidence', () => {
  const row = recommendJourneys([journey('only', 0, 8, 1, 1)]).items[0].recommendation;
  assert.equal(row.score, 100); assert.equal(row.label, 'Only available option'); assert.deepEqual(row.badges, []); assert.match(row.explanation, /no alternatives/i);
});
test('identical factors remain finite and joint winners have stable order', () => {
  const first = journey('a', 100, 8, 90, 5), second = { ...first, id: 'b' };
  for (const input of [[first, second], [second, first]]) {
    const result = recommendJourneys(input); assert.deepEqual(result.items.map(row => row.id), ['a', 'b']);
    for (const row of result.items) { assert.equal(row.recommendation.score, 100); assert.equal(row.recommendation.label, 'Joint Best Overall'); assert.equal(row.recommendation.tied, true); assert.match(row.recommendation.explanation, /tied on all four factors/); assert.deepEqual(row.recommendation.badges, ['Best Overall']); }
  }
});
test('preference ties use the overall score before departure time and ID', () => {
  const a = journey('a', 100, 6, 300, 1), b = journey('b', 100, 8, 60, 20);
  const result = recommendJourneys([a, b], 'CHEAPEST'); assert.equal(result.items[0].id, 'b'); assert.ok(result.items.every(row => row.recommendation.tied)); assert.match(result.items[0].recommendation.explanation, /All candidates tie/);
});
test('empty and entirely sold-out searches do not produce phantom recommendations', () => {
  assert.deepEqual(recommendJourneys([]).items, []); assert.equal(recommendJourneys([]).metadata.ranges, null);
  const result = recommendJourneys([journey('none', 100, 8, 90, 0)]); assert.equal(result.metadata.eligibleCount, 0); assert.equal(result.items[0].recommendation.rank, null);
});
test('invalid numbers and unsupported currencies never become apparently good scores', () => {
  const original = journey('invalid', 100, 8, 90, 4);
  for (const changes of [{ fareEconomy: '' }, { fareEconomy: 'Infinity' }, { availableSeats: -1 }, { availableSeats: 1.5 }, { arrivalTime: original.departureTime }, { currency: 'USD' }, { departureTime: 'invalid' }]) {
    const result = recommendJourneys([{ ...original, ...changes }]); assert.equal(result.metadata.eligibleCount, 0); assert.equal(result.items[0].recommendation.score, null);
  }
  assert.throws(() => recommendJourneys([], 'UNKNOWN'), RangeError);
});
test('weighted contributions reconstruct the displayed score and the model does not mutate input', () => {
  const input = candidates(), snapshot = structuredClone(input); const result = recommendJourneys(input);
  assert.deepEqual(input, snapshot);
  for (const row of result.items) {
    const points = Object.values(row.recommendation.factors).reduce((sum, factor) => sum + factor.contribution, 0);
    assert.ok(Math.abs(points - row.recommendation.score) <= 0.005001);
    assert.ok(row.recommendation.score >= 0 && row.recommendation.score <= 100);
  }
});
test('normalization is scale-invariant and improving a normalized factor cannot reduce weighted utility', () => {
  assert.equal(normalize(250, 100, 700), normalize(25000, 10000, 70000));
  const values = Object.fromEntries(FACTORS.map(key => [key, 0.5]));
  for (const factor of FACTORS) assert.ok(weightedScore({ ...values, [factor]: 0.75 }, BEST_OVERALL_WEIGHTS) > weightedScore(values, BEST_OVERALL_WEIGHTS));
  assert.throws(() => normalize(NaN, 0, 1), RangeError); assert.throws(() => normalize(1, 2, 1), RangeError);
  assert.throws(() => weightedScore(values, { ...BEST_OVERALL_WEIGHTS, price: 2 }), RangeError);
});
