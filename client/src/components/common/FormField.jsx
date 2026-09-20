import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function FormField({ label, name, type = 'text', error, hint, ...props }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  const Icon = visible ? EyeOff : Eye;
  return <div className="form-field">
    <label htmlFor={name}>{label}</label>
    <div className="input-wrap">
      <input id={name} name={name} type={isPassword && visible ? 'text' : type}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined} {...props} />
      {isPassword && <button type="button" className="password-toggle" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon size={18} aria-hidden="true" /></button>}
    </div>
    {hint && <p className="field-hint" id={`${name}-hint`}>{hint}</p>}
    {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
  </div>;
}
