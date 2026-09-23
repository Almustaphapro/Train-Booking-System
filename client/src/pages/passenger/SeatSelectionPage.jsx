import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Armchair, ArrowRight, RefreshCw } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingSummary, BookingState } from '../../components/passenger/BookingSummary.jsx';
import { fare } from '../../utils/journeys.js';
import JourneyProgress from '../../components/passenger/JourneyProgress.jsx';

const labels = { AVAILABLE: 'Available', SELECTED: 'Selected', HELD: 'Held', BOOKED: 'Booked', BLOCKED: 'Unavailable' };
export default function SeatSelectionPage() {
  const { id } = useParams(); const result = useBookingData(`/schedules/${encodeURIComponent(id)}/seats`);
  const [selectedId, setSelectedId] = useState(null);
  const selected = result.data?.seats.find(seat => seat.id === selectedId);
  const valid = selected?.status === 'AVAILABLE' && result.data?.reservable && !result.error;
  return <div className="container booking-page"><Link className="text-link" to="/search">Back to train search</Link><span className="eyebrow">1 / CHOOSE YOUR SEAT</span><h1>A place for your journey.</h1><p className="page-description">Choose one seat. It will only be held after you review and create a pending booking.</p>
    <JourneyProgress step={1}/><BookingState {...result}/>{result.data && <><div className="booking-toolbar"><p>Seat availability refreshes every 15 seconds.</p><button className="button button-outline" disabled={result.loading} onClick={result.refresh}><RefreshCw size={16} aria-hidden="true"/>Refresh seats</button></div>
      {!result.data.reservable && <p role="alert" className="booking-notice error">This journey is no longer open for reservations. Please choose another train.</p>}
      <div className="seat-legend" aria-label="Seat states">{Object.entries(labels).map(([key, label]) => <span key={key}><i className={`seat-swatch ${key.toLowerCase()}`} aria-hidden="true"/>{label}</span>)}</div><p className="sr-only" aria-live="polite">{selected ? `Seat ${selected.seatNumber} selected.` : 'No seat selected.'}</p>
      <div className="booking-columns"><div className="seat-map"><p className="seat-map-note">Seat inventory view · not a physical carriage layout</p>{['ECONOMY', 'BUSINESS'].map(seatClass => <section key={seatClass} aria-label={`${seatClass === 'ECONOMY' ? 'Economy' : 'Business'} seats`}><div className="seat-class-heading"><h2>{seatClass === 'ECONOMY' ? 'Economy' : 'Business'}</h2><span>{fare(seatClass === 'ECONOMY' ? result.data.schedule.fareEconomy : result.data.schedule.fareBusiness, result.data.schedule.currency)}</span></div>
        <div className="seat-grid">{result.data.seats.filter(seat => seat.seatClass === seatClass).map(seat => {
          const state = seat.id === selectedId && seat.status === 'AVAILABLE' ? 'SELECTED' : seat.status;
          return <button key={seat.id} type="button" className={`seat-button ${state.toLowerCase()}`} aria-label={`Seat ${seat.seatNumber}, ${seatClass === 'ECONOMY' ? 'Economy' : 'Business'}, ${labels[state]}`} aria-pressed={state === 'SELECTED'} disabled={seat.status !== 'AVAILABLE' || !result.data.reservable || Boolean(result.error)} onClick={() => setSelectedId(seat.id === selectedId ? null : seat.id)}><Armchair size={22} aria-hidden="true"/><strong>{seat.seatNumber}</strong><small>{labels[state]}</small></button>;
        })}</div>{!result.data.seats.some(seat => seat.seatClass === seatClass) && <p className="seat-map-note">No seats configured for this class.</p>}</section>)}</div>
      <aside><BookingSummary schedule={result.data.schedule} seat={selected}/>{selected && !valid && <p className="booking-notice error" role="alert">This seat cannot currently be reserved. Refresh or select another available seat.</p>}
        {valid ? <Link className="button button-primary booking-primary" to={`/schedules/${id}/review?seatId=${encodeURIComponent(selected.id)}`}>Review booking<ArrowRight size={18}/></Link> : <p className="booking-notice">Select an available seat to continue.</p>}<p className="booking-footnote">Passenger sign-in is required to reserve. The server checks availability again when you submit.</p></aside></div></>}
  </div>;
}
