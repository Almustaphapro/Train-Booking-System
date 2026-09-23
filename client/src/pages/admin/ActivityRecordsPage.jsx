import { useState } from 'react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { Badge, LoadState, Pager, human, when, queryString } from '../../components/admin/MonitoringUI.jsx';

const initial = { q: '', status: '', from: '', to: '' };
const amount = row => new Intl.NumberFormat('en-NG', { style: 'currency', currency: row.currency }).format(Number(row.amount));
export default function ActivityRecordsPage({ resource }) {
  const bookings = resource === 'bookings', title = bookings ? 'Bookings' : 'Payments';
  const [filters, setFilters] = useState(initial), [applied, setApplied] = useState(initial), [page, setPage] = useState(1);
  const state = useBookingData(`/admin/${resource}?${queryString({ ...applied, page })}`, 0), data = state.data;
  const change = event => setFilters({ ...filters, [event.target.name]: event.target.value });
  return <><div className="admin-heading"><div><span className="eyebrow">JOURNEY ACTIVITY</span><h1>{title}</h1><p>{bookings ? 'Inspect reservations, passenger names, seat assignments and ticket status.' : 'Review simulated transactions and their server-controlled outcomes.'}</p></div><button className="button button-outline" onClick={state.refresh}>Refresh {resource}</button></div>
    {!bookings && <p className="monitor-demo">DEMO PAYMENT ENVIRONMENT · These transactions do not represent real money.</p>}
    <section className="admin-panel"><form className="admin-toolbar monitor-filters" onSubmit={event => { event.preventDefault(); setApplied({ ...filters }); setPage(1); }}>
      <label>Search<input name="q" type="search" value={filters.q} maxLength={100} placeholder="Reference or passenger" onChange={change}/></label>
      <label>Status<select name="status" value={filters.status} onChange={change}><option value="">All statuses</option>{(bookings ? ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED'] : ['PENDING', 'PAID', 'FAILED', 'REFUNDED']).map(status => <option key={status} value={status}>{human(status)}</option>)}</select></label>
      <label>Created from · WAT<input name="from" type="date" value={filters.from} max={filters.to} onChange={change}/></label><label>Created to · WAT<input name="to" type="date" value={filters.to} min={filters.from} onChange={change}/></label>
      <button className="button button-primary">Apply filters</button><button type="button" className="button button-outline" onClick={() => { setFilters(initial); setApplied(initial); setPage(1); }}>Clear</button></form>
      <LoadState {...state}/>{!state.loading && !state.error && data && <>{!data.items.length ? <div className="admin-state"><h2>No {resource} found</h2><p>There are no records matching these filters.</p></div> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={`${title} table`}><table className="admin-table"><thead><tr>{(bookings ? ['Reference', 'Passenger', 'Train / route', 'Departure', 'Seat', 'Amount', 'Booking', 'Payment', 'Ticket', 'Created'] : ['Transaction', 'Booking', 'Passenger', 'Method', 'Amount', 'Status', 'Created', 'Paid']).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}>{bookings ? <>
        <td>{row.bookingReference}</td><td>{row.user.fullName}</td><td>{row.schedule.train.name}<small className="admin-demo">{row.schedule.route.originStation.name} → {row.schedule.route.destinationStation.name}</small></td><td>{when(row.schedule.departureTime)}</td><td>{row.scheduleSeat.seat.seatNumber} · {human(row.scheduleSeat.seat.seatClass)}</td><td>{amount(row)}</td><td><Badge value={row.bookingStatus}/></td><td><Badge value={row.paymentStatus}/></td><td>{row.ticket ? <>{row.ticket.ticketNumber}<small className="admin-demo">{human(row.ticket.status)}</small></> : 'Not issued'}</td><td>{when(row.createdAt)}</td>
      </> : <><td>{row.transactionReference}{row.isDemo && <small className="admin-demo">Demonstration</small>}</td><td>{row.booking.bookingReference}</td><td>{row.booking.user.fullName}</td><td>{human(row.paymentMethod)}</td><td>{amount(row)}</td><td><Badge value={row.status}/></td><td>{when(row.createdAt)}</td><td>{when(row.paidAt)}</td></>}</tr>)}</tbody></table></div>}<Pager data={data} onPage={setPage}/></>}
    </section></>;
}
