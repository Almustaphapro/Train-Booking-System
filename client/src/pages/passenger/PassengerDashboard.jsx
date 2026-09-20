import RoleDashboard from '../../components/common/RoleDashboard.jsx';
export default function PassengerDashboard() {
  return <RoleDashboard title="Passenger dashboard" endpoint="/passenger/dashboard" description="Your personal space for the journeys ahead." planned={['Search and compare train journeys', 'Manage your bookings', 'View your digital tickets']} />;
}
