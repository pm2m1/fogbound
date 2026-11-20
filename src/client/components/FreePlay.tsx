import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lamp, PracticeResponse, Run } from '../../shared/api';
import type { BeamNote } from '../../shared/beam';
import {
  FogMeter,
  LOST,
  PORTS,
  RETURNED,
  explains,
  totalCharts,
  trace,
} from '../../shared/beam';
import { countWrong, fmtHalf, scoreHalf, starsFor } from '../../shared/puzzle';
import { api } from '../lib/api';
import { fmtCount, lampShort } from '../lib/geometry';
import { journey } from '../lib/platform';
import { Bay, markersFor, type Flash } from './Bay';
import { BoardFrame } from './BoardFrame';
import { BeamLog } from './BeamLog';

const DARK: Lamp[] = Array.from({ length: PORTS }, (_, p) => ({
  port: p,
  by: null,
  fuel: 0,
  fires: 0,
  borrows: 0,
}));

const outcomeText = (o: number) =>
  o === LOST
    ? 'Lost on a rock.'
    : o === RETURNED
      ? 'It came straight back.'
      : `It came out at ${lampShort(o)}.`;

/**
 * Unlimited practice fogs: unranked, played entirely on the device. They never touch
 * the daily puzzle, scores, streaks or the shared lamps.
 */
