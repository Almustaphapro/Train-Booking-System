import { useEffect, useState } from 'react';
import { ArrowRight, Clock3 } from 'lucide-react';
import { fare, journeyDate, journeyTime } from '../../utils/journeys.js';

export function BookingSummary({ schedule, seat, amount }) {
  return <section className="booking-summary"><span className="eyebrow">YOUR JOURNEY</span><h2>{schedule.train.name}</h2><p className="booking-route">{schedule.origin.name}<ArrowRight size={18} aria-hidden="true"/>{schedule.destination.name}</p>
    <dl><div><dt>Departure</dt><dd>{journeyDate(schedule.departureTime)} · {journeyTime(schedule.departureTime)} WAT</dd></div><div><dt>Arrival</dt><dd>{journeyDate(schedule.arrivalTime)} · {journeyTime(schedule.arrivalTime)} WAT</dd></div>
      {seat && <><div><dt>Seat</dt><dd>{seat.seatNumber} · {seat.seatClass === 'ECONOMY' ? 'Economy' : 'Business'}</dd></div><div className="booking-total"><dt>Total fare</dt><dd>{fare(amount ?? seat.fare, schedule.currency)}</dd></div></>}
    </dl>{schedule.isDemo && <p className="booking-demo">Demonstration schedule and fare. Not official Nigerian Railway Corporation data.</p>}
  </section>;
}
export function HoldCountdown({ booking, serverTime, receivedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (booking.bookingStatus !== 'PENDING' || !booking.expiresAt) return null;
  const offset = new Date(serverTime).getTime() - receivedAt;
  const seconds = Math.max(0, Math.ceil((new Date(booking.expiresAt).getTime() - (now + offset)) / 1000));
  return <p className="hold-countdown"><Clock3 size={18} aria-hidden="true"/>{seconds ? <>Seat hold ends in <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></> : 'Hold time ended. Checking reservation status…'}</p>;
}
export function BookingState({ loading, error, refresh }) {
  return <>{loading && <p className="booking-notice" role="status">Loading your journey…</p>}{error && <div className="booking-notice error" role="alert"><p>{error}</p><button className="button button-outline" onClick={refresh}>Try again</button></div>}</>;
}
