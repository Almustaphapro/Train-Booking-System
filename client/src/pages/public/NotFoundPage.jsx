import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="container not-found-page">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>Let’s get you back on track.</h1>
      <p className="page-description">The page you’re looking for isn’t available.</p>
      <Link className="button button-primary" to="/"><ArrowLeft size={18} aria-hidden="true" />Back to overview</Link>
    </div>
  );
}
