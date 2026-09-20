export const FACTORS = Object.freeze(['price', 'departure', 'duration', 'availability']);
export const BEST_OVERALL_WEIGHTS = Object.freeze({ price: 0.35, departure: 0.20, duration: 0.20, availability: 0.25 });
export const PREFERENCES = Object.freeze({
  BEST_OVERALL: { label: 'Best Overall', weights: BEST_OVERALL_WEIGHTS },
  CHEAPEST: { label: 'Cheapest', weights: { price: 1, departure: 0, duration: 0, availability: 0 } },
  EARLIEST: { label: 'Earliest', weights: { price: 0, departure: 1, duration: 0, availability: 0 } },
  FASTEST: { label: 'Fastest', weights: { price: 0, departure: 0, duration: 1, availability: 0 } },
  MOST_SEATS_AVAILABLE: { label: 'Most Seats Available', weights: { price: 0, departure: 0, duration: 0, availability: 1 } },
});
export const round = (value, digits = 6) => Number(value.toFixed(digits));
export const tied = (a, b) => Math.abs(a - b) <= 1e-9;

export function normalize(value, min, max, higherIsBetter = false) {
  if (![value, min, max].every(Number.isFinite) || max < min || value < min || value > max) throw new RangeError('Invalid normalization inputs.');
  // A constant factor is equally satisfactory for all candidates. It cannot
  // influence their ordering, and this also handles a single candidate safely.
  if (min === max) return 1;
  return higherIsBetter ? (value - min) / (max - min) : (max - value) / (max - min);
}
export function weightedScore(scores, weights) {
  if (!FACTORS.every(key => Number.isFinite(weights[key]) && weights[key] >= 0) || !tied(FACTORS.reduce((sum, key) => sum + weights[key], 0), 1)) throw new RangeError('Weights must be nonnegative and sum to one.');
  if (!FACTORS.every(key => Number.isFinite(scores[key]) && scores[key] >= 0 && scores[key] <= 1)) throw new RangeError('Factor scores must be between zero and one.');
  return 100 * FACTORS.reduce((sum, key) => sum + weights[key] * scores[key], 0);
}
export function normalizedFactors(values, ranges) {
  return Object.fromEntries(FACTORS.map(key => [key, normalize(values[key], ranges[key].min, ranges[key].max, key === 'availability')]));
}
