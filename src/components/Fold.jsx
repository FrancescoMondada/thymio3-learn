import React, { useEffect, useState } from 'react';
import { ChevronIcon } from '../icons.jsx';

// A card that can be folded to its title, the choice kept for next time. On a narrow screen every section already has its own tab:
// there the card is never folded (`foldable` false).
export function useFold(key, foldable = true) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(`learn.fold.${key}`) !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(`learn.fold.${key}`, open ? '1' : '0'); } catch { /* private mode */ } }, [key, open]);
  return [open || !foldable, () => setOpen((v) => !v)];
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
