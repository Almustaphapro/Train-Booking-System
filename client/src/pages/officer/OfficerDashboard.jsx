import RoleDashboard from '../../components/common/RoleDashboard.jsx';
export default function OfficerDashboard() {
  return <RoleDashboard title="Ticket officer dashboard" endpoint="/officer/dashboard" description="Your dedicated space for passenger boarding support." planned={['Verify digital tickets', 'Confirm passenger boarding', 'Review your verification history']} />;
}
