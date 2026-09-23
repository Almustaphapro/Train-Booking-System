import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CreditCard, Landmark, Smartphone, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingSummary, BookingState, HoldCountdown } from '../../components/passenger/BookingSummary.jsx';
import JourneyProgress from '../../components/passenger/JourneyProgress.jsx';
import DemoPaymentBanner from '../../components/passenger/DemoPaymentBanner.jsx';
import { apiClient } from '../../api/client.js';
import { fare } from '../../utils/journeys.js';

const methods = [['CARD', 'Card', CreditCard], ['BANK_TRANSFER', 'Bank Transfer', Landmark], ['USSD', 'USSD', Smartphone]];
export default function DemoPaymentPage() {
  const { id } = useParams(); const bookingData = useBookingData(`/bookings/${encodeURIComponent(id)}`, 3000);
  const history = useBookingData(`/bookings/${encodeURIComponent(id)}/payments`, 2000);
  const [method, setMethod] = useState('CARD'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [submitted, setSubmitted] = useState(null);
  const request = useRef(null), submitting = useRef(false);
  const booking = bookingData.data?.booking, latest = history.data?.items[0];
  const payment = submitted && latest?.id !== submitted.id ? submitted : latest;
  const pending = payment?.status === 'PENDING';
  const payable = booking?.bookingStatus === 'PENDING' && booking.paymentStatus !== 'PAID' && payment?.status !== 'PAID' && history.data?.enabled && !pending && !bookingData.error && !history.error;
  async function pay() {
    if (!payable || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    // Retain the key after an uncertain network response. A known failure can
    // start a new attempt, while repeated clicks/retries reuse the same intent.
    if (!request.current || (payment?.status === 'FAILED' && payment.id === request.current.paymentId)) request.current = { idempotencyKey: crypto.randomUUID(), paymentMethod: method };
    try {
      const { data } = await apiClient.post(`/bookings/${id}/payments`, { idempotencyKey: request.current.idempotencyKey, paymentMethod: request.current.paymentMethod });
      request.current.paymentId = data.data.payment.id; setSubmitted(data.data.payment); history.refresh(); bookingData.refresh();
    } catch (failure) {
      setError(failure.response?.data?.message ?? 'The response was interrupted. Check the payment history before retrying; no real money is charged.'); history.refresh(); bookingData.refresh();
    } finally { submitting.current = false; setBusy(false); }
  }
  return <div className="container booking-page payment-page"><Link className="text-link" to={`/passenger/bookings/${id}`}>Back to reservation</Link><span className="eyebrow">DEMO CHECKOUT</span><h1>Complete your demonstration booking.</h1><JourneyProgress step={3}/><DemoPaymentBanner/>
    <BookingState {...bookingData}/><BookingState {...history}/>{error && <p className="booking-notice error" role="alert">{error}</p>}
    {booking && <div className="booking-columns"><BookingSummary schedule={booking.schedule} seat={booking.seat} amount={booking.amount}/><section className="reservation-panel demo-checkout"><h2>Choose a simulated payment method</h2><p>These options demonstrate the checkout flow. No banking information is requested.</p>
      <fieldset className="demo-payment-methods" disabled={busy || pending || !payable}><legend>Demo payment method</legend>{methods.map(([value, label, Icon]) => <label key={value} className={method === value ? 'chosen' : ''}><input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => { setMethod(value); request.current = null; }}/><Icon size={22} aria-hidden="true"/><span>{label}</span></label>)}</fieldset>
      {payment?.status !== 'PAID' && <HoldCountdown booking={booking} serverTime={bookingData.data.serverTime} receivedAt={bookingData.data.receivedAt}/>}
      {payment && <div className={`demo-payment-result ${payment.status.toLowerCase()}`} role="status">{payment.status === 'PAID' ? <CheckCircle2 aria-hidden="true"/> : payment.status === 'FAILED' ? <XCircle aria-hidden="true"/> : <Clock3 aria-hidden="true"/>}<div><h3>{payment.status === 'PAID' ? 'Demo payment successful' : payment.status === 'FAILED' ? 'Demo payment failed' : 'Demo payment pending'}</h3><p>{payment.status === 'PAID' ? 'Your booking is confirmed and a demo ticket has been generated. No real money was charged.' : payment.status === 'FAILED' ? payment.failureReason : 'The server is checking this simulated payment. You may safely leave and return to this page.'}</p></div></div>}
      {history.data && !history.data.enabled && <p className="booking-notice" role="status">The demo payment environment is currently disabled.</p>}
      {payable && <button className="button button-primary booking-primary" onClick={pay} disabled={busy}>{busy ? 'Starting demo payment…' : payment?.status === 'FAILED' ? 'Retry demo payment' : `Pay ${fare(booking.amount, booking.currency)} · Demo only`}</button>}
      {!payable && !pending && payment?.status !== 'PAID' && booking.bookingStatus !== 'CONFIRMED' && <p className="booking-footnote">Only an active pending reservation can be paid. Check your booking status if its hold has ended.</p>}
      {payment?.status === 'PAID' && <Link className="button button-primary" to={`/passenger/bookings/${id}`}>View confirmed booking</Link>}
      {payment?.status === 'PAID' && booking.ticket && <Link className="text-link" to={`/passenger/tickets/${booking.ticket.id}`}>View ticket &amp; QR code</Link>}
      <p className="booking-footnote">The backend determines the result. Failed attempts do not extend your seat hold.</p>
    </section></div>}
    {!!history.data?.items.length && <section className="payment-history"><h2>Demo payment history</h2><div className="payment-history-table" role="region" aria-label="Payment history, scroll horizontally for more columns" tabIndex={0}><table><caption>Simulated transactions for this booking</caption><thead><tr><th>Reference</th><th>Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>{history.data.items.map(row => <tr key={row.id}><td>{row.transactionReference}<small>DEMO · no money charged</small></td><td>{methods.find(([value]) => value === row.paymentMethod)?.[1]}</td><td>{fare(row.amount, row.currency)}</td><td><span className={`booking-status ${row.status.toLowerCase()}`}>{row.status}</span></td></tr>)}</tbody></table></div></section>}
  </div>;
}
