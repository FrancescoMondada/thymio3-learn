import React from 'react';
import { PauseIcon, SnowIcon } from '../icons.jsx';

// Where the robot is in its cycle (drive, hit and back up, learn) and the lessons it holds (the robot's 16 Lego LEDs), in a bar that
// keeps its layout whatever the state, over the picture. The sentence for each state is a tooltip and is read out by a screen reader.
const STEPS = ['drive', 'back', 'learn'];

export default function CycleStrip({ t, state, learning = true, learnt, hits, lessons }) {
  const active = STEPS.includes(state) ? state : null;
  const frozen = !learning && (state === 'freeze' || state === 'pause');       // (a pause keeps the robot frozen)
  const text = state === 'pause' && frozen ? `${t.cycle.pauseText} ${t.brain.statusOff}` : t.cycle[`${state}Text`];
  return (
    <div className="cycle-bar" aria-label={t.cycle.title}>
      <ol className="steps" title={text}>
        {STEPS.map((s, i) => (
          <li key={s} className={`step ${s} ${active === s ? 'on' : ''} ${!active ? 'dim' : ''}`} aria-current={active === s ? 'step' : undefined}>
            <span className="dot" aria-hidden="true" />
            {t.cycle[s]}
            {i < STEPS.length - 1 && <span className="arrow" aria-hidden="true">›</span>}
          </li>
        ))}
        {frozen && <li className="step freeze on"><SnowIcon size={15} />{t.cycle.freeze}</li>}
        {state === 'pause' && <li className="step pause on"><PauseIcon size={15} />{t.cycle.pause}</li>}
      </ol>
      <span className="sr-only" role="status">{text}</span>
      <div className="lessons" title={`${t.cycle.lessonsHint} ${t.cycle.hits} : ${hits} · ${t.cycle.lessonsDone} : ${lessons}`}>
        <span className="lessons-label">{t.cycle.lessons}</span>
        <span className="pips" role="img" aria-label={`${learnt} / 16`}>
          {Array.from({ length: 16 }, (_, i) => <i key={i} className={i < learnt ? 'on' : ''} />)}
        </span>
        <span className="lessons-n">{learnt}/16</span>
      </div>
    </div>
  );
}
