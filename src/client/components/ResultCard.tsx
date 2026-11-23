import { useEffect, useState } from 'react';
import type { DayStats, MyProfile, Result } from '../../shared/api';
import { formatCountdown } from '../../shared/day';
import { fmtHalf, STARS_RULE } from '../../shared/puzzle';
import { api } from '../lib/api';

/** flip to true once the app is approved and user actions run as the player */
const NATIVE_SUBSCRIBE = false;
import {
  askLogin,
  goTo,
  journey,
  onReddit,
  subredditName,
  toast,
} from '../lib/platform';

const Countdown = ({ at }: { at: number }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="mono">{formatCountdown(at - now)}</span>;
};

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

type Props = {
  result: Result;
  par: number;
  stats: DayStats;
  me: MyProfile | null;
  number: number;
  isToday: boolean;
  todayPostId: string | null;
  nextAt: number;
  loggedIn: boolean;
  onPractice: () => void;
};

export const ResultCard = ({
  result,
  par,
  stats,
  me,
  isToday,
  todayPostId,
  nextAt,
  loggedIn,
  onPractice,
}: Props) => {
  const [shared, setShared] = useState<'idle' | 'busy' | 'done'>('idle');
  const [joined, setJoined] = useState(false);
  const perfectPct = stats.players
    ? Math.round((100 * stats.perfect) / stats.players)
    : 0;
  // nobody else to compare with yet: celebrate instead of showing 0%
  const alone = stats.players <= 1;
  const fired = result.shots.filter((s) => !s.borrowed).length;
  const borrowed = result.shots.length - fired;
  const sub = subredditName() ?? (onReddit() ? undefined : 'Fogbound');

  const headline =
    result.stars === 0
      ? result.wrong === 1
        ? 'One buoy drifted onto open water'
        : `${result.wrong} buoys drifted onto open water`
      : result.stars === 3
        ? 'Every rock charted, on par'
        : 'Every rock charted';

  const share = async () => {
    if (!loggedIn) return askLogin();
    setShared('busy');
    journey.interaction('share');
    try {
      const r = await api.share();
      if (r.posted) toast('Posted to the thread');
      else if (await copy(r.text))
        toast('Result copied. Paste it in the comments.');
      else toast('Already shared today');
      setShared('done');
    } catch {
      setShared('idle');
      toast('Could not post. Try again.');
    }
  };

  const join = async () => {
    journey.interaction('subscribe');
    const openSub = () => {
      if (!sub) return;
      toast(`Opening r/${sub}. Tap Join there.`);
      goTo(`https://www.reddit.com/r/${sub}/`);
    };
    // Until the app is approved, Reddit runs user actions as the app account for
    // everyone except the app owner, so the one-tap join cannot be trusted yet.
    if (!NATIVE_SUBSCRIBE) return openSub();
    try {
      await api.subscribe();
      setJoined(true);
      toast(`Joined r/${sub ?? 'Fogbound'}`);
    } catch {
      openSub();
    }
  };

  const openToday = () => {
    if (todayPostId && sub)
      goTo(
        `https://www.reddit.com/r/${sub}/comments/${todayPostId.replace('t3_', '')}`
      );
  };

  return (
    <section className="result" aria-labelledby="result-title">
      <div className="result-head">
        <div className="stars" aria-label={`${result.stars} of 3 stars`}>
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={i <= result.stars ? 'on' : ''}
              aria-hidden="true"
            >
              ★
            </span>
          ))}
        </div>
        <h2 id="result-title">{headline}</h2>
      </div>
      <p className="stars-rule">{STARS_RULE}</p>

      <div className="numbers">
        <div>
          <b>{fmtHalf(result.scoreHalf)}</b>
          <span>score · par {par}</span>
        </div>
        <div>
          <b>{!result.ranked ? '—' : alone ? '1st' : `${result.beatPct}%`}</b>
          <span>
            {!result.ranked
              ? 'practice'
              : alone
                ? 'to finish tonight'
                : 'of players beaten'}
          </span>
        </div>
        <div>
          <b>{result.guidedToday}</b>
          <span>players who used your lamps</span>
        </div>
      </div>
      <p className="result-explain">
        1 per beam (½ if borrowed), +5 per wrong buoy. Lower is better.
      </p>

      <p className="result-line">
        {fired} lamp{fired === 1 ? '' : 's'} fired
        {borrowed ? ` · ${borrowed} borrowed` : ''}
        {stats.players > 0 &&
          ` · ${perfectPct}% of ${stats.players.toLocaleString()} ${stats.players === 1 ? 'player' : 'players'} found every rock`}
        {me && me.streak > 0 && ` · 🔥 ${me.streak}`}
      </p>
      {result.ranked && result.guidedToday === 0 && (
        <p className="result-tip">
          Light a lamp early tomorrow. Anyone who borrows it is credited to you.
        </p>
      )}

      <div className="actions">
        {isToday ? (
          <>
            <button
              className="btn btn-ghost"
              disabled={shared !== 'idle'}
              onClick={() => void share()}
            >
              {shared === 'done' ? 'Shared' : 'Share result'}
            </button>
            {joined ? (
              <span className="next">
                Next fog in <Countdown at={nextAt} />
              </span>
            ) : (
              <button className="btn btn-lamp" onClick={() => void join()}>
                Join r/{sub ?? 'Fogbound'}
              </button>
            )}
          </>
        ) : (
          <button
            className="btn btn-lamp"
            onClick={openToday}
            disabled={!todayPostId}
          >
            Tonight’s fog →
          </button>
        )}
      </div>
      {isToday && !joined && (
        <p className="next center">
          Next fog in <Countdown at={nextAt} />
        </p>
      )}
      <button className="linkbtn" onClick={onPractice}>
        Can’t wait for tomorrow? Play a practice fog →
      </button>
    </section>
  );
};
