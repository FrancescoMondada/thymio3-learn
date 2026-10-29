import React from 'react';
import RobotTop from './RobotTop.jsx';

// What takes the arena's place when the real robot is connected (the real world is the arena): the robot's sensors, large, and a few words.
export default function RealPanel({ t, link, battery, prox, motors, hit, now }) {
  return (
    <section className="card real" aria-label={t.real.title}>
      <header className="card-head"><h2>{t.real.title}</h2></header>
      <div className="real-body">
        <RobotTop prox={prox} motors={motors} hit={hit && now - hit.t < 2200 ? hit.sensors : null} size={190} title={t.real.title} />
        <div>
          <dl className="facts">
            <dt>{t.real.device}</dt><dd>{link.device || '—'}</dd>
            {battery ? <><dt>{t.real.battery}</dt><dd>{battery.toFixed(2)} V</dd></> : null}
          </dl>
          <p className="small">{t.real.hint}</p>
        </div>
      </div>
      <p className="muted small">{t.real.live}</p>
      <p className="muted small">{t.real.buttons}</p>
      <p className="muted small">{t.real.notYet}</p>
    </section>
  );
}
