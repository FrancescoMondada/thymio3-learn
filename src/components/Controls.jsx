import React from 'react';
import Slider from './Slider.jsx';
import { DEFAULT_BASE, DEFAULT_FORGET, DEFAULT_STEP, RANGES } from '../spec.js';
import { CMD } from '../protocol.js';
import { useHeld, num } from '../util.js';
import { fmt } from '../i18n.js';
import { PauseIcon, PlayIcon } from '../icons.jsx';

// The settings: how fast it learns, how fast it drives, how fast it forgets; pause. Every change is told to the robot (or the
// virtual one) as it is made. (Learning on or off, forgetting everything and the brains are in Brain.jsx.)
export default function Controls({ t, params, state, enabled, onChange }) {
  const [step, holdStep] = useHeld(params.step);
  const [base, holdBase] = useHeld(Math.round(params.base));
  const [forget, holdForget] = useHeld(params.forget);
  const paused = state === 'pause';
  const set = (key, hold) => (v) => { hold(v); onChange({ [key]: v }); };

  return (
    <section className="card controls" aria-label={t.ctl.title}>
      <header className="card-head">
        <h2>{t.ctl.title}</h2>
      </header>

      <Slider
        id="s-step" label={t.ctl.learnStep} hint={t.ctl.learnStepHint} value={step} {...RANGES.step} disabled={!enabled}
        format={(v) => num(v)} defaultValue={DEFAULT_STEP} resetLabel={t.ctl.reset} onChange={set('step', holdStep)}
      />
      <Slider
        id="s-base" label={t.ctl.base} hint={t.ctl.baseHint} value={base} {...RANGES.base} disabled={!enabled}
        format={(v) => num(v, 0)} defaultValue={Math.round(DEFAULT_BASE)} resetLabel={t.ctl.reset} onChange={set('base', holdBase)}
      />
      <Slider
        id="s-forget" label={t.ctl.forget} hint={forget > 0 ? fmt(t.ctl.forgetHint, { s: forget }) : t.ctl.forgetOff} value={forget} {...RANGES.forget} disabled={!enabled}
        format={(v) => (v > 0 ? fmt(t.ctl.forgetEvery, { s: v }) : t.ctl.forgetOff)} defaultValue={DEFAULT_FORGET} resetLabel={t.ctl.reset} onChange={set('forget', holdForget)}
      />

      <div className="btn-row">
        <button type="button" className={`btn ${paused ? 'primary' : ''}`} disabled={!enabled} onClick={() => onChange({ command: paused ? CMD.RESUME : CMD.PAUSE })} aria-pressed={paused}>
          {paused ? <PlayIcon size={17} /> : <PauseIcon size={17} />}{paused ? t.ctl.resume : t.ctl.pause}
        </button>
      </div>
    </section>
  );
}
