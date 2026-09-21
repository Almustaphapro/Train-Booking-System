import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingSummary, BookingState } from '../../components/passenger/BookingSummary.jsx';
import { apiClient } from '../../api/client.js';

export default function BookingReviewPage() {
  const { id } = useParams(), [params] = useSearchParams(), navigate = useNavigate(), { user } = useAuth();
  const result = useBookingData(`/schedules/${encodeURIComponent(id)}/seats`);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''); const submitting = useRef(false);
  const seat = result.data?.seats.find(row => row.id === params.get('seatId'));
  const valid = seat?.status === 'AVAILABLE' && result.data?.reservable && !result.error;
  async function reserve() {
    if (!valid || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const { data } = await apiClient.post('/bookings', { scheduleId: id, seatId: seat.id, expectedAmount: seat.fare });
      navigate(`/passenger/bookings/${data.data.booking.id}`, { replace: true });
    } catch (failure) {
      setError(failure.response?.data?.message ?? 'We could not confirm the response. Check My Bookings before trying again.');
      result.refresh();
    } finally { submitting.current = false; setBusy(false); }
  }
  return <div className="container booking-page"><Link className="text-link" to={`/schedules/${id}/seats`}>Change seat</Link><span className="eyebrow">2 / REVIEW YOUR BOOKING</span><h1>Check your journey details.</h1><p className="page-description">Your seat is not held yet. Confirm the details below to create a pending reservation.</p>
    <BookingState {...result}/>{error && <div className="booking-notice error" role="alert">{error} <Link to="/passenger/bookings">View My Bookings</Link></div>}
    {result.data && <div className="booking-columns"><div><BookingSummary schedule={result.data.schedule} seat={seat}/>{!valid && <p className="booking-notice error" role="alert">The selected seat or journey is unavailable. Choose another available seat.</p>}</div>
      <section className="reservation-panel"><ShieldCheck size={30} aria-hidden="true"/><h2>Reserve for {user.fullName}</h2><p>{user.email}</p><ul><li>The seat will be held for up to 10 minutes, or until departure if sooner.</li><li>Unpaid reservations expire automatically and the seat becomes available again.</li><li>Continue to the demo payment environment after reserving. No real money is charged; demonstration tickets are not valid for real travel.</li></ul>
        <button className="button button-primary booking-primary" disabled={!valid || busy} onClick={reserve}>{busy ? 'Reserving your seat…' : 'Create pending booking'}<ArrowRight size={18}/></button><p className="booking-footnote">If another passenger reserves this seat first, you can return to the seat map and choose another.</p>
      </section></div>}
  </div>;
}
