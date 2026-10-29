import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Network from './components/Network.jsx';
import CycleStrip from './components/CycleStrip.jsx';
import Controls from './components/Controls.jsx';
import Brain from './components/Brain.jsx';
import Timeline from './components/Timeline.jsx';
import Arena from './components/Arena.jsx';
import RealPanel from './components/RealPanel.jsx';
import Settings from './components/Settings.jsx';
import Help from './components/Help.jsx';
import { BluetoothIcon, GearIcon, HelpIcon, MoonIcon, SunIcon, WarnIcon } from './icons.jsx';
import { I18N, detectLang } from './i18n.js';
import { Telemetry } from './store.js';
import { SimBackend } from './sim/sim-backend.js';
import { RobotBackend } from './robot/robot-backend.js';
import { supportsBluetooth } from './api.js';
import { CMD } from './protocol.js';
import { useSize } from './util.js';

const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

const weightChange = (left, right) => ({ left: Object.fromEntries(left.map((v, i) => [i, v])), right: Object.fromEntries(right.map((v, i) => [i, v])) });

export default function App() {
  const [lang, setLang] = useState(detectLang);
  const t = I18N[lang] || I18N.fr;
  const [theme, setTheme] = useState(() => load('learn.theme', 'auto'));
  const [tab, setTab] = useState('net');
  const [source, setSource] = useState('virtual');                  // 'virtual' | 'robot'
  const [simSpeed, setSimSpeed] = useState(1);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(() => load('learn.help', '') !== '1');
  const [log, setLog] = useState([]);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState('');
  const bluetooth = supportsBluetooth();

  const tele = useRef(null);
  if (!tele.current) tele.current = new Telemetry();
  const snap = useSyncExternalStore(tele.current.subscribe, tele.current.getSnapshot);

  const sim = useRef(null);
  const robot = useRef(null);
  const sourceRef = useRef('virtual');
  const started = useRef(false);                                    // the mode was started on the current connection
  const connecting = useRef(false);
  if (!sim.current) sim.current = new SimBackend((ev) => tele.current.push(ev));

  // (a handle for the console and the tests: window.__learn.sim.advance(ms) moves the virtual robot without waiting)
  useEffect(() => {
    if (import.meta.env?.DEV) window.__learn = { tele: tele.current, sim: sim.current, get robot() { return robot.current; } };
  }, []);

  // ---- theme and language -------------------------------------------------------------------------
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    save('learn.theme', theme);
  }, [theme]);
  useEffect(() => { document.documentElement.lang = lang; save('learn.lang', lang); document.title = t.app.title; }, [lang, t.app.title]);

  // ---- the virtual robot's clock ---------------------------------------------------------------------
  const initFromSettings = () => {
    const p = tele.current.s.params;
    return { step: p.step, base: p.base, forget: p.forget };
  };
  useEffect(() => { sim.current.speed = simSpeed; }, [simSpeed]);
  useEffect(() => {
    sim.current.start();
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (sourceRef.current === 'virtual') sim.current.advance(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); sim.current.stop(); };
  }, []);

  // ---- the real robot ------------------------------------------------------------------------------------
  const onLog = useCallback((kind, text) => setLog((l) => [...l.slice(-500), { at: Date.now(), kind, text }]), []);

  const backToVirtual = useCallback((reason = '') => {
    sourceRef.current = 'virtual';
    setSource('virtual');
    started.current = false;
    connecting.current = false;
    tele.current.clear();
    tele.current.setLink({ status: 'idle', device: '', firmware: null });
    sim.current.start(initFromSettings());
    setNotice(reason);
  }, []);

  const onRobotEvent = useCallback((ev) => {
    if (sourceRef.current !== 'robot') return;
    tele.current.push(ev);
    if (ev.type === 'conn') {
      if (ev.status === 'connected' && !started.current) {
        started.current = true;
        robot.current.start(initFromSettings()).catch((err) => {
          started.current = false;
          tele.current.push({ type: 'error', message: err?.message || String(err) });
        });
      }
      if (ev.status === 'disconnected' || ev.status === 'reconnect') {
        started.current = false;
        if (connecting.current && ev.error) backToVirtual(ev.error);
      }
    }
  }, [backToVirtual]);

  const connect = useCallback(async () => {
    if (!bluetooth) { setSettings(true); return; }
    setNotice('');
    if (!robot.current) {
      robot.current = new RobotBackend((ev) => onRobotEvent(ev), { onLog });
      robot.current.attach();
    }
    sim.current.stop();
    sourceRef.current = 'robot';
    setSource('robot');
    started.current = false;
    connecting.current = true;
    tele.current.clear();
    tele.current.setLink({ status: 'connecting' });
    try { await robot.current.connect(); } finally { connecting.current = false; }
  }, [bluetooth, onLog, onRobotEvent]);

  const disconnect = useCallback(async () => {
    try { await robot.current?.disconnect(); } catch { /* ignore */ }
    backToVirtual('');
  }, [backToVirtual]);

  const restartMode = useCallback(() => {
    if (sourceRef.current === 'robot') {
      started.current = true;
      robot.current.start(initFromSettings()).catch((err) => tele.current.push({ type: 'error', message: err?.message || String(err) }));
    } else {
      tele.current.clear();
      sim.current.start(initFromSettings());
    }
  }, []);

  // ---- what the person asks for ----------------------------------------------------------------------
  const send = useCallback(async (change) => {
    if (sourceRef.current === 'robot') {
      const b = robot.current;
      if (!b) return;
      tele.current.sending(1);
      try { await b.apply(change); } finally { tele.current.sending(-1); }
    } else {
      sim.current.apply(change);
    }
  }, []);

  const setWeight = useCallback((sensor, wheel, w) => send({ [wheel === 0 ? 'left' : 'right']: { [sensor]: w } }), [send]);
  const applyPreset = useCallback((p) => send(weightChange(p.left, p.right)), [send]);

  const selfTest = useCallback(async () => {
    if (!robot.current) return;
    setTesting(true);
    try { await robot.current.selfTest(); } finally { setTesting(false); }
  }, []);

  // ---- keys ---------------------------------------------------------------------------------------------------
  const live = source === 'robot';
  const online = snap.running && (!live || snap.link.status === 'connected');
  const keyState = useRef({});
  keyState.current = { snap, online, send };
  useEffect(() => {
    const on = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || e.target?.isContentEditable) return;
      const { snap: s, online: ok, send: go } = keyState.current;
      if (e.key === 'd' || e.key === 'D') { setSettings((v) => !v); return; }
      if (!ok) return;
      if (e.key === ' ') { e.preventDefault(); go({ command: s.state === 'pause' ? CMD.RESUME : CMD.PAUSE }); }
      else if (e.key === 'g' || e.key === 'G') go({ command: s.state === 'freeze' ? CMD.LEARN : CMD.FREEZE });
      else if (e.key === '0') go({ command: CMD.RESET });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // the network is turned a quarter turn when its box is narrow
  const [netRef, { width: netWidth }] = useSize({ width: 800, height: 500 });
  const vertical = netWidth < 600;

  const link = snap.link;
  const lost = live && (link.status === 'disconnected' || link.status === 'reconnect') && !connecting.current;
  const starting = live && link.status === 'connected' && !snap.running && !snap.error && started.current && snap.t === 0;
  const modeEnded = live && link.status === 'connected' && !snap.running && snap.t > 0;
  const enabled = online;
  const stateLabel = snap.running ? t.cycle[snap.state] : live ? (link.status === 'connecting' ? t.head.connecting : t.ctl.offline) : t.ctl.offline;
  const brainNow = snap.weights;
  const dark = theme === 'dark' || (theme === 'auto' && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <div className={`app tab-${tab}`}>
      <header className="top">
        <div className="brand">
          <button type="button" className="icon-btn" onClick={() => setSettings(true)} aria-label={t.head.diag} title={`${t.head.diag} (D)`}><GearIcon /></button>
          <img src="icon.svg" alt="" width="30" height="30" />
          <div>
            <h1>{t.app.title}</h1>
            <p>{t.app.subtitle}</p>
          </div>
        </div>
        <div className="top-mid">
          <div className="seg source" role="group" aria-label={t.head.source}>
            <button type="button" className={!live ? 'on' : ''} aria-pressed={!live} onClick={() => live && disconnect()}>{t.head.virtual}</button>
            <button type="button" className={live ? 'on' : ''} aria-pressed={live} onClick={() => !live && connect()}>{t.head.real}</button>
          </div>
          <span className={`state-chip ${snap.running ? snap.state : 'off'}`} role="status"><i aria-hidden="true" />{stateLabel}</span>
        </div>
        <div className="top-end">
          {live && link.status === 'connected' && <button type="button" className="btn small" onClick={disconnect}>{t.head.disconnect}</button>}
          {!live && bluetooth && <button type="button" className="btn small hide-narrow" onClick={connect}><BluetoothIcon size={16} />{t.head.connect}</button>}
          <button type="button" className="icon-btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={t.head.theme} title={t.head.theme}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button type="button" className="icon-btn" onClick={() => setHelp(true)} aria-label={t.head.help} title={t.head.help}><HelpIcon /></button>
        </div>
      </header>

      {(lost || modeEnded || notice || snap.error || starting || snap.live.giveUp) && (
        <div className="banner" role="alert">
          <WarnIcon size={18} />
          <span>
            {lost ? t.head.lost : modeEnded ? t.head.ended : starting ? t.head.starting : snap.live.giveUp ? t.ctl.gaveUp : notice || snap.error}
          </span>
          {lost && <button type="button" className="btn small" onClick={connect}>{t.head.retry}</button>}
          {(modeEnded || snap.live.giveUp) && <button type="button" className="btn small" onClick={restartMode}>{t.head.restart}</button>}
          {!lost && !modeEnded && !starting && (notice || snap.error) && <button type="button" className="btn small" onClick={() => { setNotice(''); tele.current.push({ type: 'error', message: '' }); }}>OK</button>}
        </div>
      )}

      <main>
        <div className="col main">
          <section className="card net-card" data-tab="net" aria-label={t.net.title}>
            <header className="card-head">
              <div>
                <h2>{t.net.title}</h2>
                <p className="muted small">{t.net.subtitle}</p>
              </div>
            </header>
            <div ref={netRef} className="net-wrap">
              <Network
                t={t} weights={brainNow} prox={snap.prox} motors={snap.motors} base={snap.params.base} hit={snap.lastHit} now={snap.t} changed={snap.changed}
                enabled={enabled} onSetWeight={setWeight} vertical={vertical}
              />
            </div>
            <ul className="net-legend">
              <li><svg width="34" height="14" aria-hidden="true"><path d="M2,7 H22" className="l-pos" /><path d="M20,2 L30,7 L20,12 Z" className="c-pos" /></svg>{t.net.legendPos}</li>
              <li><svg width="34" height="14" aria-hidden="true"><path d="M2,7 H22" className="l-neg" /><path d="M20,2 L30,7 L20,12 Z" className="c-neg" /></svg>{t.net.legendNeg}</li>
              <li><svg width="34" height="22" aria-hidden="true"><path d="M2,11 L32,1 A32,32 0 0 1 32,21 Z" className="l-cone" /><circle cx="4" cy="11" r="3.5" className="l-cone-dot" /></svg>{t.net.legendCone}</li>
            </ul>
            <p className="muted small formula">{t.net.formula}</p>
            <p className="muted small pick">{t.net.pick}</p>
          </section>

          <div data-tab="arena">
            {live
              ? <RealPanel t={t} link={link} battery={snap.battery} prox={snap.prox} motors={snap.motors} hit={snap.lastHit} now={snap.t} />
              : <Arena t={t} sim={sim.current} speed={simSpeed} onSpeed={setSimSpeed} hit={snap.lastHit} />}
          </div>

          <div data-tab="curves"><Timeline t={t} hist={snap.hist} now={snap.t} t0={snap.t0} /></div>
        </div>

        <div className="col side">
          <div data-tab="net">
            <Brain t={t} state={snap.state} enabled={enabled} live={snap.live} onChange={send} onPreset={applyPreset} />
          </div>
          <div data-tab="net">
            <CycleStrip t={t} state={snap.running ? snap.state : 'pause'} learnt={snap.learnt} hits={snap.hits} lessons={snap.lessons} forget={snap.params.forget} />
          </div>
          <div data-tab="settings">
            <Controls t={t} params={snap.params} state={snap.state} enabled={enabled} onChange={send} />
          </div>
        </div>
      </main>

      <nav className="tabbar" aria-label="Sections">
        {['net', 'settings', 'curves', 'arena'].map((id) => (
          <button key={id} type="button" className={tab === id ? 'on' : ''} aria-pressed={tab === id} onClick={() => setTab(id)}>{id === 'arena' && live ? t.tabs.real : t.tabs[id]}</button>
        ))}
      </nav>

      {help && <Help t={t} onClose={() => { setHelp(false); save('learn.help', '1'); }} />}
      {settings && (
        <Settings
          t={t} lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} link={link} battery={snap.battery} running={snap.running} lastError={snap.error}
          log={log} onClearLog={() => setLog([])} onTest={selfTest} testing={testing} canTest={live && link.status === 'connected'} onClose={() => setSettings(false)} bluetooth={bluetooth}
        />
      )}
    </div>
  );
}
