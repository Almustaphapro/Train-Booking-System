import { SlidersHorizontal, BadgeCheck } from 'lucide-react';
import { fare, journeyTime, duration } from '../../utils/journeys.js';

export const preferences = [
  ['BEST_OVERALL', 'Best Overall'], ['CHEAPEST', 'Cheapest'], ['EARLIEST', 'Earliest'], ['FASTEST', 'Fastest'], ['MOST_SEATS_AVAILABLE', 'Most Seats Available'],
];
const factorLabels = { price: 'Economy fare', departure: 'Departure time', duration: 'Travel duration', availability: 'Available seats' };
export function RecommendationControls({ preference, onChange, metadata, busy }) {
  return <div className="recommendation-controls"><div className="preference-heading"><div><SlidersHorizontal size={21} aria-hidden="true"/><div><h2>Find your best fit</h2><p>Choose what matters most for this journey.</p></div></div><label><span>Recommendation preference</span><select name="preference" value={preferences.some(([key]) => key === preference) ? preference : ''} onChange={event => onChange(event.target.value)} disabled={busy}>
    <option value="" disabled>Choose a preference</option>{preferences.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select></label></div>
    {metadata && <details className="recommendation-method"><summary>How these recommendations work</summary><p>We compare all {metadata.eligibleCount} {metadata.eligibleCount === 1 ? 'journey' : 'journeys'} with available seats for your route and date, including other result pages. Scores are relative comparisons out of 100, not probabilities or service ratings.</p>
      <p>The model compares <strong>Economy fares in NGN</strong> and <strong>total available seats across both classes</strong>. It does not guarantee a seat in a particular class. Scores should only be compared within the same search and preference.</p>
      <ul>{Object.entries(metadata.weights).map(([key, value]) => <li key={key}>{factorLabels[key]} <strong>{Math.round(value * 100)}%</strong></li>)}</ul>
      <p>Lower fares, earlier departures and shorter journeys score higher; more available seats score higher. Equal values receive equal scores. For a specific preference, that factor receives all the weight; ties use the Best Overall balance, then departure time and schedule ID.</p>
      <p>Sold-out journeys remain visible without a recommendation. With only one option, there is no comparative evidence. This is a transparent rule-based decision model; it does not learn from your personal history.</p>
    </details>}
  </div>;
}
export function JourneyRecommendation({ journey }) {
  const recommendation = journey.recommendation;
  if (!recommendation) return null;
  if (!recommendation.eligible) return <div className="journey-recommendation unavailable"><p>{recommendation.explanation}</p></div>;
  const values = { price: fare(journey.fareEconomy), departure: `${journeyTime(journey.departureTime)} WAT`, duration: duration(journey.durationMinutes), availability: `${journey.availableSeats} seats` };
  return <div className={`journey-recommendation ${recommendation.isRecommended ? 'recommended' : ''}`}>
    <div className="recommendation-heading"><div><span className="recommendation-label">{recommendation.isRecommended && <BadgeCheck size={17} aria-hidden="true"/>}{recommendation.label}</span><span className="recommendation-rank">#{recommendation.rank} for your preference{recommendation.tied ? ' · tied preference score' : ''}</span></div><div className="recommendation-score"><strong>{recommendation.score.toFixed(2)}<small>/100</small></strong><span>Relative score</span></div></div>
    <p className="recommendation-explanation">{recommendation.explanation}</p>
    {recommendation.badges.length > 0 && <div className="recommendation-badges" aria-label="Journey strengths">{recommendation.badges.map(badge => <span key={badge}>{badge}</span>)}</div>}
    <details className="recommendation-breakdown"><summary>See score breakdown</summary><div className="score-table-wrap"><table><caption>Normalized factors and weighted contributions</caption><thead><tr><th>Factor</th><th>Value</th><th>Factor score</th><th>Weight</th><th>Points</th></tr></thead><tbody>{Object.entries(recommendation.factors).map(([key, factor]) => <tr key={key}><th scope="row">{factorLabels[key]}</th><td>{values[key]}</td><td>{(factor.normalized * 100).toFixed(1)}%</td><td>{Math.round(factor.weight * 100)}%</td><td>{factor.contribution.toFixed(2)}</td></tr>)}</tbody></table></div><p>Displayed figures are rounded. A factor shared equally by all candidates scores 100% for everyone and does not change their order.</p></details>
  </div>;
}
