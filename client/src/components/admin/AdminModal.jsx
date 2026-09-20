import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function AdminModal({ title, children, onClose, busy = false }) {
  const dialog = useRef(null);
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  return <dialog className="admin-modal" ref={dialog} aria-labelledby="admin-modal-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="admin-modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={21} /></button></header>{children}
  </dialog>;
}
