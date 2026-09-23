import { Check } from 'lucide-react';

export default function JourneyProgress({ step }) {
  return <ol className="journey-progress" aria-label="Booking progress">
    {['Seat', 'Review', 'Payment', 'Ticket'].map((label, index) => <li key={label} className={index + 1 < step ? 'complete' : ''} aria-current={index + 1 === step ? 'step' : undefined}>
      <span>{index + 1 < step ? <Check size={16} aria-hidden="true"/> : `${index + 1}.`} {label}</span>
    </li>)}
  </ol>;
}
