import { Link } from 'react-router';
import { TrainFront } from 'lucide-react';

export default function Brand() {
  return (
    <Link className="brand" to="/" aria-label="RailConnect home">
      <span className="brand-icon"><TrainFront size={23} aria-hidden="true" /></span>
      <span>Rail<span className="text-primary">Connect</span></span>
    </Link>
  );
}
