import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, ArrowLeftRight, MapPin, CalendarDays } from 'lucide-react';
import { usePublicData } from '../../hooks/usePublicData.js';
import { travelDate } from '../../utils/journeys.js';

export default function TrainSearchForm({ initial = {}, busy = false }) {
  const navigate = useNavigate(), stations = usePublicData('/stations');
  const [originId, setOrigin] = useState(initial.originId ?? ''), [destinationId, setDestination] = useState(initial.destinationId ?? ''), [date, setDate] = useState(initial.date ?? travelDate());
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault(); setError('');
    if (originId === destinationId) { setError('Please choose different origin and destination stations.'); return; }
    if (date < travelDate()) { setError('Choose today or a future travel date.'); return; }
    navigate(`/search?${new URLSearchParams({ originId, destinationId, date, preference: initial.preference ?? 'BEST_OVERALL' })}`);
  }
  function stationField(kind, title, value, change, other) {
    return <label className="journey-field"><span><MapPin size={15} aria-hidden="true" />{title}</span><select name={kind} value={value} required disabled={stations.loading || Boolean(stations.error)} onChange={event => change(event.target.value)}>
      <option value="">{stations.loading ? 'Loading stations…' : `Select ${title.toLowerCase()}`}</option>
      {value && !stations.data.some(station => station.id === value) && <option value={value}>Unavailable station — choose another</option>}
      {stations.data.map(station => <option key={station.id} value={station.id} disabled={station.id === other}>{station.name}</option>)}
    </select></label>;
  }
  return <form className="journey-search" onSubmit={submit} aria-label="Find a train" aria-busy={busy || stations.loading}>
    <div className="journey-search-fields">
      {stationField('originId', 'From', originId, setOrigin, destinationId)}
      <button className="swap-stations" type="button" aria-label="Swap origin and destination" onClick={() => { setOrigin(destinationId); setDestination(originId); }} disabled={stations.loading}><ArrowLeftRight size={18} aria-hidden="true" /></button>
      {stationField('destinationId', 'To', destinationId, setDestination, originId)}
      <label className="journey-field"><span><CalendarDays size={15} aria-hidden="true" />Travel date</span><input name="date" aria-label="Travel date" type="date" required min={travelDate()} value={date} onChange={event => setDate(event.target.value)} /></label>
      <button className="button button-primary journey-submit" disabled={busy || stations.loading || Boolean(stations.error) || stations.data.length < 2}>{busy ? 'Searching…' : 'Search trains'}<ArrowRight size={18} aria-hidden="true" /></button>
    </div>
    {stations.error ? <div className="search-message error" role="alert">{stations.error}<button type="button" onClick={stations.retry}>Reload stations</button></div> : !stations.loading && stations.data.length < 2 ? <p className="search-message" role="status">Routes are being prepared. Please check back when more stations are available.</p> : null}
    {error && <p className="search-message error" role="alert">{error}</p>}
  </form>;
}
