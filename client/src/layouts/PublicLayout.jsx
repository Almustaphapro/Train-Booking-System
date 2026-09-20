import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEffect } from 'react';
import Brand from '../components/common/Brand.jsx';
import AuthNavigation from '../components/common/AuthNavigation.jsx';

export default function PublicLayout() {
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) { window.scrollTo(0, 0); return; }
    const frame = requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="site-nav" aria-label="Main navigation">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/search">Find a train</NavLink>
            <Link to="/#how-it-works">How it works</Link>
            <Link to="/#faq">FAQs</Link>
          </nav>
          <AuthNavigation />
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div className="container public-footer"><div><Brand /><p>Every journey starts with a connection.<br />Find yours with RailConnect.</p></div><div><h2>Explore</h2><Link to="/search">Find a train</Link><Link to="/#popular-routes">Demo routes</Link><Link to="/#faq">Frequently asked questions</Link></div><div><h2>Your account</h2><Link to="/login">Sign in</Link><Link to="/register">Create an account</Link><Link to="/status">Service status</Link></div></div>
        <div className="container footer-inner">
          <span>RailConnect <span className="footer-divider">/</span> A better journey starts here.</span>
          <span>University demonstration project</span>
        </div>
      </footer>
    </div>
  );
}
