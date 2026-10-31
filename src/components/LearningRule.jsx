import React from 'react';
import { COLLISION } from '../spec.js';
import { fmt } from '../i18n.js';
import { num } from '../util.js';

// What the robot does with a hit, exactly as the mode does it (learn() and forget() in src/py/ann_mode.py): the three moments, the
// table of what one lesson changes sensor by sensor, and what never changes. The step and the forgetting delay are the ones of the
// sliders right now. Folded under the picture.
export default function LearningRule({ t, step, forget }) {
  const c = t.cycle;
  const every = forget > 0 ? fmt(t.ctl.forgetEvery, { s: forget }) : t.ctl.forgetOff;
  const values = { hit: COLLISION, step: num(step), every };
  return (
    <details className="rule">
      <summary>{c.rule}</summary>
      <div className="rule-body">
        <ol className="rule-steps">
          {c.ruleSteps.map(([title, text]) => <li key={title}><b>{title}</b> {fmt(text, values)}</li>)}
        </ol>
        <div className="rule-table-wrap">
          <table className="rule-table">
            <thead>
              <tr><th scope="col">{c.ruleTable.sensor}</th><th scope="col">{c.ruleTable.left}</th><th scope="col">{c.ruleTable.right}</th><th scope="col">{c.ruleTable.then}</th></tr>
            </thead>
            <tbody>
              {c.ruleTable.rows.map(([sensor, left, right, then]) => (
                <tr key={sensor}>
                  <th scope="row">{sensor}</th>
                  <td className={`w ${left.startsWith('+') ? 'pos' : left.startsWith('−') ? 'neg' : ''}`}>{left}</td>
                  <td className={`w ${right.startsWith('+') ? 'pos' : right.startsWith('−') ? 'neg' : ''}`}>{right}</td>
                  <td>{then}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rule-note">{c.ruleNote}</p>
      </div>
    </details>
  );
}
