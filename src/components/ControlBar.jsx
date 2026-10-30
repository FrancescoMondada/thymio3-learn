import React, { useEffect, useRef, useState } from 'react';
import Slider from './Slider.jsx';
import { DEFAULT_BASE, DEFAULT_FORGET, DEFAULT_STEP, PRESETS, RANGES } from '../spec.js';
import { CMD } from '../protocol.js';
import { useHeld, num } from '../util.js';
import { fmt } from '../i18n.js';
import { BrainIcon, EraserIcon, PauseIcon, PlayIcon } from '../icons.jsx';

// What the person does to the robot, in a bar: learning on or off, forget everything, a ready-made brain, pause, and the three sliders
// (how fast it learns, how fast it drives, how fast it forgets). On a wide screen it is part of the top bar; on a narrow one it is a
// page of its own (`inPage`, with the hints). Every change is told to the robot (or the virtual one) as it is made.
export default function ControlBar({ t, state, params, enabled, live, onChange, onPreset, inPage = false }) {
  const [step, holdStep] = useHeld(params.step);
  const [base, holdBase] = useHeld(Math.round(params.base));
  const [forget, holdForget] = useHeld(params.forget);
  const [menu, setMenu] = useState(false);
  const box = useRef(null);
  const frozen = state === 'freeze';
  const paused = state === 'pause';
  const set = (key, hold) => (v) => { hold(v); onChange({ [key]: v }); };
  const status = !enabled ? t.brain.offline : frozen ? t.brain.statusOff : paused ? t.brain.statusPaused : t.brain.statusOn;

  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!box.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const hint = (text) => (inPage ? text : undefined);
  return (
    <section className={`ctlbar ${inPage ? 'in-page' : ''}`} aria-label={t.ctl.title}>
      <div className="ctl-group learning-group" title={status}>
        <button
          type="button" role="switch" aria-checked={!frozen} className="switch" disabled={!enabled} aria-label={t.brain.learning}
          onClick={() => onChange({ command: frozen ? CMD.LEARN : CMD.FREEZE })}
        ><i aria-hidden="true" /></button>
        <div>
          <b>{t.brain.learning} : {enabled ? (frozen ? t.brain.off : t.brain.on) : '—'}</b>
          {inPage && <p className="muted small" aria-live="polite">{status}</p>}
        </div>
      </div>

      <div className="ctl-group">
        <button type="button" className="btn small" disabled={!enabled} onClick={() => onChange({ command: CMD.RESET })} title={t.brain.forgetAllHint}>
          <EraserIcon size={16} />{t.brain.forgetAll}
        </button>
        <div className="menu-wrap" ref={box}>
          <button type="button" className={`btn small ${menu ? 'on' : ''}`} disabled={!enabled} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} title={t.brain.presetsHint}>
            <BrainIcon size={16} />{t.brain.menu}<span aria-hidden="true" className="caret">▾</span>
          </button>
          {menu && (
            <ul className="menu" role="menu" aria-label={t.brain.presets}>
              {PRESETS.map((p) => (
                <li key={p.id} role="none"><button type="button" role="menuitem" className="menu-item" onClick={() => { onPreset(p); setMenu(false); }}>{t.brain.preset[p.id]}</button></li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className={`btn small ${paused ? 'primary' : ''}`} disabled={!enabled} onClick={() => onChange({ command: paused ? CMD.RESUME : CMD.PAUSE })} aria-pressed={paused}>
          {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}{paused ? t.ctl.resume : t.ctl.pause}
        </button>
      </div>

      <div className="ctl-group sliders">
        <Slider
          id="s-step" label={t.ctl.learnStep} hint={hint(t.ctl.learnStepHint)} title={t.ctl.learnStepHint} value={step} {...RANGES.step} disabled={!enabled}
          format={(v) => num(v)} defaultValue={DEFAULT_STEP} resetLabel={t.ctl.reset} onChange={set('step', holdStep)}
        />
        <Slider
          id="s-base" label={t.ctl.base} hint={hint(t.ctl.baseHint)} title={t.ctl.baseHint} value={base} {...RANGES.base} disabled={!enabled}
          format={(v) => num(v, 0)} defaultValue={Math.round(DEFAULT_BASE)} resetLabel={t.ctl.reset} onChange={set('base', holdBase)}
        />
        <Slider
          id="s-forget" label={t.ctl.forget} hint={hint(forget > 0 ? fmt(t.ctl.forgetHint, { s: forget }) : t.ctl.forgetOff)} title={forget > 0 ? fmt(t.ctl.forgetHint, { s: forget }) : t.ctl.forgetOff}
          value={forget} {...RANGES.forget} disabled={!enabled}
          format={(v) => (v > 0 ? fmt(t.ctl.forgetEvery, { s: v }) : t.ctl.forgetOff)} defaultValue={DEFAULT_FORGET} resetLabel={t.ctl.reset} onChange={set('forget', holdForget)}
        />
      </div>

      <LiveBadge t={t} live={live} enabled={enabled} />
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
