import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Plus, Search, Pencil, Trash2, Power, X, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { listAdmin, saveAdmin, deleteAdmin, adminOptions } from '../../api/admin.js';
import { management, statuses, label, routeLabel, formValues, payload } from '../../components/admin/managementConfig.js';
import AdminModal from '../../components/admin/AdminModal.jsx';

function RecordEditor({ resource, row, trainId, onClose, onSaved }) {
  const config = management[resource];
  const [values, setValues] = useState(() => formValues(resource, row, trainId));
  const [options, setOptions] = useState({}), [loading, setLoading] = useState(true), [lookupError, setLookupError] = useState('');
  const [error, setError] = useState(''), [fields, setFields] = useState({}), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLookupError('');
    Promise.all(config.options.map(async source => [source, await adminOptions(source, controller.signal)]))
      .then(entries => { if (!controller.signal.aborted) { setOptions(Object.fromEntries(entries)); setLoading(false); } })
      .catch(() => { if (!controller.signal.aborted) { setLookupError('Could not load selection lists.'); setLoading(false); } });
    return () => controller.abort();
  }, [config, attempt]);
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setFields({});
    try { await saveAdmin(resource, row?.id, payload(resource, values, row)); onSaved(`${label(config.singular)} ${row ? 'updated' : 'created'} successfully.`); }
    catch (failure) { setError(failure.response?.data?.message ?? 'Could not save. Check your connection and try again.'); setFields(failure.response?.data?.fields ?? {}); }
    finally { setBusy(false); }
  }
  const missing = config.options.filter(source => !loading && !lookupError && !options[source]?.length);
  const allFields = [...config.fields, { name: 'status', title: 'Status', type: 'select', values: statuses[resource] }];
  return <AdminModal title={`${row ? 'Edit' : 'Create'} ${config.singular}`} onClose={onClose} busy={busy}>
    {loading ? <p className="admin-state" role="status">Loading form…</p> : lookupError ? <div className="admin-state" role="alert">{lookupError}<button className="button button-outline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <form onSubmit={submit} aria-busy={busy}>
      {missing.length > 0 && <p className="form-notice error">Create {missing.join(' and ')} before adding this {config.singular}.</p>}
      {error && <div className="form-notice error" role="alert">{error}{fields._form && <p>{fields._form}</p>}</div>}
      {resource === 'schedules' && <p className="admin-form-hint">Times use your device timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). One journey seat is created for every configured seat; out-of-service seats are blocked.</p>}
      {resource === 'seats' && <p className="admin-form-hint">Seat numbers are unique within a train. Seats already used by schedules retain their number and class.</p>}
      <div className="admin-form-grid">{allFields.map(({ name, title, type, source, values: choices, ...attributes }) => <div className="form-field" key={name}>
        <label htmlFor={`admin-${name}`}>{title}</label>
        {type === 'select' ? <select id={`admin-${name}`} name={name} value={values[name]} required disabled={busy || (resource === 'seats' && !!row && name === 'trainId')} aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `admin-${name}-error` : undefined} onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))}>
          {!choices && <option value="">Select {title.toLowerCase()}</option>}
          {choices ? choices.map(value => <option key={value} value={value}>{label(value)}</option>) : (options[source] ?? []).map(item => <option key={item.id} value={item.id} disabled={(name === 'destinationStationId' && item.id === values.originStationId) || (name === 'originStationId' && item.id === values.destinationStationId)}>{source === 'routes' ? routeLabel(item) : `${item.name} (${item.code})`}{item.status !== 'ACTIVE' ? ` · ${label(item.status)}` : ''}</option>)}
        </select> : <input id={`admin-${name}`} name={name} type={type} {...attributes} required value={values[name]} disabled={busy} aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `admin-${name}-error` : undefined} onChange={event => setValues(current => ({ ...current, [name]: event.target.value }))} />}
        {fields[name] && <p className="field-error" id={`admin-${name}-error`}>{fields[name]}</p>}
      </div>)}</div>
      <footer className="admin-modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || missing.length > 0}>{busy ? 'Saving…' : row ? 'Save changes' : `Create ${config.singular}`}</button></footer>
    </form>}
  </AdminModal>;
}

