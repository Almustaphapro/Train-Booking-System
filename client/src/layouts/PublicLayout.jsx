import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import Brand from '../components/common/Brand.jsx';
import AuthNavigation from '../components/common/AuthNavigation.jsx';

export default function PublicLayout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef(null), previousPath = useRef(location.pathname);
  useEffect(() => {
    const main = document.getElementById('main-content');
    const updateTitle = () => { document.title = `${main?.querySelector('h1')?.textContent || 'Plan your journey'} | RailConnect`; };
    const observer = new MutationObserver(updateTitle);
    updateTitle();
    if (main) observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setMenuOpen(false);
    if (previousPath.current !== location.pathname && !location.hash) document.getElementById('main-content')?.focus({ preventScroll: true });
    previousPath.current = location.pathname;
    if (!location.hash) { window.scrollTo(0, 0); return; }
    const frame = requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, location.hash]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}>
          <Brand />
          <button ref={menuButton} type="button" className="navigation-toggle" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={20} aria-hidden="true"/> : <Menu size={20} aria-hidden="true"/>}{menuOpen ? 'Close' : 'Menu'}</button>
          <div id="site-navigation" className={`header-navigation${menuOpen ? ' is-open' : ''}`} onClick={event => { if (event.target.closest('a')) setMenuOpen(false); }}>
          <nav className="site-nav" aria-label="Main navigation">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/search">Find a train</NavLink>
            <Link to="/#how-it-works">How it works</Link>
            <Link to="/#faq">FAQs</Link>
          </nav>
          <AuthNavigation />
          </div>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div className="container public-footer"><div><Brand /><p>Every journey starts with a connection.<br />Find yours with RailConnect.</p></div><div><h2>Explore</h2><Link to="/search">Find a train</Link><Link to="/#popular-routes">Demo routes</Link><Link to="/#faq">Frequently asked questions</Link></div><div><h2>Your account</h2><Link to="/login">Sign in</Link><Link to="/register">Create an account</Link><Link to="/status">Service status</Link></div></div>
        <div className="container footer-inner">
          <span>RailConnect <span className="footer-divider">/</span> A better journey starts here.</span><span>Academic demonstration · No real payments or travel tickets</span>
        
        </div>
      </footer>
    </div>
  );
}
