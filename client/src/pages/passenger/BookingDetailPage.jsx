import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BookingSummary, BookingState, HoldCountdown } from '../../components/passenger/BookingSummary.jsx';
import { useBookingData } from '../../hooks/useBookingData.js';
import { apiClient } from '../../api/client.js';
import AdminModal from '../../components/admin/AdminModal.jsx';
import DemoPaymentBanner from '../../components/passenger/DemoPaymentBanner.jsx';

export default function BookingDetailPage() {
  const { id } = useParams(), result = useBookingData(`/bookings/${encodeURIComponent(id)}`, 10000);
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const booking = result.data?.booking;
  async function cancel() {
    setBusy(true); setError('');
    try { await apiClient.post(`/bookings/${id}/cancel`, {}); setConfirm(false); setNotice('Your pending reservation has been cancelled and its seat released.'); result.refresh(); }
    catch (failure) { setError(failure.response?.data?.message ?? 'We could not cancel this reservation. Try again.'); setConfirm(false); result.refresh(); }
    finally { setBusy(false); }
  }
  return <div className="container booking-page"><Link className="text-link" to="/passenger/bookings">My Bookings</Link><span className="eyebrow">3 / YOUR RESERVATION</span><h1>{booking?.bookingStatus === 'PENDING' ? 'Your pending booking is created.' : 'Your booking details.'}</h1><BookingState {...result}/>
    {notice && <p className="booking-notice success" role="status">{notice}</p>}{error && <p className="booking-notice error" role="alert">{error}</p>}
    {booking && <><div className="booking-reference"><div><span>Booking reference</span><strong>{booking.bookingReference}</strong></div><span className={`booking-status ${booking.bookingStatus.toLowerCase()}`}>{booking.bookingStatus}</span></div>
      <div className="booking-columns"><BookingSummary schedule={booking.schedule} seat={booking.seat} amount={booking.amount}/><section className="reservation-panel"><h2>{booking.bookingStatus === 'PENDING' ? 'Your seat is temporarily held' : `Reservation ${booking.bookingStatus.toLowerCase()}`}</h2><HoldCountdown booking={booking} serverTime={result.data.serverTime} receivedAt={result.data.receivedAt}/>
        <p>Payment status: <strong>{booking.paymentStatus}</strong></p><DemoPaymentBanner/>
        {booking.ticket && <div className="demo-ticket-summary"><span className="eyebrow">ELECTRONIC TICKET</span><strong>{booking.ticket.ticketNumber}</strong><p>{booking.ticket.isDemo ? 'Academic demonstration only, not valid for real travel. ' : ''}View your ticket for its current status, secure QR code and PDF download.</p><Link className="button button-primary" to={`/passenger/tickets/${booking.ticket.id}`}>View ticket &amp; QR code</Link></div>}
        {booking.bookingStatus === 'PENDING' && <Link className="button button-primary" to={`/passenger/bookings/${id}/payment`}>Continue to demo payment</Link>}
        {booking.bookingStatus === 'CONFIRMED' && <Link className="text-link" to={`/passenger/bookings/${id}/payment`}>View demo payment receipt</Link>}
        {booking.bookingStatus === 'PENDING' && <button className="button button-outline" disabled={busy} onClick={() => setConfirm(true)}>Cancel reservation</button>}
        {['EXPIRED', 'CANCELLED'].includes(booking.bookingStatus) && <Link className="button button-primary" to={`/schedules/${booking.schedule.id}/seats`}>Choose a seat again</Link>}
        <Link className="text-link" to="/search">Find another train</Link></section></div></>}
    {confirm && <AdminModal title="Cancel this reservation?" onClose={() => setConfirm(false)} busy={busy}><p>This releases your seat so another passenger can reserve it.</p><div className="booking-dialog-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirm(false)}>Keep reservation</button><button className="button button-primary" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Yes, cancel reservation'}</button></div></AdminModal>}
  </div>;
}
