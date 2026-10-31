import React, { useEffect } from 'react';
import { CloseIcon } from '../icons.jsx';
import { COLLISION, DEFAULT_BASE, DEFAULT_FORGET } from '../spec.js';
import { fmt } from '../i18n.js';

// (the numbers in the text come from the mode's own constants, so that the text cannot drift from them)
const VALUES = { hit: COLLISION, base: DEFAULT_BASE, forget: DEFAULT_FORGET };

// A few steps that tell the whole story, shown once and whenever the "?" is pressed.
export default function Help({ t, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal help" role="dialog" aria-modal="true" aria-label={t.help.title}>
        <header className="modal-head">
          <h2>{t.help.title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t.diag.close}><CloseIcon /></button>
        </header>
        <ol className="story">
          {t.help.steps.map(([title, text]) => <li key={title}><b>{title}</b><p>{fmt(text, VALUES)}</p></li>)}
        </ol>
        <button type="button" className="btn primary" onClick={onClose}>{t.help.close}</button>
      </section>
    </div>
  );
}
