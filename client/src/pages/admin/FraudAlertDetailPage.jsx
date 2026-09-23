import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { useBookingData } from '../../hooks/useBookingData.js';
import { ActionDialog, Badge, LoadState, human, money, when } from '../../components/admin/MonitoringUI.jsx';

const empty = value => value ?? '—';
function EvidenceTable({ title, columns, rows }) {
  return <section className="admin-panel monitor-detail-section"><header className="monitor-section-heading"><h2>{title}</h2><span>{rows.length} records</span></header>{rows.length ? <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={`${title} table`}><table className="admin-table"><thead><tr>{columns.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index}>{columns.map(column => <td key={column.label}>{column.render ? column.render(row) : empty(row[column.key])}</td>)}</tr>)}</tbody></table></div> : <p className="monitor-empty">No evidence recorded.</p>}</section>;
}

export default function FraudAlertDetailPage() {
  const { id } = useParams();
  const state = useBookingData(`/admin/fraud-alerts/${id}`, 0), data = state.data;
  const [dialog, setDialog] = useState(null), [notice, setNotice] = useState('');
  async function submit(note) {
    if (dialog.kind === 'review') await apiClient.post(`/admin/fraud-alerts/${id}/review`, { status: dialog.status, note, expectedUpdatedAt: data.alert.updatedAt });
    else if (dialog.kind === 'ticket') await apiClient.post(`/admin/fraud-alerts/${id}/investigate-ticket`, { note });
    else await apiClient.post(`/admin/passengers/${data.subject.id}/status`, { status: dialog.status, expectedStatus: data.subject.status, note });
    setNotice('The investigation record was saved.'); state.refresh();
  }
  const alert = data?.alert, subject = data?.subject;
  return <><div className="admin-heading"><div><Link className="monitor-back" to="/admin/fraud"><ArrowLeft size={16}/> Fraud monitoring</Link><span className="eyebrow">INVESTIGATION RECORD</span><h1>Alert details</h1><p>Review the evidence and record an accountable decision.</p></div><button className="button button-outline" onClick={state.refresh}><RefreshCw size={16}/> Refresh</button></div>
    <LoadState {...state}/>{notice && <p className="admin-notice" role="status">{notice}</p>}
    {!state.loading && !state.error && data && <>
      <section className="monitor-detail-hero"><div><span className="eyebrow">{alert.id}</span><h2>{human(alert.type)}</h2><p>{alert.description}</p></div><div className="monitor-detail-status"><Badge value={alert.severity}/><Badge value={alert.status}/><strong>{alert.score}/100</strong><small>{alert.type === 'ANOMALY_SCORE' ? 'Calculated anomaly score' : 'Rule priority; model in features'}</small></div></section>
      <section className="monitor-detail-grid"><article className="admin-panel monitor-info"><h2>{subject?.role === 'TICKET_OFFICER' ? 'Recording officer' : 'Passenger / subject'}</h2><dl><dt>Name</dt><dd>{empty(subject?.fullName)}</dd><dt>Role</dt><dd>{human(subject?.role)}</dd><dt>Account status</dt><dd><Badge value={subject?.status}/></dd><dt>Alert time</dt><dd>{when(alert.createdAt)}</dd></dl><div className="monitor-actions">{subject?.role === 'PASSENGER' && ['ACTIVE', 'SUSPENDED'].includes(subject.status) && <button className="button button-outline" onClick={() => setDialog({ kind: 'passenger', status: subject.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' })}>{subject.status === 'SUSPENDED' ? 'Reactivate passenger' : 'Suspend passenger'}</button>}</div></article>
        <article className="admin-panel monitor-info"><h2>Reason generated</h2><p>{alert.description}</p><h3>Anomaly features</h3><pre className="monitor-evidence">{JSON.stringify(alert.features ?? {}, null, 2)}</pre></article></section>
      <div className="monitor-actions"><button className="button button-outline" disabled={alert.status === 'UNDER_REVIEW'} onClick={() => setDialog({ kind: 'review', status: 'UNDER_REVIEW' })}>Mark under review</button><button className="button button-primary" disabled={alert.status === 'RESOLVED'} onClick={() => setDialog({ kind: 'review', status: 'RESOLVED' })}>Resolve</button><button className="button button-danger" disabled={alert.status === 'DISMISSED'} onClick={() => setDialog({ kind: 'review', status: 'DISMISSED' })}>Dismiss</button>{(data.alert.ticket || data.alert.booking?.ticket) && <button className="button button-outline" onClick={() => setDialog({ kind: 'ticket' })}>Investigate ticket</button>}</div>
      <EvidenceTable title="Recent bookings" rows={data.recentBookings} columns={[{ label: 'Reference', key: 'bookingReference' }, { label: 'Status', render: row => <Badge value={row.bookingStatus}/> }, { label: 'Route', render: row => `${row.schedule?.route?.originStation?.name ?? '?'} → ${row.schedule?.route?.destinationStation?.name ?? '?'}` }, { label: 'Amount', render: row => money(row.amount) }, { label: 'Created', render: row => when(row.createdAt) }]}/>
      <EvidenceTable title="Ticket and scan history" rows={data.scans} columns={[{ label: 'Ticket', render: row => row.ticket?.ticketNumber ?? 'Unknown' }, { label: 'Result', render: row => <Badge value={row.result}/> }, { label: 'Reason', key: 'reason' }, { label: 'Officer', render: row => row.officer?.fullName ?? '—' }, { label: 'Time', render: row => when(row.scannedAt) }]}/>
      <EvidenceTable title="Review history" rows={data.reviewHistory} columns={[{ label: 'Action', render: row => human(row.action) }, { label: 'Administrator', render: row => row.user?.fullName ?? '—' }, { label: 'Decision', render: row => human(row.metadata?.toStatus) }, { label: 'Note', render: row => row.metadata?.note ?? '—' }, { label: 'Time', render: row => when(row.createdAt) }]}/>
    </>}
    {dialog && <ActionDialog title={dialog.kind === 'ticket' ? 'Investigate ticket' : dialog.kind === 'passenger' ? `${human(dialog.status)} passenger` : human(dialog.status)} description="Record the evidence supporting this administrative action. This note is retained in the audit history." confirmLabel={dialog.kind === 'ticket' ? 'Record investigation' : human(dialog.status)} onClose={() => setDialog(null)} onSubmit={submit}/>}</>;
}
