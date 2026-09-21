import { useState } from 'react';
import { Link } from 'react-router';
import { Users, Ticket, CalendarDays, ShieldAlert, CircleCheck, Wallet, ClipboardList, TrainFront, ArrowUpRight } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { LoadState, money, when, human, queryString } from '../../components/admin/MonitoringUI.jsx';
import { TrendChart, BarChart } from '../../components/admin/ReportCharts.jsx';
import { travelDate } from '../../utils/journeys.js';

const cards = [
  ['totalPassengers', 'Total Passengers', Users, 'All passenger accounts'], ['totalBookings', 'Total Bookings', ClipboardList, 'All reservation statuses'],
  ['todaysBookings', "Today’s Bookings", CalendarDays, 'Created today · WAT'], ['revenue', 'Revenue', Wallet, 'Paid NGN transactions · demo'],
  ['activeSchedules', 'Active Schedules', TrainFront, 'Scheduled, boarding or travelling'], ['ticketsIssued', 'Tickets Issued', Ticket, 'All issued tickets'],
  ['ticketsVerified', 'Tickets Verified', CircleCheck, 'Distinct tickets checked successfully'], ['openFraudAlerts', 'Open Fraud Alerts', ShieldAlert, 'New and under review'],
];
export default function AdminDashboard() {
  const [range, setRange] = useState({ from: '', to: '' }), [applied, setApplied] = useState({});
  const report = useBookingData(`/admin/monitoring?${queryString(applied)}`, 0), data = report.data;
  return <><div className="admin-heading"><div><span className="eyebrow">OPERATIONS & OVERSIGHT</span><h1>Administrator dashboard</h1><p>Follow journeys, review activity and keep decisions accountable.</p></div><Link className="button button-primary" to="/admin/fraud">Fraud monitoring <ArrowUpRight size={17}/></Link></div>
    <p className="monitor-demo">DEMONSTRATION REPORTING · Revenue represents simulated payments. No real money is collected.</p>
    <LoadState {...report}/>
    {!report.loading && !report.error && data && <><div className="monitor-stats">{cards.map(([key, label, Icon, hint]) => <article className="admin-stat" key={key}><Icon size={22}/><span>{label}</span><strong>{key === 'revenue' ? money(data.counts[key]) : data.counts[key].toLocaleString()}</strong><small>{hint}</small></article>)}</div><p className="admin-footnote">Cards show current or lifetime totals as labelled. Snapshot: {when(data.asOf)}.</p></>}
    <section className="monitor-report-controls"><div><h2>Journey reports</h2><p>Chart period only · all booking statuses · Nigerian time</p></div><form onSubmit={event => { event.preventDefault(); setApplied({ ...range }); }}>
      <label>From<input type="date" aria-label="Report from" required value={range.from} max={range.to || travelDate()} onChange={event => setRange({ ...range, from: event.target.value })}/></label>
      <label>To<input type="date" aria-label="Report to" required value={range.to} min={range.from} max={travelDate()} onChange={event => setRange({ ...range, to: event.target.value })}/></label>
      <button className="button button-outline">Apply dates</button><button type="button" className="button button-outline" onClick={() => { setRange({ from: '', to: '' }); setApplied({}); report.refresh(); }}>Last 30 days</button>
    </form></section>
    {!report.loading && !report.error && data && <><p className="admin-footnote">{data.range.from} to {data.range.to} inclusive. Revenue uses payment date and excludes failed, pending and refunded transactions.</p><div className="monitor-charts">
      <TrendChart key={`bookings-${data.range.from}-${data.range.to}`} title="Bookings over time" rows={data.daily} field="bookings"/>
      <TrendChart key={`revenue-${data.range.from}-${data.range.to}`} title="Revenue over time" rows={data.daily} field="revenue" currency/>
      <BarChart title="Booking statuses" rows={data.bookingStatuses.map(row => ({ key: row.status, label: human(row.status), value: row.count }))} emptyText="No bookings in this period."/>
      <BarChart title="Popular routes" rows={data.popularRoutes.map(row => ({ key: row.id, label: `${row.origin} → ${row.destination}`, value: row.bookings }))} emptyText="No route activity in this period."/>
    </div></>}
    <nav className="monitor-shortcuts" aria-label="Management shortcuts"><Link to="/admin/schedules">Manage schedules <ArrowUpRight size={16}/></Link><Link to="/admin/trains">Manage trains <ArrowUpRight size={16}/></Link><Link to="/admin/audit-logs">View audit logs <ArrowUpRight size={16}/></Link></nav>
  </>;
}
