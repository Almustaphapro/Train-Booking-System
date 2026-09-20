import { BEST_OVERALL_WEIGHTS, FACTORS, PREFERENCES, normalizedFactors, round, tied, weightedScore } from './scoring.js';

const primaryFactor = { CHEAPEST: 'price', EARLIEST: 'departure', FASTEST: 'duration', MOST_SEATS_AVAILABLE: 'availability' };
const strengths = { price: 'a relatively low Economy fare', departure: 'an earlier departure', duration: 'a shorter travel time', availability: 'more available seats' };
const tradeoffs = { price: 'its Economy fare is relatively high', departure: 'it departs relatively late', duration: 'its travel time is relatively long', availability: 'it has relatively few available seats' };
const bestClaim = { CHEAPEST: 'the lowest Economy fare', EARLIEST: 'the earliest departure', FASTEST: 'the shortest travel time', MOST_SEATS_AVAILABLE: 'the most available seats' };
const join = parts => parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

function inspect(journey) {
  if (journey.availableSeats === 0) return { reason: 'No seats are currently available, so this journey is not recommended.' };
  if (journey.currency !== 'NGN') return { reason: 'This journey is not scored because this comparison uses NGN fares.' };
  const price = typeof journey.fareEconomy === 'string' && /^\d+(\.\d{1,2})?$/.test(journey.fareEconomy) ? Number(journey.fareEconomy) : NaN;
  const departure = new Date(journey.departureTime).getTime();
  const duration = (new Date(journey.arrivalTime).getTime() - departure) / 60000;
  const values = { price, departure, duration, availability: journey.availableSeats };
  if (!FACTORS.every(key => Number.isFinite(values[key])) || price < 0 || duration <= 0 || !Number.isInteger(values.availability) || values.availability < 1) return { reason: 'This journey has incomplete comparison data and cannot be recommended.' };
  return { values };
}
function explanation(row, context, recommended) {
  const { preference, ranges, count } = context;
  if (count === 1) return 'Only one matching journey has available seats and valid comparison data. There are no alternatives to compare; its score does not imply perfect service.';
  if (FACTORS.every(key => ranges[key].min === ranges[key].max)) return 'These journeys are tied on all four factors. The score cannot distinguish them; departure time and schedule ID provide a stable display order.';
  if (preference !== 'BEST_OVERALL') {
    const factor = primaryFactor[preference];
    const tiedFactor = ranges[factor].min === ranges[factor].max;
    return `${recommended ? `Matches your preference because it has ${bestClaim[preference]} among journeys with available seats.` : `An alternative for ${PREFERENCES[preference].label}; other available journeys perform better on this factor.`}${tiedFactor ? ' All candidates tie on this preference.' : ''} Ties are ordered by the Best Overall score, then departure time and schedule ID.`;
  }
  const varied = FACTORS.filter(key => ranges[key].min !== ranges[key].max);
  const drivers = varied.filter(key => row.scores[key] >= 0.5).sort((a, b) => BEST_OVERALL_WEIGHTS[b] * row.scores[b] - BEST_OVERALL_WEIGHTS[a] * row.scores[a]).slice(0, 3);
  const weak = varied.filter(key => row.scores[key] <= 0.25).sort((a, b) => BEST_OVERALL_WEIGHTS[b] * (1 - row.scores[b]) - BEST_OVERALL_WEIGHTS[a] * (1 - row.scores[a]))[0];
  const detail = drivers.length ? `${recommended ? 'Recommended for' : 'Its strongest factors are'} ${join(drivers.map(key => strengths[key]))}, relative to the other available journeys.` : 'This journey has no strong relative advantage across the four weighted factors.';
  return `${detail}${weak ? ` Trade-off: ${tradeoffs[weak]}.` : ''}`;
}

export function recommendJourneys(journeys, preference = 'BEST_OVERALL') {
  if (!Object.hasOwn(PREFERENCES, preference)) throw new RangeError('Unknown recommendation preference.');
  const profile = PREFERENCES[preference];
  const eligible = [], excluded = [];
  for (const journey of journeys) {
    const inspected = inspect(journey);
    if (inspected.reason) excluded.push({ ...journey, recommendation: { eligible: false, score: null, overallScore: null, rank: null, label: 'Not recommended', explanation: inspected.reason, badges: [], factors: null, isRecommended: false, tied: false } });
    else eligible.push({ journey, values: inspected.values });
  }
  const ranges = Object.fromEntries(FACTORS.map(key => [key, eligible.reduce((range, row) => ({ min: Math.min(range.min, row.values[key]), max: Math.max(range.max, row.values[key]) }), { min: Infinity, max: -Infinity })]));
  for (const row of eligible) {
    row.scores = normalizedFactors(row.values, ranges);
    row.score = weightedScore(row.scores, profile.weights);
    row.overall = weightedScore(row.scores, BEST_OVERALL_WEIGHTS);
  }
  // Never sort on rounded scores. Tie-breaks are reproducible across page sizes.
  const stable = (a, b) => new Date(a.departureTime) - new Date(b.departureTime) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  eligible.sort((a, b) => b.score - a.score || b.overall - a.overall || stable(a.journey, b.journey));
  const top = eligible[0]?.score;
  const joint = eligible.filter(row => tied(row.score, top)).length > 1;
  const bestOverall = eligible.reduce((max, row) => Math.max(max, row.overall), -Infinity);
  const context = { preference, ranges, count: eligible.length };
  const ranked = eligible.map((row, index) => {
    const recommended = tied(row.score, top), badges = [];
    if (eligible.length > 1) {
      if (tied(row.overall, bestOverall)) badges.push('Best Overall');
      for (const [key, factor] of Object.entries(primaryFactor)) if (ranges[factor].min !== ranges[factor].max && tied(row.scores[factor], 1)) badges.push(PREFERENCES[key].label);
    }
    return { ...row.journey, recommendation: {
      eligible: true, score: round(row.score, 2), overallScore: round(row.overall, 2), rank: index + 1,
      label: eligible.length === 1 ? 'Only available option' : recommended ? `${joint ? 'Joint ' : ''}${profile.label}` : 'Alternative',
      explanation: explanation(row, context, recommended), badges, isRecommended: recommended, tied: recommended && joint,
      factors: Object.fromEntries(FACTORS.map(key => [key, { value: row.values[key], normalized: round(row.scores[key]), weight: profile.weights[key], contribution: round(100 * row.scores[key] * profile.weights[key]) }])),
    } };
  });
  excluded.sort(stable);
  return { items: [...ranked, ...excluded], metadata: {
    modelVersion: 'weighted-minmax-v1', preference, label: profile.label, weights: { ...profile.weights }, bestOverallWeights: { ...BEST_OVERALL_WEIGHTS },
    priceBasis: 'ECONOMY', currency: 'NGN', availabilityBasis: 'TOTAL_ACTIVE_AVAILABLE', candidateCount: journeys.length, eligibleCount: eligible.length,
    ranges: eligible.length ? ranges : null, scoreScale: '0–100 relative utility, not a probability',
    tieBreak: 'Selected score, Best Overall score, departure time, schedule ID',
  } };
}
