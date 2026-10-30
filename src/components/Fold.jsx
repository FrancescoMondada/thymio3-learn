import React, { useState } from 'react';
import { ChevronIcon } from '../icons.jsx';

// A card that can be folded to its title: closed at first, and what the person chose is kept for next time (it is written when they
// choose, not before). On a narrow screen every section already has its own tab: there the card is never folded (`foldable` false).
export function useFold(key, foldable = true) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(`learn.open.${key}`) === '1'; } catch { return false; } });
  const toggle = () => {
    setOpen(!open);
    try { localStorage.setItem(`learn.open.${key}`, open ? '0' : '1'); } catch { /* private mode */ }
  };
  return [open || !foldable, toggle];
}

// The title of a foldable card: a button with a chevron, a plain heading when it cannot be folded.
export function FoldTitle({ open, onToggle, controls, foldable = true, children }) {
  if (!foldable) return <h2>{children}</h2>;
  return (
    <h2 className="fold-title">
      <button type="button" className="fold-btn" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
        <ChevronIcon size={18} className={open ? 'open' : ''} />{children}
      </button>
    </h2>
  );
}
