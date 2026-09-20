import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, MapPin, Route, TrainFront, Armchair, CalendarDays } from 'lucide-react';
import { apiClient } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
const cards = [['stations', 'Stations', MapPin], ['routes', 'Routes', Route], ['trains', 'Trains', TrainFront], ['seats', 'Seats', Armchair], ['schedules', 'Schedules', CalendarDays]];
export default function AdminDashboard() {
  const { user } = useAuth();
  const [counts, setCounts] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError(''); setCounts(null);
    apiClient.get('/admin/overview', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) setCounts(data.data.counts); }).catch(failure => { if (!controller.signal.aborted) setError(failure.response?.data?.message ?? 'Could not load the overview.'); });
    return () => controller.abort();
  }, [attempt]);
  return <><div className="admin-heading"><div><span className="eyebrow">NETWORK MANAGEMENT</span><h1>Administrator dashboard</h1><p>Welcome, {user.fullName}. Prepare the network for the journeys ahead.</p></div><Link className="button button-primary" to="/admin/schedules">Manage schedules <ArrowUpRight size={17} /></Link></div>
    {error ? <div role="alert" className="admin-state error">{error}<button className="button button-outline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : !counts ? <div className="admin-state" role="status">Loading network overview…</div> : <div className="admin-stat-grid">{cards.map(([key, title, Icon]) => <Link className="admin-stat" key={key} to={`/admin/${key}`}><Icon size={23} /><span>{title}</span><strong>{counts[key]}</strong><small>Manage {title.toLowerCase()} <ArrowUpRight size={14} /></small></Link>)}</div>}
    <div className="admin-guide"><span className="eyebrow">GETTING STARTED</span><h2>From stations to scheduled journeys</h2><div>{[['01', 'Connect stations', 'Add stations, then define a route for each direction.', 'stations'], ['02', 'Prepare your fleet', 'Set train capacity and configure seat numbers and classes.', 'trains'], ['03', 'Plan a departure', 'Assign a train, set times and fares. Journey seats are created automatically.', 'schedules']].map(([number, title, description, path]) => <Link key={number} to={`/admin/${path}`}><span>{number}</span><h3>{title}</h3><p>{description}</p></Link>)}</div></div>
    <p className="admin-footnote">University demonstration project. Seeded schedules and fares are not official Nigerian Railway Corporation data.</p></>;
}
