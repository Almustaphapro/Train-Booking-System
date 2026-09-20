import { NavLink, Outlet } from 'react-router';
import { LayoutDashboard, MapPin, Route, TrainFront, Armchair, CalendarDays, ShieldCheck } from 'lucide-react';
const sections = [['dashboard', 'Overview', LayoutDashboard], ['stations', 'Stations', MapPin], ['routes', 'Routes', Route], ['trains', 'Trains', TrainFront], ['seats', 'Seats', Armchair], ['schedules', 'Schedules', CalendarDays]];
export default function AdminLayout() {
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="admin-workspace"><ShieldCheck size={24} /><div><strong>Administration</strong><span>RailConnect workspace</span></div></div>
    <nav aria-label="Admin management">{sections.map(([path, title, Icon]) => <NavLink key={path} to={`/admin/${path}`}><Icon size={19} aria-hidden="true" />{title}</NavLink>)}</nav>
    <p className="admin-sidebar-note">Build the network.<br />Prepare every journey.</p></aside><section className="admin-content"><Outlet /></section></div>;
}
