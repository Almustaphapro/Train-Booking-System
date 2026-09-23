import { AlertCircle, CheckCircle2, Inbox, LoaderCircle } from 'lucide-react';

const icons = { loading: LoaderCircle, error: AlertCircle, empty: Inbox, success: CheckCircle2 };
export default function FeedbackState({ kind = 'loading', title, children, onRetry }) {
  const Icon = icons[kind] ?? Inbox;
  return <div className={`feedback-state ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <Icon size={24} aria-hidden="true"/>
    <div><p className="feedback-title">{title}</p>{children && <div className="feedback-description">{children}</div>}
      {onRetry && <button type="button" className="button button-outline" onClick={onRetry}>Try again</button>}
    </div>
  </div>;
}
