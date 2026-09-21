import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Camera, CheckCircle2, ScanLine, ShieldX, ArrowRight, RotateCcw } from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingState } from '../../components/passenger/BookingSummary.jsx';
import CameraScanner from '../../components/ticket/CameraScanner.jsx';
import { journeyDate, journeyTime, travelDate } from '../../utils/journeys.js';

const labels = { VALID: 'VALID TICKET', BOARDED: 'BOARDING CONFIRMED', ALREADY_USED: 'TICKET ALREADY USED', EXPIRED: 'TICKET EXPIRED', CANCELLED: 'TICKET CANCELLED', WRONG_SCHEDULE: 'WRONG SCHEDULE', SCHEDULE_CLOSED: 'BOARDING CLOSED', VERIFICATION_EXPIRED: 'VERIFY TICKET AGAIN', INVALID: 'INVALID TICKET' };
const timestamp = value => `${journeyDate(value)} · ${new Date(value).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour12: false })} WAT`;

export default function OfficerVerifyPage() {
  const [date, setDate] = useState(travelDate()), [scheduleId, setScheduleId] = useState(''), [entry, setEntry] = useState('');
  const schedules = useBookingData(`/officer/schedules?date=${encodeURIComponent(date)}`, 15000);
  const [camera, setCamera] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState(''), [now, setNow] = useState(Date.now());
  const inFlight = useRef(false), controller = useRef(null), resultPanel = useRef(null);
  const stopCamera = useCallback(() => setCamera(false), []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(timer); controller.current?.abort(); }; }, []);
  useEffect(() => { if (result) resultPanel.current?.focus(); }, [result]);
  const schedule = schedules.data?.items.find(s => s.id === scheduleId);
  const canScan = !!schedule?.boardable && !schedules.error && !schedules.loading;
  const remaining = result?.confirmBefore ? Math.max(0, Math.ceil((new Date(result.confirmBefore).getTime() - new Date(result.checkedAt).getTime() - Math.max(0, now - result.receivedAt)) / 1000)) : 0;
  const displayStatus = result?.valid && (!remaining || !canScan) ? 'VERIFICATION_EXPIRED' : result?.status;
  function reset() { setResult(null); setError(''); setEntry(''); setCamera(false); }
  async function verify(value) {
    if (inFlight.current || !canScan) return;
    setCamera(false); setError(''); setResult(null);
    const input = value.trim();
    if (!input || input.length > 2048) { setError('Enter a ticket number or QR token of at most 2048 characters.'); return; }
    inFlight.current = true; setBusy(true); controller.current = new AbortController();
    try {
      const response = await apiClient.post('/officer/verify', { entry: input, scheduleId }, { signal: controller.current.signal });
      setResult({ ...response.data.data, receivedAt: Date.now() }); setEntry('');
    } catch (failure) { if (!controller.current.signal.aborted) setError(failure.response?.data?.message ?? 'Verification could not complete. Check your connection and try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function board() {
    if (inFlight.current || !result?.valid || !remaining || !canScan) return;
    inFlight.current = true; setBusy(true); setError(''); controller.current = new AbortController();
    try {
      const response = await apiClient.post('/officer/board', { verificationId: result.verificationId }, { signal: controller.current.signal });
      setResult({ ...response.data.data, receivedAt: Date.now() });
    } catch (failure) {
      if (controller.current.signal.aborted) return;
      if (failure.response?.status === 409 && failure.response.data.data) setResult({ ...failure.response.data.data, receivedAt: Date.now() });
      else { setResult(null); setError(failure.response?.data?.message ?? 'The boarding result could not be received. Verify the ticket again to check whether boarding completed.'); }
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="container booking-page officer-page"><Link className="text-link" to="/officer/dashboard">Officer dashboard</Link><span className="eyebrow">BOARDING CONTROL</span><h1>Verify. Check. Welcome aboard.</h1><p className="page-description">Select the departure, scan or enter a ticket, then confirm boarding after checking the passenger.</p>
    <section className="officer-schedule"><h2>1. Select the boarding schedule</h2><div><label>Departure date · WAT<input type="date" value={date} disabled={busy} onChange={e => { setDate(e.target.value); setScheduleId(''); reset(); }}/></label><label>Train and departure<select value={scheduleId} disabled={busy || schedules.loading || !!schedules.error} onChange={e => { setScheduleId(e.target.value); reset(); }}><option value="">Choose a schedule</option>{schedules.data?.items.map(s => <option key={s.id} value={s.id} disabled={!s.boardable}>{journeyTime(s.departureTime)} · {s.train} · {s.origin} → {s.destination}{!s.boardable ? ` · ${s.status} / closed` : ''}</option>)}</select></label></div><BookingState {...schedules}/>
      {!schedules.loading && !schedules.error && schedules.data?.items.length === 0 && <p className="booking-notice" role="status">No schedules on this date. Choose another date.</p>}
      {schedule && <p className="officer-selected"><strong>{schedule.train}</strong> · {journeyDate(schedule.departureTime)} · {journeyTime(schedule.departureTime)} WAT{schedule.isDemo && <span className="badge">Demonstration schedule</span>}</p>}
    </section>
    <div className="officer-workspace"><section className="officer-input-panel"><span className="eyebrow">2. VERIFY THE TICKET</span><h2>Scan or enter a ticket</h2><p>Use the passenger’s QR code, or enter the ticket number printed on the ticket.</p>
      {!camera && <button className="button button-primary officer-camera-start" disabled={!canScan || busy} onClick={() => { reset(); setCamera(true); }}><Camera size={19}/>Start QR camera</button>}
      <CameraScanner active={camera && canScan && !busy} onDecode={verify} onStop={stopCamera}/>
      <div className="officer-divider">or use manual entry</div><form className="officer-manual" onSubmit={e => { e.preventDefault(); verify(entry); }}><label htmlFor="ticket-entry">QR token or ticket number</label><input id="ticket-entry" name="ticketEntry" value={entry} maxLength={64} autoComplete="off" spellCheck={false} placeholder="TKT-2026-…" disabled={!canScan || busy} onChange={e => { setEntry(e.target.value); setResult(null); setError(''); }}/><button className="button button-outline" disabled={!canScan || busy || !entry.trim()}><ScanLine size={18}/>{busy ? 'Checking…' : 'Verify ticket'}</button></form>
      {!canScan && <p className="booking-footnote">Choose an open departure before verifying a ticket. Departed and cancelled schedules cannot be boarded.</p>}
      {error && <p className="booking-notice error" role="alert">{error}</p>}
    </section>
    <section ref={resultPanel} tabIndex={-1} aria-label="Verification result" className={`officer-result ${displayStatus ? displayStatus.toLowerCase() : 'waiting'}`} aria-live="polite" aria-busy={busy}>
      {!result ? <div className="officer-awaiting"><ScanLine size={44} aria-hidden="true"/><h2>{busy ? 'Checking ticket…' : 'Ready when you are'}</h2><p>The verification result and passenger details will appear here.</p></div> : <><header>{['VALID', 'BOARDED'].includes(displayStatus) ? <CheckCircle2 size={36} aria-hidden="true"/> : <ShieldX size={36} aria-hidden="true"/>}<div><span>3. BOARDING DECISION</span><h2>{labels[displayStatus] ?? 'TICKET NOT VALID'}</h2></div></header><div className="officer-result-body"><p>{result.message}</p>
        {result.usedAt && <p className="officer-used-time"><strong>Original boarding time</strong><time dateTime={result.usedAt}>{timestamp(result.usedAt)}</time></p>}
        {result.ticket && <><p className="officer-ticket-number">{result.ticket.ticketNumber}</p>{result.ticket.isDemo && <p className="officer-demo">DEMONSTRATION TICKET · Not valid for real travel</p>}<dl className="officer-passenger"><div><dt>Passenger</dt><dd>{result.ticket.passengerName}</dd></div><div><dt>Train</dt><dd>{result.ticket.train}</dd></div><div><dt>Route</dt><dd>{result.ticket.origin}<ArrowRight size={16} aria-hidden="true"/>{result.ticket.destination}</dd></div><div><dt>Departure · WAT</dt><dd>{journeyDate(result.ticket.departureTime)} · {journeyTime(result.ticket.departureTime)}</dd></div><div><dt>Seat</dt><dd>{result.ticket.seatNumber} · {result.ticket.seatClass === 'BUSINESS' ? 'Business' : 'Economy'}</dd></div></dl></>}
        {result.valid && <><p className="booking-footnote">{remaining ? `Confirm within ${remaining}s. Current validity will be checked again.` : 'This check has expired. Verify the ticket again.'}</p><button className="button button-primary officer-confirm" disabled={busy || !remaining || !canScan} onClick={board}>{busy ? 'Confirming…' : 'Confirm Boarding'}<CheckCircle2 size={18}/></button></>}
        <button className="button button-outline officer-reset" disabled={busy} onClick={reset}><RotateCcw size={17}/>Check another ticket</button></div></>}
    </section></div>
  </div>;
}
