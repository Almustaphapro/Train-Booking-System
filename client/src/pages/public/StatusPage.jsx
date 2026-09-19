import { Activity, CircleCheck, CircleAlert, RefreshCw } from 'lucide-react';
import { useHealth } from '../../hooks/useHealth.js';

export default function StatusPage() {
  const { status, data, refresh } = useHealth();
  const loading = status === 'loading';
  const healthy = status === 'success';
  const Icon = loading ? Activity : healthy ? CircleCheck : CircleAlert;

  return (
    <div className="container status-page">
      <span className="eyebrow">PLATFORM AVAILABILITY</span>
      <h1>Service status</h1>
      <p className="page-description">Check the connection to the RailConnect service.</p>
      <section className="status-card" aria-labelledby="connection-title" aria-busy={loading}>
        <div className={`status-symbol ${status}`}><Icon size={30} aria-hidden="true" /></div>
        <div role="status" aria-live="polite">
          <h2 id="connection-title">{loading ? 'Checking connection…' : healthy ? 'Service is online' : 'Unable to reach the service'}</h2>
          <p>{loading ? 'Contacting the service. This may take a few seconds.' : healthy ? 'The platform is responding successfully.' : 'The service may be temporarily unavailable. Please try again.'}</p>
        </div>
        {healthy && <dl className="status-details">
          <div><dt>Service</dt><dd>{data.service}</dd></div>
          <div><dt>Last checked</dt><dd>{new Date(data.timestamp).toLocaleString()}</dd></div>
        </dl>}
        <button className="button button-primary" type="button" onClick={refresh} disabled={loading}>
          <RefreshCw size={17} aria-hidden="true" />{loading ? 'Checking…' : 'Check again'}
        </button>
      </section>
      <p className="status-note">This checks service connectivity only. Booking, ticketing and database services are planned for later phases.</p>
    </div>
  );
}
