import './index.css';

import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { InitResponse } from '../shared/api';
import { shortDateLabel } from '../shared/day';
import { fmtHalf } from '../shared/puzzle';
import { Bay } from './components/Bay';
import { BoardFrame } from './components/BoardFrame';
import { api } from './lib/api';
import { expand, goTo, journey, onReddit, subredditName } from './lib/platform';

/** maker credit on the splash; the Reddit account that built the game */
const CREDIT = 'u/wparthg';

const News = ({ data }: { data: InitResponse }) => {
  const lit = data.lamps.filter((l) => l.by !== null).length;
  const r = data.recap;
  if (r?.brightest) {
    return (
      <p className="news">
        Last night <b>u/{r.brightest.name}</b>’s lamps guided{' '}
        <b>{r.brightest.guided}</b>{' '}
        {r.brightest.guided === 1 ? 'player' : 'players'} through the fog.
      </p>
    );
  }
  if (lit > 0) {
    return (
      <p className="news">
        <b>{lit}</b> lamp{lit === 1 ? ' is' : 's are'} burning on the shore.
        Borrow a beam, or light your own.
      </p>
    );
  }
  return (
    <p className="news">
      The shore is dark. <b>Light the first lamp</b>. Anyone who borrows it is
      credited to you.
    </p>
  );
};

const Splash = ({ data }: { data: InitResponse }) => {
  const { stats, me, result } = data;
  const perfectPct = stats.players
    ? Math.round((100 * stats.perfect) / stats.players)
    : 0;

  useEffect(() => journey.ready(), []);

  const open = (e: MouseEvent) => {
    journey.interaction('open-game', result ? 'result' : 'play');
    if (!onReddit()) {
      window.location.href = `game.html${window.location.search}`;
      return;
    }
    expand(e.nativeEvent);
  };

  const openToday = () => {
    const sub = subredditName();
    if (data.todayPostId && sub)
      goTo(
        `https://www.reddit.com/r/${sub}/comments/${data.todayPostId.replace('t3_', '')}`
      );
  };

  return (
    <main className="splash">
      <header className="splash-head">
        <h1 className="wordmark">Fogbound</h1>
        <div className="sub">
          #{data.number} · {shortDateLabel(data.puzzle.day)} · {data.puzzle.k}{' '}
          rocks in the fog
        </div>
        <p className="tagline">
          Shine light into the fog to find the hidden rocks.
        </p>
      </header>

      <div className="splash-board">
        <BoardFrame max={560}>
          {(size) => (
            <div style={{ width: size, height: size }}>
              <Bay
                lamps={data.lamps}
                shots={result ? result.shots : data.run.shots}
                buoys={result ? result.buoys : []}
                rocks={result ? result.rocks : null}
                label="Tonight's bay: lamps on the shore, rocks hidden in the fog"
              />
            </div>
          )}
        </BoardFrame>
      </div>

      <div className="splash-info">
        <News data={data} />

        <div className="row">
          {stats.players > 0 && (
            <span className="chip">
              {stats.players.toLocaleString()}{' '}
              {stats.players === 1 ? 'player' : 'players'} · {perfectPct}% found
              every rock
            </span>
          )}
          {me && me.streak > 0 && (
            <span className="chip">🔥 {me.streak}-day streak</span>
          )}
          {result && (
            <span className="chip">
              You: {fmtHalf(result.scoreHalf)} · par {data.puzzle.par}
            </span>
          )}
        </div>

        <div className="row">
          {!data.isToday && data.todayPostId && (
            <button className="btn btn-ghost" onClick={openToday}>
              Tonight’s fog →
            </button>
          )}
          <button className="btn btn-lamp big" onClick={open}>
            {result
              ? 'See your result'
              : data.run.shots.length
                ? 'Continue'
                : data.isToday
                  ? 'Play'
                  : 'Play (practice)'}
          </button>
        </div>
        <p className="credit">A daily puzzle by {CREDIT}</p>
      </div>
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
  if (error) return <div className="loading">{error}</div>;
  if (!data) return <div className="loading">Fog rolling in…</div>;
  return <Splash data={data} />;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
