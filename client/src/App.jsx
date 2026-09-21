import { Route, Routes } from 'react-router';
import PublicLayout from './layouts/PublicLayout.jsx';
import HomePage from './pages/public/HomePage.jsx';
import SearchResultsPage from './pages/public/SearchResultsPage.jsx';
import StatusPage from './pages/public/StatusPage.jsx';
import NotFoundPage from './pages/public/NotFoundPage.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute, GuestRoute } from './components/common/RouteGuards.jsx';
import LoginPage from './pages/public/LoginPage.jsx';
import RegisterPage from './pages/public/RegisterPage.jsx';
import UnauthorizedPage from './pages/public/UnauthorizedPage.jsx';
import PassengerDashboard from './pages/passenger/PassengerDashboard.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import ManagementPage from './pages/admin/ManagementPage.jsx';
import OfficerDashboard from './pages/officer/OfficerDashboard.jsx';
import OfficerVerifyPage from './pages/officer/OfficerVerifyPage.jsx';
import SeatSelectionPage from './pages/passenger/SeatSelectionPage.jsx';
import BookingReviewPage from './pages/passenger/BookingReviewPage.jsx';
import BookingDetailPage from './pages/passenger/BookingDetailPage.jsx';
import MyBookingsPage from './pages/passenger/MyBookingsPage.jsx';
import DemoPaymentPage from './pages/passenger/DemoPaymentPage.jsx';
import MyTicketsPage from './pages/passenger/MyTicketsPage.jsx';
import PassengerTicketPage from './pages/passenger/PassengerTicketPage.jsx';
import FraudMonitoringPage from './pages/admin/FraudMonitoringPage.jsx';
import FraudAlertDetailPage from './pages/admin/FraudAlertDetailPage.jsx';
import AuditLogsPage from './pages/admin/AuditLogsPage.jsx';

export default function App() {
  return (
    <AuthProvider><Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchResultsPage />} />
        <Route path="schedules/:id/seats" element={<SeatSelectionPage />} />
        <Route path="status" element={<StatusPage />} />
        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route path="unauthorized" element={<UnauthorizedPage />} />
        <Route element={<ProtectedRoute role="PASSENGER" />}>
          <Route path="passenger/dashboard" element={<PassengerDashboard />} />
          <Route path="schedules/:id/review" element={<BookingReviewPage />} />
          <Route path="passenger/bookings" element={<MyBookingsPage />} />
          <Route path="passenger/bookings/:id" element={<BookingDetailPage />} />
          <Route path="passenger/bookings/:id/payment" element={<DemoPaymentPage />} />
          <Route path="passenger/tickets" element={<MyTicketsPage />} />
          <Route path="passenger/tickets/:id" element={<PassengerTicketPage />} />
        </Route>
        <Route element={<ProtectedRoute role="ADMIN" />}><Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="fraud" element={<FraudMonitoringPage />} />
          <Route path="fraud/:id" element={<FraudAlertDetailPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
          {['stations', 'routes', 'trains', 'seats', 'schedules'].map(resource => <Route key={resource} path={resource} element={<ManagementPage key={resource} resource={resource} />} />)}
        </Route></Route>
        <Route element={<ProtectedRoute role="TICKET_OFFICER" />}><Route path="officer/dashboard" element={<OfficerDashboard />} /><Route path="officer/verify" element={<OfficerVerifyPage />} /></Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></AuthProvider>
  );
}