export const FreePlay = ({ onExit }: { onExit: () => void }) => {
  const [fog, setFog] = useState<PracticeResponse | null>(null);
  const [shots, setShots] = useState<Run['shots']>([]);
  const [buoys, setBuoys] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [charts, setCharts] = useState<number | null>(null);
  const [ghost, setGhost] = useState<number | null>(null);
  const [clear, setClear] = useState<Uint8Array | null>(null);
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(0);
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'log'>('board');
  const [notes, setNotes] = useState<BeamNote[] | null>(null);
  const [logState, setLogState] = useState<'idle' | 'loading' | 'error'>(
    'idle'
  );
  const key = useRef(0);
  const meter = useRef<FogMeter | null>(null);

  const fetchFog = useCallback(
    () =>
      api
        .practice()
        .then((f) => {
          meter.current = new FogMeter(f.k);
          setCharts(totalCharts(f.k));
          setFog(f);
          journey.interaction('practice-fog');
        })
        .catch(() => setNote('The fog would not roll in — try again')),
    []
  );

  useEffect(() => {
    void fetchFog();
  }, [fetchFog]);

  const load = () => {
    setFog(null);
    setShots([]);
    setBuoys([]);
    setSelected(null);
    setFlash(null);
    setNote(null);
    setGhost(null);
    setClear(null);
    setView('board');
    setNotes(null);
    setLogState('idle');
    setDone(false);
    void fetchFog();
  };

  useEffect(() => {
    if (!fog || !meter.current || shots.length === 0) return;
    let live = true;
    meter.current
      .count(shots.map((s) => ({ port: s.port, outcome: s.outcome })))
      .then((n) => {
        if (!live) return;
        setCharts(n);
        setClear(meter.current?.clearCells() ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [shots, fog]);

  const markers = useMemo(() => markersFor(shots), [shots]);
  const checks = useMemo(() => {
    if (!fog || done || buoys.length !== fog.k || shots.length === 0)
      return null;
    return new Map(shots.map((s) => [s.port, explains(buoys, s)] as const));
  }, [fog, done, buoys, shots]);

  if (!fog)
    return (
      <main className="game">
        <div className="loading">{note ?? 'Fog rolling in…'}</div>
      </main>
    );

  const costHalf = scoreHalf(shots, 0);
  const wrong = done ? countWrong(fog.rocks, buoys) : 0;
  const stars = done ? starsFor(wrong, costHalf, fog.par) : 0;

  const onLamp = (p: number) => {
    if (done) return;
    const fired = shots.find((s) => s.port === p);
    if (fired && buoys.length === fog.k) {
      setGhost((g) => (g === p ? null : p));
      const hyp = trace(p, buoys);
      setNote(
        hyp === fired.outcome
          ? `Your buoys explain ${lampShort(p)}.`
          : `Your buoys: ${outcomeText(hyp).toLowerCase()} Really: ${outcomeText(fired.outcome).toLowerCase()}`
      );
      return;
    }
    setGhost(null);
    if (markers.has(p)) {
      setNote('You already know what this lamp does.');
      return;
    }
    setNote(null);
    setSelected((s) => (s === p ? null : p));
  };

  const fire = () => {
    if (selected === null) return;
    const outcome = trace(selected, fog.rocks);
    setShots((s) => [...s, { port: selected, outcome, borrowed: false }]);
    key.current++;
    setFlash({ port: selected, outcome, key: key.current });
    setNote(outcomeText(outcome));
    setSelected(null);
    try {
      navigator.vibrate?.(outcome === LOST ? [18, 60, 18] : 12);
    } catch {
      /* no haptics */
    }
  };

  const onCell = (c: number) => {
    if (done) return;
    setSelected(null);
    setGhost(null);
    setNote(null);
    setBuoys((b) =>
      b.includes(c)
        ? b.filter((x) => x !== c)
        : b.length < fog.k
          ? [...b, c]
          : b
    );
  };

  const chart = () => {
    const bad = checks ? checks.size - explained : 0;
    if (bad > 0 && armedFor !== buoys.join()) {
      setArmedFor(buoys.join());
      setNote(
        `Careful: your buoys contradict ${bad} beam${bad > 1 ? 's' : ''} (the lamps with a red badge). Tap one to see why, or chart anyway.`
      );
      return;
    }
    if (charts !== null && charts > 2 && armedFor !== buoys.join()) {
      setArmedFor(buoys.join());
      setNote(
        `${fmtCount(charts)} rock layouts still fit your beams, so this is a guess. A wrong buoy costs 5, a beam only 1 — fire more lamps, or chart anyway.`
      );
      return;
    }
    setArmedFor(null);
    setDone(true);
    setSelected(null);
    setGhost(null);
    setCount((n) => n + 1);
    journey.interaction('practice-charted');
  };

  const openLog = () => {
    setView('log');
    journey.interaction('practice-beam-log');
    if (!fog || notes || logState === 'loading') return;
    setLogState('loading');
    api
      .practiceLog(
        fog.rocks,
        shots.map((s) => s.port)
      )
      .then((r) => {
        setNotes(r.notes);
        setLogState('idle');
      })
      .catch(() => setLogState('error'));
  };

  const explained = checks ? [...checks.values()].filter(Boolean).length : 0;
  const hint = (() => {
    if (done)
      return wrong === 0
        ? `Every rock charted for ${fmtHalf(costHalf)} — par was ${fog.par}.${costHalf > (fog.par + 2) * 2 ? ' Open the beam log to see which beams were wasted.' : ''}`
        : `${wrong} buoy${wrong > 1 ? 's' : ''} on open water. The fog has lifted — see how the beams really ran.`;
    if (note) return note;
    if (selected !== null)
      return `${lampShort(selected)}: fire to send a beam into the fog.`;
    if (checks) {
      if (explained === checks.size && charts === 1)
        return 'Your buoys explain every beam — and only one layout does. Chart it!';
      if (explained === checks.size)
        return 'Your buoys explain every beam, but other layouts do too. Gamble, or fire another lamp?';
      return `Your buoys explain ${explained} of ${checks.size} beams. Tap a ✗ lamp to compare.`;
    }
    if (shots.length === 0)
      return 'Practice fog — nothing at stake. Tap a lamp to aim.';
    return 'Fog burns off squares your beams prove empty. The rocks hide in what’s left — fire more, or drop buoys.';
  })();

  return (
    <main className={`game ${done ? 'is-done' : ''}`}>
      <header className="topbar">
        <div>
          <h1 className="wordmark small">Practice fog</h1>
          <div className="sub">
            Unranked · {fog.k} rocks · par {fog.par}
            {count > 0 && ` · ${count} charted`}
          </div>
        </div>
        <button className="btn btn-ghost small" onClick={onExit}>
          Back
        </button>
      </header>

      {done && (
        <div className="seg" role="tablist" aria-label="Practice view">
          <button
            role="tab"
            aria-selected={view === 'board'}
            onClick={() => setView('board')}
          >
            The fog lifted
          </button>
          <button role="tab" aria-selected={view === 'log'} onClick={openLog}>
            Beam log
          </button>
        </div>
      )}

      <BoardFrame max={640} reserve={56}>
        {(size) => (
          <div className="stage" style={{ width: size }}>
            {done && view === 'log' ? (
              notes ? (
                <BeamLog notes={notes} expertLine={fog.line} size={size} />
              ) : (
                <div
                  className="beamlog beamlog-wait"
                  style={{ width: size, height: size }}
                >
                  {logState === 'error' ? (
                    <button className="btn btn-ghost small" onClick={openLog}>
                      Couldn’t grade — try again
                    </button>
                  ) : (
                    'Grading your beams…'
                  )}
                </div>
              )
            ) : (
              <div style={{ width: size, height: size }}>
                <Bay
                  clear={done ? null : clear}
                  lamps={DARK}
                  shots={shots}
                  buoys={buoys}
                  selected={selected}
                  rocks={done ? fog.rocks : null}
                  showPaths={done}
                  flash={done ? null : flash}
                  interactive={!done}
                  onLamp={onLamp}
                  onCell={onCell}
                  checks={checks}
                  ghost={ghost}
                  label={
                    done
                      ? 'The practice fog has lifted'
                      : `Practice fog, ${fog.k} rocks hidden`
                  }
                />
              </div>
            )}
            <p className="hint" aria-live="polite">
              {hint}
            </p>
          </div>
        )}
      </BoardFrame>

      <div className="dock">
        {!done && (
          <div className="meters">
            <span className="meter">
              Cost <b>{fmtHalf(costHalf)}</b> · par {fog.par}
            </span>
            <span className={`meter fogm ${charts === 1 ? 'clear' : ''}`}>
              {charts === null
                ? '…'
                : charts === 1
                  ? '1 layout left'
                  : `${fmtCount(charts)} layouts`}
            </span>
            <span className="meter">
              Buoys {buoys.length}/{fog.k}
            </span>
          </div>
        )}
        {done && (
          <div className="stars center" aria-label={`${stars} of 3 stars`}>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={i <= stars ? 'on' : ''}
                aria-hidden="true"
              >
                ★
              </span>
            ))}
          </div>
        )}
        <div className="actions">
          {done ? (
            <>
              <button className="btn btn-ghost" onClick={onExit}>
                Back to tonight
              </button>
              <button className="btn btn-lamp" onClick={load}>
                Another fog
              </button>
            </>
          ) : selected !== null ? (
            <button className="btn btn-lamp" onClick={fire}>
              Fire lamp · 1
            </button>
          ) : (
            <button
              className="btn btn-lamp"
              disabled={buoys.length !== fog.k || shots.length === 0}
              onClick={chart}
            >
              {armedFor === buoys.join() ? 'Chart anyway' : 'Chart the fog'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
};
