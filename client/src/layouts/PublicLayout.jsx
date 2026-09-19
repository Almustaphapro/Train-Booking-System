import { NavLink, Outlet } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import Brand from '../components/common/Brand.jsx';

export default function PublicLayout() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <nav className="site-nav" aria-label="Main navigation">
            <NavLink to="/" end>Overview</NavLink>
            <NavLink to="/status">Service status <ArrowUpRight size={15} aria-hidden="true" /></NavLink>
          </nav>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}><Outlet /></main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <span>RailConnect <span className="footer-divider">/</span> A better journey starts here.</span>
          <span>University project · Phase 1 foundation</span>
        </div>
      </footer>
    </div>
  );
}
