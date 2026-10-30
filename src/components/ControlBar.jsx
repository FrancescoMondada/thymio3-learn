import React, { useEffect, useRef, useState } from 'react';
import Slider from './Slider.jsx';
import { DEFAULT_FORGET, DEFAULT_STEP, PRESETS, RANGES } from '../spec.js';
import { CMD } from '../protocol.js';
import { useHeld, num } from '../util.js';
import { fmt } from '../i18n.js';
import { BrainIcon, CheckIcon, EraserIcon, PauseIcon, PlayIcon, WarnIcon } from '../icons.jsx';

// What the person does to the robot, in a bar: learning on or off, forget everything, a ready-made brain, pause, and the two sliders
// (how fast it learns, how fast it forgets). The speed of the robot is not here: it is the weight of the constant input "1" in the
// picture. On a wide screen the bar is part of the top bar; on a narrow one it is a page of its own (`inPage`, with the hints).
// Every change is told to the robot (or the virtual one) as it is made.
export default function ControlBar({ t, state, params, enabled, live, onChange, onPreset, inPage = false }) {
  const [step, holdStep] = useHeld(params.step);
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
          id="s-forget" label={t.ctl.forget} hint={hint(forget > 0 ? fmt(t.ctl.forgetHint, { s: forget }) : t.ctl.forgetOff)} title={forget > 0 ? fmt(t.ctl.forgetHint, { s: forget }) : t.ctl.forgetOff}
          value={forget} {...RANGES.forget} disabled={!enabled}
          format={(v) => (v > 0 ? fmt(t.ctl.forgetEvery, { s: v }) : t.ctl.forgetOff)} defaultValue={DEFAULT_FORGET} resetLabel={t.ctl.reset} onChange={set('forget', holdForget)}
        />
      </div>

      <LiveBadge t={t} live={live} enabled={enabled} compact={!inPage} />
    </section>
  );
}

// What happened to the last change: sent, received, or not confirmed. In the top bar it is a small mark of a fixed size (the words are
// its tooltip), so that nothing moves when it appears; in the page it is a line of words.
function LiveBadge({ t, live, enabled, compact }) {
  let kind = '';
  let text = '';
  if (!enabled) { kind = 'muted'; text = t.ctl.offline; }
  else if (live.giveUp) { kind = 'bad'; text = t.ctl.gaveUp; }
  else if (live.sending > 0) { kind = 'wait'; text = t.ctl.sending; }
  else if (live.failures > 0) { kind = 'bad'; text = t.ctl.notSent; }
  else if (live.lastMs) { kind = 'ok'; text = fmt(t.ctl.sent, { ms: live.lastMs }); }
  if (!compact) return text ? <span className={`badge ${kind}`} role="status">{text}</span> : null;
  const icon = kind === 'ok' ? <CheckIcon size={15} /> : kind === 'bad' ? <WarnIcon size={15} /> : null;
  return (
    <span className={`live-mark ${kind}`} role="status" title={kind === 'muted' ? undefined : text}>
      {kind !== 'muted' && kind !== '' && <>{icon}<span className="sr-only">{text}</span></>}
    </span>
  );
}
