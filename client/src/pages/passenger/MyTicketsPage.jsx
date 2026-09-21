import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Ticket } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingState } from '../../components/passenger/BookingSummary.jsx';
import { TicketStatus } from '../../components/ticket/TicketDocument.jsx';
import { fare, journeyDate, journeyTime } from '../../utils/journeys.js';

export default function MyTicketsPage() {
  const [params, setParams] = useSearchParams(), page = Number(params.get('page')) || 1;
  const result = useBookingData(`/tickets?page=${page}&pageSize=10`);
  const data = !result.error && !result.loading ? result.data : null;
  return <div className="container booking-page"><span className="eyebrow">YOUR PASSENGER ACCOUNT</span><h1>My Tickets</h1><p className="page-description">Your electronic tickets, QR codes and downloadable journey details.</p><Link className="text-link" to="/passenger/bookings">View My Bookings<ArrowRight size={17}/></Link><BookingState {...result}/>
    {data && <>{!data.items.length ? <div className="public-state"><Ticket size={38} aria-hidden="true"/><h2>{data.total ? 'No tickets on this page' : 'Your next journey starts here'}</h2><p>Tickets appear here only after successful payment. Pending and failed payments do not produce a ticket.</p>{data.total ? <button className="button button-outline" onClick={() => setParams({ page: '1' })}>First page</button> : <Link className="button button-primary" to="/search">Find a train</Link>}</div> : <div className="my-tickets">{data.items.map(t => <article className="ticket-card" key={t.id}><header><span>{t.isDemo ? 'DEMONSTRATION TICKET' : 'ELECTRONIC TICKET'}</span><TicketStatus status={t.status}/></header><h2>{t.origin}<ArrowRight size={18} aria-hidden="true"/>{t.destination}</h2><p>{t.train.name}</p><p>{journeyDate(t.departureTime)} · {journeyTime(t.departureTime)} WAT</p><p>Seat {t.seatNumber} · {t.seatClass === 'BUSINESS' ? 'Business' : 'Economy'} · {fare(t.fare, t.currency)}</p><div className="ticket-card-bottom"><small>{t.ticketNumber}</small><Link className="text-link" to={`/passenger/tickets/${t.id}`}>View ticket<ArrowRight size={17}/></Link></div></article>)}</div>}
      {data.pages > 1 && <nav className="results-pagination" aria-label="Ticket pages"><button className="button button-outline" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>Previous</button><span>Page {page} of {data.pages}</span><button className="button button-outline" disabled={page >= data.pages} onClick={() => setParams({ page: String(page + 1) })}>Next</button></nav>}</>}
  </div>;
}
