import { ShieldCheck } from 'lucide-react';
export default function DemoPaymentBanner() {
  return <div className="demo-payment-banner"><ShieldCheck size={25} aria-hidden="true"/><div><strong>DEMO PAYMENT ENVIRONMENT</strong><p>Academic simulation only. No money is charged. Never enter real card, bank, PIN or USSD credentials.</p></div></div>;
}
