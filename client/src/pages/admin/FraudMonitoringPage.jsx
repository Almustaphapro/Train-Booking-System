import { useState } from 'react';
import { Link } from 'react-router';
import { useBookingData } from '../../hooks/useBookingData.js';
import { Badge, LoadState, Pager, human, when, queryString } from '../../components/admin/MonitoringUI.jsx';

const types = ['DUPLICATE_TICKET_USE', 'REPEATED_INVALID_SCANS', 'EXCESSIVE_BOOKING_ATTEMPTS', 'REPEATED_PAYMENT_FAILURES', 'HIGH_CANCELLATION_RATE', 'EXCESSIVE_RESERVATIONS', 'ANOMALY_SCORE'];
const initial = { severity: '', type: '', status: '', from: '', to: '' };
export default function FraudMonitoringPage() {
  const [filters, setFilters] = useState(initial), [applied, setApplied] = useState(initial), [page, setPage] = useState(1);
  const state = useBookingData(`/admin/fraud-alerts?${queryString({ ...applied, page })}`, 0), data = state.data;
  const change = event => setFilters({ ...filters, [event.target.name]: event.target.value });
  return <><div className="admin-heading"><div><span className="eyebrow">REVIEW & INVESTIGATE</span><h1>Fraud monitoring</h1><p>Understand the evidence behind suspicious activity. Alerts require review and do not establish wrongdoing.</p></div><button className="button button-outline" onClick={state.refresh}>Refresh alerts</button></div>
    <section className="admin-panel"><form className="admin-toolbar monitor-filters" onSubmit={event => { event.preventDefault(); setApplied({ ...filters }); setPage(1); }}>
      {[['severity', 'Severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']], ['type', 'Type', types], ['status', 'Status', ['NEW', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']]].map(([name, title, options]) => <label key={name}>{title}<select name={name} value={filters[name]} onChange={change}><option value="">All {title.toLowerCase()}</option>{options.map(value => <option key={value} value={value}>{human(value)}</option>)}</select></label>)}
      <label>From · WAT<input name="from" type="date" value={filters.from} max={filters.to} onChange={change}/></label><label>To · WAT<input name="to" type="date" value={filters.to} min={filters.from} onChange={change}/></label>
      <button className="button button-primary">Apply filters</button><button type="button" className="button button-outline" onClick={() => { setFilters(initial); setApplied(initial); setPage(1); }}>Clear</button>
    </form><LoadState {...state}/>
    {!state.loading && !state.error && data && <>{!data.items.length ? <div className="admin-state"><h2>No alerts found</h2><p>No records match these filters. Try a broader date range or clear the filters.</p></div> : <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Fraud alerts table"><table className="admin-table monitor-alert-table"><thead><tr>{['Alert ID', 'Passenger / subject', 'Type', 'Severity', 'Anomaly score', 'Description', 'Time · WAT', 'Status'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(alert => <tr key={alert.id}>
      <td><Link to={`/admin/fraud/${alert.id}`}>{alert.id}</Link></td><td>{alert.user?.fullName ?? 'Unidentified subject'}<small className="admin-demo">{alert.user ? human(alert.user.role) : 'Review linked evidence'}</small></td>
      <td>{human(alert.type)}</td><td><Badge value={alert.severity}/></td><td><strong>{alert.score}/100</strong><small className="admin-demo">{alert.type === 'ANOMALY_SCORE' ? 'Calculated anomaly score' : 'Rule priority; model in details'}</small></td><td>{alert.description}</td><td>{when(alert.createdAt)}</td><td><Badge value={alert.status}/></td>
    </tr>)}</tbody></table></div>}<Pager data={data} onPage={setPage}/></>}
    </section><p className="admin-footnote">Unknown QR scans are associated with the officer recording them, not an identified passenger. Review the account role and alert evidence.</p>
  </>;
}
