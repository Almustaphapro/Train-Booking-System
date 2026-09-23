import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BadgeCheck, ArrowUpRight } from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { roleLabel } from '../../utils/roles.js';
import FeedbackState from './FeedbackState.jsx';

export default function RoleDashboard({ title, endpoint, description, planned = [], ready = [] }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    setUser(null); setError('');
    apiClient.get(endpoint, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setUser(data.data.user); })
      .catch(failure => {
        if (controller.signal.aborted) return;
        if (failure.response?.status === 403) navigate('/unauthorized', { replace: true });
        else setError('We could not load your account. Please try again.');
      });
    return () => controller.abort();
  }, [endpoint, attempt, navigate]);
  return <div className="container dashboard-page">
    <span className="eyebrow">YOUR ACCOUNT</span><h1>{title}</h1><p className="page-description">{description}</p>
    {!user && !error && <FeedbackState title="Loading your account…"/>}
    {error && <FeedbackState kind="error" title="Your account couldn't be loaded" onRetry={() => setAttempt(value => value + 1)}>{error}</FeedbackState>}
    {user && <div className="dashboard-grid">
      <section className="account-card" aria-labelledby="account-heading">
        <div className="account-card-heading"><BadgeCheck size={28} aria-hidden="true" /><span className="badge">{roleLabel[user.role]}</span></div>
        <h2 id="account-heading">Welcome, {user.fullName}.</h2>
        <p>Your account is active and ready.</p>
        {user.isDemo && <span className="badge demo-account">Demonstration account</span>}
        <dl className="account-details">
          <div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Phone</dt><dd>{user.phone}</dd></div>
          <div><dt>Account created</dt><dd>{new Date(user.createdAt).toLocaleDateString()}</dd></div>
        </dl>
      </section>
      <section className="planned-card" aria-labelledby="planned-heading"><span className="eyebrow">{ready.length ? 'YOUR PASSENGER SERVICES' : 'COMING IN LATER PHASES'}</span><h2 id="planned-heading">{ready.length ? 'Prepare for your journey' : 'What comes next'}</h2><ul>{(ready.length ? ready : planned).map(item => <li key={item}>{item}</li>)}</ul><p>{ready.length ? 'Demonstration tickets are for academic use only.' : 'These services are still in development.'}</p><Link to="/status">Check service status <ArrowUpRight size={16} aria-hidden="true" /></Link></section>
    </div>}
  </div>;
}
