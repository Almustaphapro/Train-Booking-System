import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, XCircle } from 'lucide-react';
import AdminModal from './AdminModal.jsx';

export const human = value => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
export const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value));
export const when = value => value ? `${new Date(value).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} WAT` : '—';
const badgeIcons = { low: CheckCircle2, active: CheckCircle2, confirmed: CheckCircle2, valid: CheckCircle2, boarded: CheckCircle2, resolved: CheckCircle2, medium: Clock3, under_review: Clock3, high: AlertTriangle, critical: AlertTriangle, dismissed: XCircle, suspended: XCircle, invalid: XCircle };
export function Badge({ value }) { const Icon = badgeIcons[String(value).toLowerCase()]; return <span className={`monitor-badge ${String(value).toLowerCase()}`} aria-label={human(value)}>{Icon && <Icon size={13} aria-hidden="true"/>}{human(value)}</span>; }
export function LoadState({ loading, refreshing, error, refresh }) {
  return error ? <div className="admin-state error" role="alert">{error}<button className="button button-outline" onClick={refresh}>Try again</button></div> : refreshing ? <p className="monitor-refreshing" role="status">Updating live records…</p> : loading ? <div className="admin-state" role="status">Loading live records…</div> : null;
}
export function Pager({ data, onPage }) {
  return <div className="admin-pagination"><span>{data.total} records · Page {data.page} of {Math.max(1, data.pages)}</span><div>
    <button className="icon-button" aria-label="Previous page" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}><ChevronLeft size={20}/></button>
    <button className="icon-button" aria-label="Next page" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}><ChevronRight size={20}/></button>
  </div></div>;
}
export function ActionDialog({ title, description, confirmLabel = 'Confirm', onClose, onSubmit }) {
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await onSubmit(note.trim()); onClose(); }
    catch (failure) { setError(failure.response?.data?.message ?? 'Could not save. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <AdminModal title={title} busy={busy} onClose={onClose}><p>{description}</p><form onSubmit={submit} className="monitor-action-form">
    <label htmlFor="review-note">Reason / investigation notes</label><textarea id="review-note" required minLength={10} maxLength={1000} rows={5} value={note} disabled={busy} onChange={event => setNote(event.target.value)}/>
    <small>10–1000 characters. Record the evidence and decision. Do not include passwords or authentication tokens.</small>
    {error && <p className="form-notice error" role="alert">{error}</p>}
    <footer className="admin-modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || note.trim().length < 10}>{busy ? 'Saving…' : confirmLabel}</button></footer>
  </form></AdminModal>;
}
export function queryString(values) { return new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '' && value != null)).toString(); }
