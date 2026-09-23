import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { LayoutDashboard, MapPin, Route, TrainFront, Armchair, CalendarDays, ShieldCheck, ShieldAlert, ClipboardList, Wallet, ChevronDown } from 'lucide-react';
const sections = [['dashboard', 'Overview', LayoutDashboard], ['stations', 'Stations', MapPin], ['routes', 'Routes', Route], ['trains', 'Trains', TrainFront], ['seats', 'Seats', Armchair], ['schedules', 'Schedules', CalendarDays], ['bookings', 'Bookings', ClipboardList], ['payments', 'Payments', Wallet], ['fraud', 'Fraud monitoring', ShieldAlert], ['audit-logs', 'Audit logs', ClipboardList]];
export default function AdminLayout() {
  const [open, setOpen] = useState(false), toggle = useRef(null), location = useLocation();
  const current = sections.find(([path]) => location.pathname.startsWith(`/admin/${path}`))?.[1] ?? 'Overview';
  return <div className="admin-shell"><aside className="admin-sidebar"><div className="admin-workspace"><ShieldCheck size={24} /><div><strong>Administration</strong><span>RailConnect workspace</span></div></div>
    <button ref={toggle} className="admin-navigation-toggle" type="button" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(value => !value)}><span>Administration <strong>{current}</strong></span><ChevronDown size={20} aria-hidden="true"/></button>
    <nav id="admin-navigation" className={open ? 'is-open' : ''} aria-label="Admin management" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } }}>{sections.map(([path, title, Icon]) => <NavLink key={path} to={`/admin/${path}`} onClick={() => setOpen(false)}><Icon size={19} aria-hidden="true" />{title}</NavLink>)}</nav>
    <p className="admin-sidebar-note">Build the network.<br />Prepare every journey.</p></aside><section className="admin-content"><Outlet /></section></div>;
}
