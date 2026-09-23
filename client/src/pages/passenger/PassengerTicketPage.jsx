import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Download, Printer, ArrowLeft } from 'lucide-react';
import { useBookingData } from '../../hooks/useBookingData.js';
import { BookingState } from '../../components/passenger/BookingSummary.jsx';
import TicketDocument from '../../components/ticket/TicketDocument.jsx';
import JourneyProgress from '../../components/passenger/JourneyProgress.jsx';
import { apiClient } from '../../api/client.js';

export default function PassengerTicketPage() {
  const { id } = useParams(), result = useBookingData(`/tickets/${encodeURIComponent(id)}`, 15000);
  const [qrReady, setQrReady] = useState(null), [qrError, setQrError] = useState(false), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const ticket = !result.error && !result.loading ? result.data?.ticket : null;
  async function download() {
    if (busy || !ticket) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.get(`/tickets/${encodeURIComponent(id)}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `RailConnect-${ticket.ticketNumber}.pdf`; document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Your PDF download has started. Keep your ticket private.');
    } catch (failure) {
      let message = 'We could not download your ticket. Please try again.';
      try { const body = failure.response?.data; message = (body instanceof Blob ? JSON.parse(await body.text()) : body)?.message ?? message; } catch { /* Keep the safe fallback. */ }
      setError(message);
    } finally { setBusy(false); }
  }
  return <div className="container booking-page ticket-page"><div className="ticket-controls"><Link className="text-link" to="/passenger/tickets"><ArrowLeft size={17}/>My Tickets</Link><span className="eyebrow">READY FOR YOUR JOURNEY</span><h1>Your electronic ticket.</h1><p className="page-description">Keep a copy on your device, or print it for your records.</p><JourneyProgress step={4}/></div>
    <BookingState {...result}/>
    {ticket && <><div className="ticket-toolbar ticket-controls"><Link className="text-link" to={`/passenger/bookings/${ticket.bookingId}`}>View booking</Link><div><button className="button button-outline" disabled={qrReady !== ticket.id || qrError} onClick={() => window.print()}><Printer size={18}/>Print ticket</button><button className="button button-primary" disabled={busy} onClick={download}><Download size={18}/>{busy ? 'Preparing PDF…' : 'Download PDF'}</button></div></div>
      {notice && <p className="booking-notice success ticket-controls" role="status">{notice}</p>}{error && <p className="booking-notice error ticket-controls" role="alert">{error}</p>}
      {qrError && <p className="booking-notice error ticket-controls" role="alert">The QR image could not load. <button className="text-link" onClick={() => { setQrError(false); setQrReady(null); result.refresh(); }}>Try again</button></p>}
      <TicketDocument ticket={ticket} checkedAt={result.data.serverTime} onQrLoad={() => { setQrReady(ticket.id); setQrError(false); }} onQrError={() => { setQrReady(null); setQrError(true); }}/></>}
  </div>;
}