export default function ManagementPage({ resource }) {
  const config = management[resource], navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(''), [q, setQ] = useState(''), [status, setStatus] = useState('');
  const [trainId, setTrainId] = useState(searchParams.get('trainId') ?? ''), [seatClass, setSeatClass] = useState('');
  const [trains, setTrains] = useState([]), [filterError, setFilterError] = useState('');
  const [page, setPage] = useState(1), [result, setResult] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState(null), [confirmation, setConfirmation] = useState(null), [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState(null);
  useEffect(() => { const timer = setTimeout(() => { setQ(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!['seats', 'schedules'].includes(resource)) return;
    const controller = new AbortController(); setFilterError('');
    adminOptions('trains', controller.signal).then(rows => { if (!controller.signal.aborted) setTrains(rows); }).catch(() => { if (!controller.signal.aborted) setFilterError('Train filter unavailable. Refresh to retry.'); });
    return () => controller.abort();
  }, [resource, attempt]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    listAdmin(resource, { q: q || undefined, status: status || undefined, trainId: ['seats', 'schedules'].includes(resource) ? trainId || undefined : undefined, seatClass: resource === 'seats' ? seatClass || undefined : undefined, page }, controller.signal)
      .then(data => { if (!controller.signal.aborted) { if (page > 1 && !data.items.length) setPage(Math.max(1, data.pages)); else setResult(data); setLoading(false); } })
      .catch(failure => { if (!controller.signal.aborted) { if (failure.response?.status === 403) navigate('/unauthorized', { replace: true }); setError(failure.response?.data?.message ?? 'Could not load records. Check your connection.'); setLoading(false); } });
    return () => controller.abort();
  }, [resource, q, status, trainId, seatClass, page, attempt, navigate]);
  function saved(message) { setEditor(null); setConfirmation(null); setNotice({ message, type: 'success' }); setAttempt(value => value + 1); }
  function confirm(row, operation) { setActionError(''); setConfirmation({ row, operation }); }
  async function act() {
    if (busy) return; setBusy(true); setActionError('');
    const { row, operation } = confirmation;
    try {
      if (operation === 'delete') await deleteAdmin(resource, row.id);
      else {
        const data = Object.fromEntries([...config.fields.map(field => field.name), 'status'].map(name => [name, row[name]]));
        data.status = row.status === 'ACTIVE' ? (resource === 'seats' ? 'OUT_OF_SERVICE' : 'INACTIVE') : 'ACTIVE';
        await saveAdmin(resource, row.id, data);
      }
      saved(operation === 'delete' ? `${label(config.singular)} deleted.` : 'Status updated.');
    } catch (failure) { setActionError(failure.response?.data?.message ?? 'The operation failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <><div className="admin-heading"><div><span className="eyebrow">NETWORK MANAGEMENT</span><h1>{config.title}</h1><p>{config.description}</p></div><button className="button button-primary" onClick={() => setEditor({ row: null })}><Plus size={18} />Create {config.singular}</button></div>
    {notice && <div className={`admin-notice ${notice.type}`} role="status">{notice.message}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={17} /></button></div>}
    <div className="admin-panel"><div className="admin-toolbar"><label className="admin-search"><span className="sr-only">Search {config.title.toLowerCase()}</span><Search size={18} aria-hidden="true" /><input type="search" value={search} maxLength={100} placeholder={`Search ${config.title.toLowerCase()}…`} onChange={event => setSearch(event.target.value)} /></label>
      <label><span className="sr-only">Filter by status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{statuses[resource].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
      {['seats', 'schedules'].includes(resource) && <label><span className="sr-only">Filter by train</span><select value={trainId} onChange={event => { setTrainId(event.target.value); setPage(1); }}><option value="">All trains</option>{trains.map(train => <option key={train.id} value={train.id}>{train.name}</option>)}</select></label>}
      {resource === 'seats' && <label><span className="sr-only">Filter by class</span><select value={seatClass} onChange={event => { setSeatClass(event.target.value); setPage(1); }}><option value="">All classes</option><option>ECONOMY</option><option>BUSINESS</option></select></label>}
      <button className="button button-outline" onClick={() => setAttempt(value => value + 1)} disabled={loading}>Refresh</button>
    </div>{filterError && <p role="status" className="admin-form-hint">{filterError}</p>}
    {loading ? <div className="admin-state" role="status">Loading {config.title.toLowerCase()}…</div> : error ? <div className="admin-state error" role="alert"><p>{error}</p><button className="button button-outline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : !result?.items.length ? <div className="admin-state"><Inbox size={35} aria-hidden="true" /><h2>No {config.title.toLowerCase()} found</h2><p>{q || status || trainId || seatClass ? 'Try a different search or clear the filters.' : `Create your first ${config.singular} to get started.`}</p><button className="button button-outline" onClick={() => { setSearch(''); setStatus(''); setTrainId(''); setSeatClass(''); setPage(1); }}>Clear filters</button></div> : <>
      <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={`${config.title} table`}><table className="admin-table"><thead><tr>{config.columns.map(([title]) => <th key={title} scope="col">{title}</th>)}<th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>{result.items.map(row => <tr key={row.id}>
        {config.columns.map(([title, render], index) => <td key={title}>{index === 0 ? <><strong>{render(row)}</strong>{row.isDemo && <small className="admin-demo">Demo data</small>}</> : render(row)}</td>)}
        <td><span className={`admin-status ${['ACTIVE', 'SCHEDULED', 'BOARDING'].includes(row.status) ? 'positive' : ''}`}>{label(row.status)}</span></td>
        <td><div className="admin-row-actions"><button className="icon-button" title={`Edit ${config.singular}`} aria-label={`Edit ${row.name ?? row.seatNumber ?? config.singular}`} onClick={() => setEditor({ row })}><Pencil size={17} /></button>
          {resource !== 'schedules' && <button className="icon-button" title={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} aria-label={`${row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${config.singular}`} onClick={() => confirm(row, 'status')}><Power size={17} /></button>}
          <button className="icon-button danger" title={`Delete ${config.singular}`} aria-label={`Delete ${config.singular}`} onClick={() => confirm(row, 'delete')}><Trash2 size={17} /></button>
          {resource === 'trains' && <Link className="admin-seat-link" to={`/admin/seats?trainId=${row.id}`}>Seats</Link>}</div></td>
      </tr>)}</tbody></table></div>
      <div className="admin-pagination"><span>{result.total} records · Page {page} of {Math.max(1, result.pages)}</span><div><button className="icon-button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={19} /></button><button className="icon-button" aria-label="Next page" disabled={page >= result.pages} onClick={() => setPage(value => value + 1)}><ChevronRight size={19} /></button></div></div>
    </> }</div>
    <p className="admin-footnote">Deletion is available only when records are no longer referenced. Deactivate records to keep their history.</p>
    {editor && <RecordEditor resource={resource} row={editor.row} trainId={trainId} onClose={() => setEditor(null)} onSaved={saved} />}
    {confirmation && <AdminModal title={confirmation.operation === 'delete' ? `Delete this ${config.singular}?` : `Change ${config.singular} status?`} onClose={() => setConfirmation(null)} busy={busy}><p>{confirmation.operation === 'delete' ? 'This permanently removes the record. Linked records must be removed first; booking history is protected.' : 'This changes availability for future operations. Upcoming journeys may need to be cancelled first.'}</p>{actionError && <p className="form-notice error" role="alert">{actionError}</p>}<footer className="admin-modal-actions"><button className="button button-outline" disabled={busy} onClick={() => setConfirmation(null)}>Keep record</button><button className={`button ${confirmation.operation === 'delete' ? 'button-danger' : 'button-primary'}`} disabled={busy} onClick={act}>{busy ? 'Saving…' : 'Confirm'}</button></footer></AdminModal>}
  </>;
}
