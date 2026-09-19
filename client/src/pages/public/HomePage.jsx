import { Link } from 'react-router';
import { ArrowRight, Route, Ticket, TrainFront, Users } from 'lucide-react';

const plannedFeatures = [
  { icon: Route, title: 'Find your journey', description: 'Explore routes and compare travel options in one place.' },
  { icon: Ticket, title: 'Travel with confidence', description: 'A clear booking experience with verifiable digital tickets.' },
  { icon: Users, title: 'Keep everyone connected', description: 'Dedicated tools for passengers, administrators and ticket officers.' },
];

export default function HomePage() {
  return (
    <div className="container home-page">
      <section className="hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <span className="eyebrow"><span className="small-line" /> BUILT FOR THE JOURNEY AHEAD</span>
          <h1 id="home-title">A simpler way<br />to move <span className="text-primary">forward.</span></h1>
          <p className="hero-description">The foundation for a connected rail experience. Bringing train travel, ticketing and journey management together.</p>
          <Link className="button button-primary" to="/status">Check service status <ArrowRight size={18} aria-hidden="true" /></Link>
          <p className="hero-note">In development. Passenger services are not available yet.</p>
        </div>
        <div className="journey-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="art-label">RAILCONNECT <span>01 / FOUNDATION</span></div>
          <div className="rail-line rail-line-one" /><div className="rail-line rail-line-two" />
          <div className="art-station station-start"><span /> A connected beginning</div>
          <div className="train-tile"><TrainFront size={62} strokeWidth={1.3} /></div>
          <div className="art-station station-end"><span /> A journey ahead</div>
          <div className="art-caption">Thoughtfully connected.<br /><strong>One step at a time.</strong></div>
          <span className="art-number">RC / 001</span>
        </div>
      </section>
      <section className="future-section" aria-labelledby="future-title">
        <div className="section-heading">
          <div><span className="eyebrow">THE PLATFORM VISION</span><h2 id="future-title">One platform. Every part of the journey.</h2></div>
          <span className="badge">Planned for future phases</span>
        </div>
        <div className="feature-grid">
          {plannedFeatures.map(({ icon: Icon, title, description }, index) => (
            <article className="feature-card" key={title}>
              <div className="feature-top"><Icon size={24} aria-hidden="true" /><span>0{index + 1}</span></div>
              <h3>{title}</h3><p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
