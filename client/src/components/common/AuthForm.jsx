import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, ShieldCheck, TrainFront } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from '../../utils/roles.js';
import FormField from './FormField.jsx';

export default function AuthForm({ mode }) {
  const registering = mode === 'register';
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setError(''); setFields({});
    if (registering && input.password !== input.confirmPassword) {
      setFields({ confirmPassword: 'Passwords do not match.' }); return;
    }
    setBusy(true);
    try {
      const user = await (registering ? signUp(input) : signIn(input));
      navigate(roleHome[user.role] ?? '/unauthorized', { replace: true });
    } catch (failure) {
      setError(failure.response?.data?.message ?? 'We could not reach the service. Please try again.');
      setFields(failure.response?.data?.fields ?? {});
    } finally { setBusy(false); }
  }
  return <div className="container auth-page">
    <aside className="auth-intro">
      <span className="eyebrow">YOUR RAILCONNECT ACCOUNT</span>
      <TrainFront className="auth-train" size={52} strokeWidth={1.3} aria-hidden="true" />
      <h2>A connected journey<br />starts with you.</h2>
      <p>One account for your place on the platform. Your rail travel experience is taking shape.</p>
      <div className="auth-assurance"><ShieldCheck size={22} aria-hidden="true" /><span>Personal access.<br />A space of your own.</span></div>
      <p className="auth-disclaimer">University demonstration project. Booking and ticketing services are coming in later phases.</p>
    </aside>
    <section className="auth-form-panel" aria-labelledby="auth-title">
      <span className="eyebrow">{registering ? 'GET STARTED' : 'WELCOME BACK'}</span>
      <h1 id="auth-title">{registering ? 'Create your account' : 'Sign in to RailConnect'}</h1>
      <p className="form-description">{registering ? 'Register as a passenger. It only takes a moment.' : 'Enter your details to access your dashboard.'}</p>
      <form onSubmit={submit} className="auth-form" aria-busy={busy}>
        {error && <div className="form-notice error" role="alert">{error}{fields._form && <p>{fields._form}</p>}</div>}
        {registering && <FormField label="Full name" name="fullName" autoComplete="name" required minLength={2} maxLength={150} error={fields.fullName} disabled={busy} />}
        <FormField label="Email address" name="email" type="email" autoComplete={registering ? 'email' : 'username'} required maxLength={191} error={fields.email} disabled={busy} />
        {registering && <FormField label="Phone number" name="phone" type="tel" autoComplete="tel" required maxLength={40} hint="Use +234… or your 11-digit Nigerian number." error={fields.phone} disabled={busy} />}
        <FormField label="Password" name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1}
          hint={registering ? 'At least 12 characters, with uppercase, lowercase, a number and a symbol. Maximum 72 UTF-8 bytes.' : undefined} error={fields.password} disabled={busy} />
        {registering && <FormField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} error={fields.confirmPassword} disabled={busy} />}
        <button className="button button-primary form-submit" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create passenger account' : 'Sign in'}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <p className="auth-switch">{registering ? 'Already have an account?' : 'New to RailConnect?'} <Link to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</Link></p>
    </section>
  </div>;
}
