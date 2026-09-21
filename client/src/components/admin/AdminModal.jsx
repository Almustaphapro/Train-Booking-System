import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function AdminModal({ title, children, onClose, busy = false }) {
  const dialog = useRef(null), previousFocus = useRef(null);
  useEffect(() => { const element = dialog.current; previousFocus.current = document.activeElement; element.showModal(); element.querySelector('input, textarea, select, button:not([aria-label="Close dialog"])')?.focus(); return () => { element.close(); previousFocus.current?.focus?.(); }; }, []);
  return <dialog className="admin-modal" ref={dialog} aria-labelledby="admin-modal-title" onClick={event => { if (event.target === dialog.current && !busy) onClose(); }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="admin-modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={21} /></button></header><div className="admin-modal-body">{children}</div>
  </dialog>;
}
