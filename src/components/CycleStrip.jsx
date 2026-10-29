import React from 'react';
import { PauseIcon, SnowIcon } from '../icons.jsx';
import { fmt } from '../i18n.js';

// Where the robot is in its cycle (drive, hit and back up, learn), with a sentence for the state, the lessons it holds
// (the robot's 16 Lego LEDs) and the rule it learns by.
const STEPS = ['drive', 'back', 'learn'];

export default function CycleStrip({ t, state, learnt, hits, lessons, forget }) {
  const active = STEPS.includes(state) ? state : null;
  const text = t.cycle[`${state}Text`];
  return (
    <section className="card cycle" aria-label={t.cycle.title}>
      <header className="card-head">
        <h2>{t.cycle.title}</h2>
        <span className="counts">{t.cycle.hits} {hits} · {t.cycle.lessonsDone} {lessons}</span>
      </header>
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={`step ${s} ${active === s ? 'on' : ''} ${!active ? 'dim' : ''}`} aria-current={active === s ? 'step' : undefined}>
            <span className="dot" aria-hidden="true" />
            {t.cycle[s]}
            {i < STEPS.length - 1 && <span className="arrow" aria-hidden="true">›</span>}
          </li>
        ))}
        {state === 'freeze' && <li className="step freeze on"><SnowIcon size={15} />{t.cycle.freeze}</li>}
        {state === 'pause' && <li className="step pause on"><PauseIcon size={15} />{t.cycle.pause}</li>}
      </ol>
      <p className="state-text" aria-live="polite">{text}</p>
      <div className="lessons" title={t.cycle.lessonsHint}>
        <span className="lessons-label">{t.cycle.lessons}</span>
        <span className="pips" role="img" aria-label={`${learnt} / 16`}>
          {Array.from({ length: 16 }, (_, i) => <i key={i} className={i < learnt ? 'on' : ''} />)}
        </span>
        <span className="lessons-n">{learnt}/16</span>
      </div>
      <p className="forget-line">{t.ctl.forget} : {forget > 0 ? fmt(t.ctl.forgetEvery, { s: forget }) : t.ctl.forgetOff}</p>
      <details className="rule">
        <summary>{t.cycle.rule}</summary>
        <p>{t.cycle.ruleText}</p>
      </details>
    </section>
  );
}
