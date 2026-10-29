import React from 'react';
import { PRESETS } from '../spec.js';
import { CMD } from '../protocol.js';
import { fmt } from '../i18n.js';
import { BrainIcon, EraserIcon } from '../icons.jsx';

// The brain, on top of the right-hand column: is the robot learning or not (a switch), forget everything, the ready-made brains.
// Every change is told to the robot (or the virtual one) as it is made.
export default function Brain({ t, state, enabled, live, onChange, onPreset }) {
  const frozen = state === 'freeze';
  const paused = state === 'pause';
  const status = !enabled ? t.brain.offline : frozen ? t.brain.statusOff : paused ? t.brain.statusPaused : t.brain.statusOn;
  return (
    <section className="card brain" aria-label={t.brain.title}>
      <header className="card-head">
        <h2>{t.brain.title}</h2>
        <LiveBadge t={t} live={live} enabled={enabled} />
      </header>

      <div className={`learning ${enabled && !frozen ? 'on' : ''}`}>
        <button
          type="button" role="switch" aria-checked={!frozen} className="switch" disabled={!enabled}
          onClick={() => onChange({ command: frozen ? CMD.LEARN : CMD.FREEZE })} aria-label={t.brain.learning}
        ><i aria-hidden="true" /></button>
        <div>
          <b>{t.brain.learning} : {enabled ? (frozen ? t.brain.off : t.brain.on) : '—'}</b>
          <p className="muted small" aria-live="polite">{status}</p>
        </div>
      </div>

      <div className="btn-row">
        <button type="button" className="btn" disabled={!enabled} onClick={() => onChange({ command: CMD.RESET })} title={t.brain.forgetAllHint}>
          <EraserIcon size={17} />{t.brain.forgetAll}
        </button>
      </div>

      <div className="group">
        <h3 title={t.brain.presetsHint}><BrainIcon size={16} />{t.brain.presets}</h3>
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className="chip-btn" disabled={!enabled} onClick={() => onPreset(p)}>{t.brain.preset[p.id]}</button>
          ))}
        </div>
      </div>

    </section>
  );
}

// What happened to the last change: sent, received, or not confirmed.
function LiveBadge({ t, live, enabled }) {
  if (!enabled) return <span className="badge muted">{t.ctl.offline}</span>;
  if (live.giveUp) return <span className="badge bad" role="status">{t.ctl.gaveUp}</span>;
  if (live.sending > 0) return <span className="badge wait" role="status">{t.ctl.sending}</span>;
  if (live.failures > 0) return <span className="badge bad" role="status">{t.ctl.notSent}</span>;
  if (live.lastMs) return <span className="badge ok" role="status">{fmt(t.ctl.sent, { ms: live.lastMs })}</span>;
  return null;
}
