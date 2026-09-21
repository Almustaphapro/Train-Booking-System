import RoleDashboard from '../../components/common/RoleDashboard.jsx';
import { Link } from 'react-router';
export default function PassengerDashboard() {
  return <><div className="container passenger-actions"><Link className="button button-primary" to="/search">Find a train</Link><Link className="button button-outline" to="/passenger/bookings">My Bookings</Link><Link className="button button-outline" to="/passenger/tickets">My Tickets</Link></div><RoleDashboard title="Passenger dashboard" endpoint="/passenger/dashboard" description="Your personal space for the journeys ahead." ready={['Review your reservations and demo payments', 'View, print or download your QR ticket', 'Present your ticket to an officer for boarding verification']} /></>;
}
