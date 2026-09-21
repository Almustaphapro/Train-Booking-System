import { Link } from 'react-router';
import { ScanLine, CheckCircle2, ShieldX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingState } from '../../components/passenger/BookingSummary.jsx';
import { journeyTime } from '../../utils/journeys.js';
export default function OfficerDashboard() {
  const { user } = useAuth(), activity = useBookingData('/officer/activity', 10000);
  const data = activity.error ? null : activity.data;
  return <div className="container booking-page officer-page"><span className="eyebrow">BOARDING OPERATIONS</span><h1>Ticket officer dashboard</h1><p className="page-description">Welcome, {user.fullName}. Verify passenger tickets and manage boarding for the selected departure.</p><Link className="button button-primary" to="/officer/verify"><ScanLine size={20}/>Verify a ticket</Link><BookingState {...activity}/>
    {data && <><section className="officer-stats" aria-label="Your activity today"><article><CheckCircle2 aria-hidden="true"/><strong>{data.boarded}</strong><span>Boardings confirmed today</span></article><article><ScanLine aria-hidden="true"/><strong>{data.validChecks}</strong><span>Valid ticket checks today</span></article><article><ShieldX aria-hidden="true"/><strong>{data.rejected}</strong><span>Rejected checks today</span></article></section>
      <section className="officer-history"><h2>Your recent activity</h2><p>Today in West Africa Time. Showing your latest 20 checks and boarding decisions.</p>{!data.recent.length ? <p className="public-state">No activity yet today. Start by verifying a ticket.</p> : <div className="officer-table" tabIndex={0} role="region" aria-label="Your verification history; scroll for more columns"><table><thead><tr><th>Time · WAT</th><th>Ticket</th><th>Train</th><th>Result</th></tr></thead><tbody>{data.recent.map(row => <tr key={row.id}><td>{journeyTime(row.scannedAt)}</td><td>{row.ticket?.ticketNumber ?? 'Unrecognized ticket'}</td><td>{row.schedule?.train.name ?? '—'}</td><td><span className={`officer-log-status ${row.result.toLowerCase()}`}>{row.result.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div>}</section></>}
  </div>;
}
