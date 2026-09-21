import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, TrainFront, Clock3, Armchair, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import TrainSearchForm from '../../components/passenger/TrainSearchForm.jsx';
import { JourneyRecommendation, RecommendationControls } from '../../components/passenger/Recommendation.jsx';
import { searchJourneys } from '../../api/journeys.js';
import { fare, duration, journeyTime, journeyDate, travelDate } from '../../utils/journeys.js';

function JourneyCard({ journey }) {
  const overnight = travelDate(journey.arrivalTime) !== travelDate(journey.departureTime);
  return <article className="journey-result"><header><div><span className="result-train-icon"><TrainFront size={22} aria-hidden="true" /></span><div><h2>{journey.train.name}</h2><span>{journey.train.code}</span></div></div>{journey.isDemo && <span className="badge">Demonstration schedule</span>}</header>
    <div className="result-details"><div className="result-timeline"><div><strong>{journeyTime(journey.departureTime)}</strong><p>{journey.origin.name}</p><small>{journeyDate(journey.departureTime)}</small></div><div className="journey-duration"><span><Clock3 size={13} aria-hidden="true"/>{duration(journey.durationMinutes)}</span><div><i/><span/><ArrowRight size={15} aria-hidden="true"/></div><small>Direct journey</small></div><div><strong>{journeyTime(journey.arrivalTime)}</strong><p>{journey.destination.name}</p><small>{journeyDate(journey.arrivalTime)}{overnight ? ' · later date' : ''}</small></div></div>
    <div className="result-fares"><div><span>Economy</span><strong>{fare(journey.fareEconomy, journey.currency)}</strong></div><div><span>Business</span><strong>{fare(journey.fareBusiness, journey.currency)}</strong></div></div></div>
    <JourneyRecommendation journey={journey}/>
    <Link className="button button-primary result-booking-link" to={`/schedules/${journey.id}/seats`}>{journey.availableSeats ? 'Select seat' : 'View seats'}<ArrowRight size={17}/></Link>
    <footer><span className={journey.availableSeats ? 'seat-availability' : 'seat-availability sold-out'}><Armchair size={16} aria-hidden="true"/>{journey.availableSeats ? `${journey.availableSeats} ${journey.availableSeats === 1 ? 'seat' : 'seats'} available` : 'No seats currently available'}</span><span>Times in WAT · Fares in {journey.currency}</span></footer>
  </article>;
}
export default function SearchResultsPage() {
  const [params, setParams] = useSearchParams(); const queryString = params.toString();
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
  const searching = Boolean(queryString);
  useEffect(() => {
    if (!queryString) { setData(null); setError(null); setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError(null); setData(null);
    searchJourneys(Object.fromEntries(new URLSearchParams(queryString)), controller.signal).then(result => { if (!controller.signal.aborted) { setData(result); setLoading(false); } }).catch(failure => { if (!controller.signal.aborted) { setError({ message: failure.response?.data?.message ?? 'We could not load your journeys. Please check your connection and try again.', fields: failure.response?.data?.fields, invalid: failure.response?.status === 422 }); setLoading(false); } });
    return () => controller.abort();
  }, [queryString, attempt]);
  function changePage(page) { const next = new URLSearchParams(params); next.set('page', String(page)); setParams(next); }
  function changePreference(preference) { const next = new URLSearchParams(params); next.set('preference', preference); next.delete('page'); setParams(next); }
  return <div className="search-results-page"><div className="results-banner"><div className="container"><span className="eyebrow">A JOURNEY TO LOOK FORWARD TO</span><h1>Find your next train.</h1><p>Compare journeys. Make room for what matters.</p></div></div><div className="container results-container"><div className="search-card"><TrainSearchForm key={`${params.get('originId')}:${params.get('destinationId')}:${params.get('date')}`} initial={Object.fromEntries(params)} busy={loading}/></div>
    <div className="results-intro"><p><strong>Explore schedules</strong> · Nigerian time (WAT)</p><span>Choose a seat and create a pending reservation.</span></div>
    {searching && <RecommendationControls preference={params.get('preference') ?? 'BEST_OVERALL'} onChange={changePreference} metadata={data?.recommendation} busy={loading}/>}
    <section aria-label="Search results" aria-live="polite" aria-busy={loading}>
    {loading ? <div className="public-state results-state" role="status"><TrainFront size={36} aria-hidden="true"/><h2>Finding your journeys…</h2><p>Checking schedules and available seats.</p></div> : error ? <div className="public-state results-state error" role="alert"><h2>{error.invalid ? 'Check your journey details' : 'Unable to load journeys'}</h2><p>{error.message}</p>{error.fields && <ul>{Object.entries(error.fields).map(([key, message]) => <li key={key}>{message}</li>)}</ul>}{!error.invalid && <button className="button button-primary" onClick={() => setAttempt(value => value + 1)}>Try again</button>}</div> : data ? <><div className="results-heading"><div><h2>{data.criteria.origin.name} <ArrowRight size={21} aria-hidden="true"/> {data.criteria.destination.name}</h2><p>{journeyDate(data.criteria.date)}</p></div><span>{data.total} {data.total === 1 ? 'journey' : 'journeys'} found</span></div>
      {!data.items.length ? <div className="public-state results-state"><Search size={37} aria-hidden="true"/><h2>{data.total ? 'No journeys on this page' : 'No trains found for this journey'}</h2><p>{data.total ? 'Return to the first page to see the available journeys.' : 'Try another travel date or change your stations. Only future scheduled journeys on active routes are shown.'}</p>{data.total > 0 && <button className="button button-outline" onClick={() => changePage(1)}>First page</button>}</div> : <div className="journey-results">{data.items.map(journey => <JourneyCard key={journey.id} journey={journey}/>)}</div>}
      {data.pages > 1 && <nav className="results-pagination" aria-label="Search result pages"><button className="button button-outline" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}><ChevronLeft size={17}/>Previous</button><span>Page {data.page} of {data.pages}</span><button className="button button-outline" disabled={data.page >= data.pages} onClick={() => changePage(data.page + 1)}>Next<ChevronRight size={17}/></button></nav>}
    </> : !searching && <div className="public-state results-state"><MapSearchIcon/><h2>Where would you like to go?</h2><p>Choose two stations and a date to explore available journeys.</p></div>}
    </section><div className="results-disclaimer"><strong>A note about this project</strong><p>Demo schedules and fares are not official Nigerian Railway Corporation data. Seat counts reflect the latest search and may change. Searching does not reserve a seat.</p><Link to="/#faq">Read the FAQs <ArrowRight size={14}/></Link></div>
  </div></div>;
}
function MapSearchIcon() { return <Search size={38} aria-hidden="true"/>; }
