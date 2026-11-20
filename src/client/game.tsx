import './index.css';

import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type {
  DayStats,
  InitResponse,
  Lamp,
  MyProfile,
  Result,
  Run,
} from '../shared/api';
import {
  FogMeter,
  LOST,
  N,
  RETURNED,
  explains,
  totalCharts,
  trace,
} from '../shared/beam';
import { shortDateLabel } from '../shared/day';
import { fmtHalf, scoreHalf } from '../shared/puzzle';
import { Bay, markersFor, type Flash } from './components/Bay';
import { BeamLog } from './components/BeamLog';
import { BoardFrame } from './components/BoardFrame';
import { Coach } from './components/Coach';
import { Tutorial } from './components/Tutorial';
import { FreePlay } from './components/FreePlay';
import { ResultCard } from './components/ResultCard';
import { ApiError, api } from './lib/api';
import { fmtCount, lampName, lampShort } from './lib/geometry';
import { askLogin, journey, onReddit, toast } from './lib/platform';

const SEEN_KEY = 'fogbound.practice.v1';
const readSeen = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage may be unavailable */
  }
};

const FogIcon = () => (
  <svg className="micon" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M2 6h9M4 9h10M2 12h8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const LampIcon = () => (
  <svg className="micon" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="3.2" fill="#ffd27a" />
    <circle
      cx="8"
      cy="8"
      r="6"
      fill="none"
      stroke="#ffb547"
      strokeWidth="1"
      opacity=".5"
    />
  </svg>
);

const opposite = (port: number) => {
  const side = Math.floor(port / N);
  const k = port % N;
  return side === 0
    ? 2 * N + k
    : side === 2
      ? k
      : side === 1
        ? 3 * N + k
        : N + k;
};

const outcomeText = (o: number) =>
  o === LOST
    ? 'loses it on a rock'
    : o === RETURNED
      ? 'throws it straight back'
      : `brings it out at ${lampShort(o)}`;

const explain = (port: number, outcome: number, pair: number): string => {
  if (outcome === LOST)
    return `Lost. A rock sits head-on somewhere along that beam’s path.`;
  if (outcome === RETURNED)
    return `It came straight back: a rock squeezed it, or one sits right by that lamp.`;
  if (outcome === opposite(port))
    return `Beam ${pair} sailed straight across — or bent and bent back. That line looks clear.`;
  return `Beam ${pair} bent its way out at ${lampName(outcome)}. Rocks steered it.`;
};

type Phase = { kind: 'play' } | { kind: 'done'; result: Result };

const Game = ({ data }: { data: InitResponse }) => {
  const { puzzle } = data;
  const ranked = data.loggedIn && data.isToday;

  const [lamps, setLamps] = useState<Lamp[]>(data.lamps);
  const [shots, setShots] = useState<Run['shots']>(data.run.shots);
  const [borrowsLeft, setBorrowsLeft] = useState(data.run.borrowsLeft);
  const [buoys, setBuoys] = useState<number[]>(data.result?.buoys ?? []);
  const [selected, setSelected] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    data.result ? { kind: 'done', result: data.result } : { kind: 'play' }
  );
  const [stats, setStats] = useState<DayStats>(data.stats);
  const [me, setMe] = useState<MyProfile | null>(data.me);
  const [coach, setCoach] = useState(false);
  const [free, setFree] = useState(false);
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const [practice, setPractice] = useState(
    () => !readSeen() && !data.result && data.run.shots.length === 0
  );
  const [view, setView] = useState<'beams' | 'crowd' | 'log'>('beams');
  const [charts, setCharts] = useState<number | null>(() =>
    data.run.shots.length ? null : totalCharts(puzzle.k)
  );
  const [ghost, setGhost] = useState<number | null>(null);
  const [clear, setClear] = useState<Uint8Array | null>(null);
  const flashKey = useRef(0);
  const meter = useRef<FogMeter | null>(null);

  // fog meter: how many charts still fit the beams you've seen
  useEffect(() => {
    if (phase.kind !== 'play') return;
    let live = true;
    meter.current ??= new FogMeter(puzzle.k);
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
  }, [shots, phase.kind, puzzle.k]);

  // theory check: once every buoy is out, does your chart explain each beam?
  const checks = useMemo(() => {
    if (
      phase.kind !== 'play' ||
      buoys.length !== puzzle.k ||
      shots.length === 0
    )
      return null;
    return new Map(shots.map((s) => [s.port, explains(buoys, s)] as const));
  }, [phase.kind, buoys, shots, puzzle.k]);
  const explained = checks ? [...checks.values()].filter(Boolean).length : 0;

  useEffect(() => journey.ready(), []);

  const markers = useMemo(() => markersFor(shots), [shots]);
  const costHalf = useMemo(() => scoreHalf(shots, 0), [shots]);
  const selLamp = selected === null ? null : lamps[selected];
  const canBorrow =
    ranked &&
    selLamp !== null &&
    selLamp !== undefined &&
    selLamp.by !== null &&
    selLamp.fuel > 0 &&
    selLamp.by !== data.username &&
    borrowsLeft > 0;

  const onLamp = useCallback(
    (p: number) => {
      if (phase.kind !== 'play' || busy) return;
      const mk = markers.get(p);
      const fired = shots.find((s) => s.port === p);
      if (fired && buoys.length === puzzle.k) {
        setSelected(null);
        setGhost((g) => (g === p ? null : p));
        const hyp = trace(p, buoys);
        setNote(
          hyp === fired.outcome
            ? `Your chart explains ${lampShort(p)}: it ${outcomeText(hyp)}.`
            : `Your chart ${outcomeText(hyp)} — but the real beam from ${lampShort(p)} ${outcomeText(fired.outcome)}.`
        );
        return;
      }
      setGhost(null);
      if (mk) {
        setSelected(null);
        setNote(
          mk.kind === 'pair'
            ? `Already known: beam ${mk.pair} links this lamp with ${lampName(mk.partner!)}.`
            : 'You already know what this lamp does.'
        );
        return;
      }
      setNote(null);
      setSelected((s) => (s === p ? null : p));
    },
    [phase.kind, busy, markers, shots, buoys, puzzle.k]
  );

  const onCell = useCallback(
    (c: number) => {
      if (phase.kind !== 'play') return;
      setSelected(null);
      setGhost(null);
      setNote(null);
      setBuoys((b) => {
        if (b.includes(c)) return b.filter((x) => x !== c);
        if (b.length >= puzzle.k) {
          setNote(`All ${puzzle.k} buoys are out — tap one to lift it.`);
          return b;
        }
        const next = [...b, c];
        journey.progress(next.length / puzzle.k, 'buoy');
        return next;
      });
    },
    [phase.kind, puzzle.k]
  );

  const shoot = async (mode: 'fire' | 'borrow') => {
    if (selected === null || busy) return;
    const port = selected;
    setBusy(true);
    try {
      const r = mode === 'fire' ? await api.fire(port) : await api.borrow(port);
      journey.start();
      if (mode === 'borrow') journey.interaction('borrow', r.shot.from);
      const nextShots = [...shots, r.shot];
      setShots(nextShots);
      if (ranked) setBorrowsLeft(r.borrowsLeft);
      if (ranked)
        setLamps((ls) => ls.map((l) => (l.port === port ? r.lamp : l)));
      setSelected(null);
      flashKey.current++;
      setFlash({ port, outcome: r.shot.outcome, key: flashKey.current });
      try {
        navigator.vibrate?.(r.shot.outcome === LOST ? [18, 60, 18] : 12);
      } catch {
        /* no haptics here */
      }
      const pair = markersFor(nextShots).get(port)?.pair ?? 0;
      const prefix = r.shot.borrowed ? `Borrowed from u/${r.shot.from}. ` : '';
      setNote(prefix + explain(port, r.shot.outcome, pair));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Lost signal — try again';
      setNote(msg);
      if (e instanceof ApiError && /burned out|dark/.test(msg)) {
        setLamps((ls) =>
          ls.map((l) => (l.port === port ? { ...l, by: null, fuel: 0 } : l))
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const chart = async () => {
    if (busy || buoys.length !== puzzle.k) return;
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
    setBusy(true);
    try {
      const r = await api.submit(
        buoys,
        ranked
          ? undefined
          : shots.map((s) => ({
              port: s.port,
              outcome: s.outcome,
              borrowed: false,
            }))
      );
      journey.end(r.result.wrong === 0, r.result.scoreHalf / 2);
      setStats(r.stats);
      if (r.me) setMe(r.me);
      setPhase({ kind: 'done', result: r.result });
      setSelected(null);
      setNote(null);
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : 'Lost signal — try again');
    } finally {
      setBusy(false);
    }
  };

  const hint = (() => {
    if (note) return note;
    if (selected !== null) {
      if (canBorrow)
        return `u/${selLamp!.by} lit this lamp. Borrow their beam for ½, or fire your own for 1.`;
      return `${lampName(selected)}: fire to send a beam into the fog.`;
    }
    if (shots.length === 0)
      return 'Tap a lamp on the shore to aim a beam into the fog.';
    if (checks) {
      const n = checks.size;
      if (explained === n && charts === 1)
        return 'Your buoys explain every beam — and it’s the only layout that does. Chart the fog!';
      if (explained === n)
        return `Your buoys explain every beam, but ${charts === null ? 'other' : fmtCount(charts)} rock layouts still do too. Gamble, or light another lamp?`;
      return `Your buoys explain ${explained} of ${n} beams. Tap a ✗ lamp to see where your buoys would send it.`;
    }
    if (charts === 1)
      return 'Only one rock layout fits your beams now. Find it — drop your buoys.';
    return buoys.length
      ? 'Keep reading beams, or move buoys until you’re sure.'
      : 'Fog burns off squares your beams prove empty. The rocks hide in what’s left — fire more, or tap the water to drop a buoy.';
  })();

  const closeCoach = () => {
    markSeen();
    setCoach(false);
  };

  const finishPractice = () => {
    markSeen();
    setPractice(false);
  };

  const done = phase.kind === 'done' ? phase.result : null;
  const totalBuoyers = stats.players + (done && !done.ranked ? 1 : 0);

  if (practice) return <Tutorial onDone={finishPractice} />;
  if (free) return <FreePlay onExit={() => setFree(false)} />;

  return (
    <main className={`game ${done ? 'is-done' : ''}`}>
      <header className="topbar">
        <div>
          <h1 className="wordmark small">Fogbound</h1>
          <div className="sub">
            #{data.number} · {shortDateLabel(puzzle.day)} · {puzzle.k} rocks
            {!ranked && ' · practice'}
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-ghost small"
            onClick={() => (
              setFree(true),
              journey.interaction('practice-header')
            )}
          >
            Practice
          </button>
          <button
            className="icon-btn"
            aria-label="How to play"
            onClick={() => (setCoach(true), journey.interaction('help'))}
          >
            ?
          </button>
        </div>
      </header>

      <div className={done ? 'done-layout' : 'contents'}>
        <div className={done ? 'done-board' : 'contents'}>
          {done && (
            <div className="seg" role="tablist" aria-label="Board view">
              <button
                role="tab"
                aria-selected={view === 'beams'}
                onClick={() => setView('beams')}
              >
                Your beams
              </button>
              <button
                role="tab"
                aria-selected={view === 'crowd'}
                onClick={() => setView('crowd')}
              >
                Crowd buoys
              </button>
              <button
                role="tab"
                aria-selected={view === 'log'}
                onClick={() => (
                  setView('log'),
                  journey.interaction('beam-log')
                )}
              >
                Beam log
              </button>
            </div>
          )}

          <BoardFrame max={640} reserve={done ? 0 : 56}>
            {(size) => (
              <div className="stage" style={{ width: size }}>
                {done && view === 'log' ? (
                  <BeamLog
                    notes={done.notes}
                    expertLine={done.expertLine}
                    size={size}
                  />
                ) : (
                  <div style={{ width: size, height: size }}>
                    <Bay
                      clear={done ? null : clear}
                      lamps={lamps}
                      shots={done ? done.shots : shots}
                      buoys={done ? done.buoys : buoys}
                      selected={selected}
                      rocks={done ? done.rocks : null}
                      heat={done && view === 'crowd' ? done.buoyHeat : null}
                      heatTotal={totalBuoyers}
                      showPaths={Boolean(done) && view === 'beams'}
                      flash={done ? null : flash}
                      interactive={!done}
                      onLamp={onLamp}
                      onCell={onCell}
                      checks={checks}
                      ghost={ghost}
                      label={
                        done
                          ? 'The fog has lifted'
                          : `The bay, ${puzzle.k} rocks hidden`
                      }
                    />
                  </div>
                )}
                {!done && (
                  <p className="hint" aria-live="polite">
                    {hint}
                  </p>
                )}
              </div>
            )}
          </BoardFrame>
        </div>

        {!done && (
          <>
            <div className="dock">
              <div className="meters" aria-label="Your night so far">
                <span className="meter">
                  Cost <b>{fmtHalf(costHalf)}</b> · par {puzzle.par}
                </span>
                {ranked && (
                  <span className="meter">
                    <LampIcon /> {borrowsLeft} cheap borrows
                  </span>
                )}
                <span
                  className={`meter fogm ${charts === 1 ? 'clear' : ''}`}
                  title="Rock layouts that still fit your beams"
                >
                  <FogIcon />{' '}
                  {charts === null
                    ? '…'
                    : charts === 1
                      ? '1 layout left'
                      : `${fmtCount(charts)} layouts`}
                </span>
                <span className="meter">
                  Buoys {buoys.length}/{puzzle.k}
                </span>
              </div>
              {selected !== null ? (
                <div className="actions">
                  {canBorrow && (
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => void shoot('borrow')}
                    >
                      Borrow · ½
                    </button>
                  )}
                  <button
                    className="btn btn-lamp"
                    disabled={busy}
                    onClick={() => void shoot('fire')}
                  >
                    Fire lamp · 1
                  </button>
                </div>
              ) : (
                <div className="actions">
                  {!data.loggedIn && onReddit() && (
                    <button className="btn btn-ghost" onClick={askLogin}>
                      Log in to rank
                    </button>
                  )}
                  <button
                    className="btn btn-lamp"
                    disabled={
                      busy || buoys.length !== puzzle.k || shots.length === 0
                    }
                    onClick={() => void chart()}
                  >
                    {armedFor === buoys.join()
                      ? 'Chart anyway'
                      : 'Chart the fog'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {done && (
          <ResultCard
            result={done}
            par={puzzle.par}
            stats={stats}
            me={me}
            number={data.number}
            isToday={data.isToday}
            todayPostId={data.todayPostId}
            nextAt={data.nextAt}
            loggedIn={data.loggedIn}
            onPractice={() => setFree(true)}
          />
        )}
      </div>

      {coach && (
        <Coach
          onClose={closeCoach}
          onPractice={() => (closeCoach(), setPractice(true))}
          onFree={() => (closeCoach(), setFree(true))}
        />
      )}
    </main>
  );
};

const App = () => {
  const [data, setData] = useState<InitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .init()
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'Could not load')
      );
  }, []);
  useEffect(() => {
    if (error) toast(error);
  }, [error]);
  if (error) return <div className="loading">{error}</div>;
  if (!data) return <div className="loading">Fog rolling in…</div>;
  return <Game data={data} />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
