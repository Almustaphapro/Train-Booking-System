import { Navigate, Outlet, useLocation } from 'react-router';
import { roleReturnPath } from '../../utils/returnPath.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from '../../utils/roles.js';

export function SessionStatus({ status, retry }) {
  return <div className="container session-status" role="status">
    <h1>{status === 'loading' ? 'Checking your session…' : 'Unable to check your session'}</h1>
    {status === 'error' && <><p>Please check your connection and try again.</p><button className="button button-primary" onClick={() => retry()}>Try again</button></>}
  </div>;
}

export function ProtectedRoute({ role }) {
  const location = useLocation();
  const { user, status, refresh } = useAuth();
  if (status !== 'ready') return <SessionStatus status={status} retry={refresh} />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  if (user.role !== role) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}

export function GuestRoute() {
  const location = useLocation();
  const { user, status, refresh } = useAuth();
  if (status !== 'ready') return <SessionStatus status={status} retry={refresh} />;
  return user ? <Navigate to={roleReturnPath(user.role, location.state?.from) || roleHome[user.role] || '/unauthorized'} replace /> : <Outlet />;
}
