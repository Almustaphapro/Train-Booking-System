import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from '../../utils/roles.js';

export default function UnauthorizedPage() {
  const { user } = useAuth();
  return <div className="container not-found-page">
    <ShieldAlert size={40} className="text-primary" aria-hidden="true" />
    <h1>Access restricted</h1>
    <p className="page-description">Your account does not have access to this area.</p>
    <Link className="button button-primary" to={user ? roleHome[user.role] ?? '/' : '/login'}>{user ? 'Return to my dashboard' : 'Sign in'}</Link>
  </div>;
}
