import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from '../../utils/roles.js';

export default function AuthNavigation() {
  const { user, status, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function handleLogout() {
    setBusy(true); setError('');
    try { await signOut(); navigate('/login', { replace: true }); }
    catch { setError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="auth-nav">
    {user ? <>
      <Link to={roleHome[user.role] ?? '/unauthorized'}>My dashboard</Link>
      <button className="button button-outline" onClick={handleLogout} disabled={busy}><LogOut size={16} aria-hidden="true" />{busy ? 'Signing out…' : 'Sign out'}</button>
    </> : status !== 'loading' && <><Link to="/login">Sign in</Link><Link className="button button-primary" to="/register">Create account</Link></>}
    {error && <span className="nav-error" role="alert">{error}</span>}
  </div>;
}
