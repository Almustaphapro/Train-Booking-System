import { TrainFront, ArrowRight, ShieldCheck, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { fare, journeyDate, journeyTime } from '../../utils/journeys.js';

export function TicketStatus({ status }) {
  const Icon = status === 'VALID' ? CheckCircle2 : status === 'USED' ? CheckCircle2 : status === 'EXPIRED' ? Clock3 : XCircle;
  return <span className={`ticket-status ticket-status-${status.toLowerCase()}`} aria-label={`Ticket status: ${status}`}><Icon size={14} aria-hidden="true"/>{status}</span>;
}

export default function TicketDocument({ ticket: t, checkedAt, onQrLoad, onQrError }) {
  return <article className="ticket-document" aria-label="Electronic railway ticket">
    <header className="ticket-masthead"><div><span className="ticket-brand"><TrainFront aria-hidden="true"/>RailConnect</span><p>ELECTRONIC RAILWAY TICKET</p></div><TicketStatus status={t.status}/></header>
    {t.isDemo && <div className="ticket-demo">DEMONSTRATION TICKET <span>Academic use only · Not valid for real travel</span></div>}
    <div className="ticket-content"><div className="ticket-train"><span className="eyebrow">YOUR JOURNEY</span><h2>{t.train.name}</h2><span>{t.train.code}</span></div>
      <div className="ticket-journey"><div><span>Origin</span><h3>{t.origin}</h3><strong>{journeyTime(t.departureTime)} <small>WAT</small></strong><p>{journeyDate(t.departureTime)}</p></div><ArrowRight aria-hidden="true"/><div><span>Destination</span><h3>{t.destination}</h3><strong>{journeyTime(t.arrivalTime)} <small>WAT</small></strong><p>{journeyDate(t.arrivalTime)}</p></div></div>
      <dl className="ticket-details"><div className="ticket-passenger"><dt>Passenger</dt><dd>{t.passengerName}</dd></div><div><dt>Seat</dt><dd>{t.seatNumber}</dd></div><div><dt>Seat class</dt><dd>{t.seatClass === 'BUSINESS' ? 'Business' : 'Economy'}</dd></div><div><dt>Fare</dt><dd>{fare(t.fare, t.currency)}</dd></div></dl>
      <dl className="ticket-references"><div><dt>Booking reference</dt><dd>{t.bookingReference}</dd></div><div><dt>Ticket number</dt><dd>{t.ticketNumber}</dd></div></dl>
    </div>
    <div className="ticket-stub"><figure><img key={t.id} src={t.qrDataUrl} width="294" height="294" alt="Secure ticket QR code for server verification" onLoad={onQrLoad} onError={onQrError}/><figcaption>Keep your QR code private</figcaption></figure><div><ShieldCheck size={24} aria-hidden="true"/><h3>Secure ticket verification</h3><p className="ticket-validity">{t.message}</p><p>The QR contains only a secure token. Ticket validity is checked on the server.</p><small>Checked {journeyDate(checkedAt)} at {journeyTime(checkedAt)} WAT. Saved and printed copies show status at the time they were created.</small></div></div>
    <footer className="ticket-footnote">All times are West Africa Time (Africa/Lagos).{t.isDemo && ' Demonstration schedules and fares are not official Nigerian Railway Corporation data.'}</footer>
  </article>;
}
