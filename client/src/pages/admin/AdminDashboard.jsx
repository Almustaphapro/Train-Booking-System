import RoleDashboard from '../../components/common/RoleDashboard.jsx';
export default function AdminDashboard() {
  return <RoleDashboard title="Administrator dashboard" endpoint="/admin/dashboard" description="Your access point for platform administration." planned={['Manage stations, routes and trains', 'Organize schedules and fares', 'Review bookings and operational reports']} />;
}
