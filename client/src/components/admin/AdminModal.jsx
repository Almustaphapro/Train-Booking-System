import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
export default function AdminModal({ title, children, onClose, busy = false }) {
  const dialog = useRef(null), previousFocus = useRef(null);
  const titleId = useId();
  useEffect(() => { const element = dialog.current; previousFocus.current = document.activeElement; element.showModal(); element.querySelector('input, textarea, select, button:not([aria-label="Close dialog"])')?.focus(); return () => { element.close(); previousFocus.current?.focus?.(); }; }, []);
  return <dialog className="admin-modal" ref={dialog} aria-labelledby={titleId} aria-busy={busy} onClick={event => { const rect = dialog.current.getBoundingClientRect(); if (event.target === dialog.current && !busy && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onClose(); }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={21} aria-hidden="true"/></button></header><div className="admin-modal-body">{children}</div>
  </dialog>;
}
