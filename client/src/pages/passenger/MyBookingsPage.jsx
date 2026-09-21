import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Ticket } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingState, HoldCountdown } from '../../components/passenger/BookingSummary.jsx';
import { fare, journeyDate, journeyTime } from '../../utils/journeys.js';

export default function MyBookingsPage() {
  const [params, setParams] = useSearchParams(); const page = Number(params.get('page')) || 1;
  const result = useBookingData(`/bookings?page=${page}&pageSize=10`, 10000);
  return <div className="container booking-page"><span className="eyebrow">YOUR PASSENGER ACCOUNT</span><h1>My Bookings</h1><p className="page-description">Your reservation history, seat details and current booking status.</p><Link className="button button-primary" to="/search">Find a train<ArrowRight size={18}/></Link><BookingState {...result}/>
    {result.data && <>{!result.data.items.length ? <div className="public-state"><Ticket size={36} aria-hidden="true"/><h2>{result.data.total ? 'No bookings on this page' : 'No bookings yet'}</h2><p>Search for a train and choose an available seat to create your first pending booking.</p>{result.data.total > 0 && <button className="button button-outline" onClick={() => setParams({ page: '1' })}>First page</button>}</div> : <div className="my-bookings">{result.data.items.map(booking => <article className="my-booking" key={booking.id}><header><strong>{booking.bookingReference}</strong><span className={`booking-status ${booking.bookingStatus.toLowerCase()}`}>{booking.bookingStatus}</span></header><h2>{booking.schedule.origin.name}<ArrowRight size={18} aria-hidden="true"/>{booking.schedule.destination.name}</h2><p>{booking.schedule.train.name} · {journeyDate(booking.schedule.departureTime)} · {journeyTime(booking.schedule.departureTime)} WAT</p><p>Seat {booking.seat.seatNumber} · {booking.seat.seatClass === 'ECONOMY' ? 'Economy' : 'Business'} · {fare(booking.amount, booking.currency)}</p><HoldCountdown booking={booking} serverTime={result.data.serverTime} receivedAt={result.data.receivedAt}/><Link className="text-link" to={`/passenger/bookings/${booking.id}`}>View reservation<ArrowRight size={17}/></Link></article>)}</div>}
      {result.data.pages > 1 && <nav className="results-pagination" aria-label="Booking pages"><button className="button button-outline" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button><span>Page {page} of {result.data.pages}</span><button className="button button-outline" disabled={page >= result.data.pages} onClick={() => setParams({ page: String(page + 1) })}>Next</button></nav>}</>}
  </div>;
}
