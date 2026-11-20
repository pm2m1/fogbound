import { redis } from '@devvit/web/server';
import { PORTS, analyzeShots, buildSpace, solve } from '../../shared/beam';
import type {
  DayStats,
  Lamp,
  MyProfile,
  Recap,
  Result,
  Run,
} from '../../shared/api';
import { MS_PER_DAY } from '../../shared/day';
import {
  BORROW_CAP,
  FUEL,
  countWrong,
  scoreHalf,
  starsFor,
  type Puzzle,
  type Shot,
} from '../../shared/puzzle';
import { K, RETAIN_DAYS } from './keys';

export const expireDayKey = async (key: string, day: number): Promise<void> => {
  await redis.expire(
    key,
    Math.max(60, (day + RETAIN_DAYS) * 86400 - Math.floor(Date.now() / 1000))
  );
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const parseJson = <T>(
  raw: string | undefined | null,
  guard: (v: unknown) => v is T
): T | null => {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return guard(v) ? v : null;
  } catch {
    return null;
  }
};

const isPuzzle = (v: unknown): v is Puzzle =>
  isObj(v) &&
  typeof v.day === 'number' &&
  Array.isArray(v.rocks) &&
  typeof v.par === 'number';
const isRecap = (v: unknown): v is Recap =>
  isObj(v) && typeof v.fromDay === 'number';

export const getPuzzle = async (day: number): Promise<Puzzle | null> =>
  parseJson(await redis.get(K.puzzle(day)), isPuzzle);

export const getRecap = async (day: number): Promise<Recap | null> =>
  parseJson(await redis.get(K.recap(day)), isRecap);

export const getStartDay = async (fallback: number): Promise<number> => {
  const raw = await redis.get(K.startDay);
  return raw ? Number(raw) : fallback;
};

export const puzzleNumber = async (day: number): Promise<number> =>
  day - (await getStartDay(day)) + 1;

export const nextRolloverAt = (day: number): number => (day + 1) * MS_PER_DAY;

/* ---------------- lamps ---------------- */

export const getLamps = async (day: number): Promise<Lamp[]> => {
  const h = await redis.hGetAll(K.lamps(day));
  return Array.from({ length: PORTS }, (_, p) => {
    const fuel = Number(h[`f${p}`] ?? 0);
    return {
      port: p,
      by: fuel > 0 ? (h[`n${p}`] ?? 'a keeper') : null,
      fuel: Math.max(0, fuel),
      fires: Number(h[`c${p}`] ?? 0),
      borrows: Number(h[`b${p}`] ?? 0),
    };
  });
};

const lampOf = async (day: number, port: number): Promise<Lamp> => {
  const [holderName, fuel, fires, borrows] = await redis.hMGet(K.lamps(day), [
    `n${port}`,
    `f${port}`,
    `c${port}`,
    `b${port}`,
  ]);
  const f = Math.max(0, Number(fuel ?? 0));
  return {
    port,
    by: f > 0 ? (holderName ?? 'a keeper') : null,
    fuel: f,
    fires: Number(fires ?? 0),
    borrows: Number(borrows ?? 0),
  };
};

/* ---------------- runs (a keeper's beams today) ---------------- */

type RunShot = Shot & { from?: string | undefined };

const encodeShot = (outcome: number, borrowed: boolean, from?: string) =>
  `${outcome}|${borrowed ? 1 : 0}|${from ?? ''}`;

const decodeRun = (
  h: Record<string, string>
): { shots: RunShot[]; done: boolean; borrows: number } => {
  const shots: RunShot[] = [];
  for (const [k, v] of Object.entries(h)) {
    if (!/^p\d+$/.test(k) || v === 'pending') continue;
    const [o, b, from] = v.split('|');
    shots.push({
      port: Number(k.slice(1)),
      outcome: Number(o),
      borrowed: b === '1',
      ...(from ? { from } : {}),
    });
  }
  // keep firing order stable for replays
  const order = (h.order ?? '').split(',').filter(Boolean).map(Number);
  shots.sort((a, b) => order.indexOf(a.port) - order.indexOf(b.port));
  return { shots, done: h.done === '1', borrows: Number(h.nb ?? 0) };
};

export const getRun = async (day: number, userId: string) =>
  decodeRun(await redis.hGetAll(K.run(day, userId)));

export const runView = (r: { shots: RunShot[]; borrows: number }): Run => ({
  shots: r.shots,
  borrowsLeft: Math.max(0, BORROW_CAP - r.borrows),
});

export class GameError extends Error {}

const claimPort = async (
  day: number,
  userId: string,
  port: number
): Promise<void> => {
  const key = K.run(day, userId);
  if ((await redis.hGet(key, 'done')) === '1')
    throw new GameError('You already charted today’s fog');
  const fresh = await redis.hSetNX(key, `p${port}`, 'pending');
  if (!fresh) throw new GameError('You already used that lamp');
  await expireDayKey(key, day);
};

const commitShot = async (
  day: number,
  userId: string,
  port: number,
  value: string
) => {
  const key = K.run(day, userId);
  const order = (await redis.hGet(key, 'order')) ?? '';
  await redis.hSet(key, {
    [`p${port}`]: value,
    order: order ? `${order},${port}` : String(port),
  });
};

/** Fire your own lamp: you pay full price and your oil fills the lamp for others. */
export const fireLamp = async (
  day: number,
  userId: string,
  username: string | undefined,
  port: number,
  outcome: number
): Promise<{ shot: RunShot; lamp: Lamp; borrowsLeft: number }> => {
  await claimPort(day, userId, port);
  await commitShot(day, userId, port, encodeShot(outcome, false));
  const key = K.lamps(day);
  await redis.hSet(key, {
    [`h${port}`]: userId,
    [`n${port}`]: username ?? 'a keeper',
    [`f${port}`]: String(FUEL),
  });
  await redis.hIncrBy(key, `c${port}`, 1);
  if (username) await redis.hSet(K.user(userId), { name: username });
  await expireDayKey(key, day);
  const run = await getRun(day, userId);
  return {
    shot: { port, outcome, borrowed: false },
    lamp: await lampOf(day, port),
    borrowsLeft: BORROW_CAP - run.borrows,
  };
};

/** Borrow another keeper's lit beam for half price; credits them and burns one oil. */
export const borrowLamp = async (
  day: number,
  userId: string,
  port: number,
  outcome: number
): Promise<{
  shot: RunShot;
  lamp: Lamp;
  borrowsLeft: number;
  holder: string;
}> => {
  const lampKey = K.lamps(day);
  const [holder, holderName] = await redis.hMGet(lampKey, [
    `h${port}`,
    `n${port}`,
  ]);
  if (!holder) throw new GameError('That lamp is dark — fire it yourself');
  if (holder === userId) throw new GameError('That’s your own lamp');
  const runKey = K.run(day, userId);
  await claimPort(day, userId, port);
  const nb = await redis.hIncrBy(runKey, 'nb', 1);
  if (nb > BORROW_CAP) {
    await redis.hIncrBy(runKey, 'nb', -1);
    await redis.hDel(runKey, [`p${port}`]);
    throw new GameError(`You can only borrow ${BORROW_CAP} beams a day`);
  }
  const fuel = await redis.hIncrBy(lampKey, `f${port}`, -1);
  if (fuel < 0) {
    await redis.hIncrBy(lampKey, `f${port}`, 1);
    await redis.hIncrBy(runKey, 'nb', -1);
    await redis.hDel(runKey, [`p${port}`]);
    throw new GameError('That lamp just burned out — fire it yourself');
  }
  const name = holderName ?? 'a keeper';
  await commitShot(day, userId, port, encodeShot(outcome, true, name));
  await Promise.all([
    redis.hIncrBy(lampKey, `b${port}`, 1),
    redis.zIncrBy(K.credit(day), holder, 1),
    redis.hIncrBy(K.user(holder), 'guided', 1),
    redis.zIncrBy(K.guidedBoard, holder, 1),
  ]);
  await expireDayKey(K.credit(day), day);
  return {
    shot: { port, outcome, borrowed: true, from: name },
    lamp: await lampOf(day, port),
    borrowsLeft: BORROW_CAP - nb,
    holder,
  };
};

/* ---------------- stats & results ---------------- */

export const getStats = async (day: number): Promise<DayStats> => {
  const h = await redis.hGetAll(K.stats(day));
  return {
    players: Number(h.players ?? 0),
    perfect: Number(h.perfect ?? 0),
    parHits: Number(h.par ?? 0),
  };
};

export const getBuoyHeat = async (
  day: number
): Promise<Record<string, number>> => {
  const h = await redis.hGetAll(K.buoys(day));
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Number(v)]));
};

const beatPct = async (
  day: number,
  myScore: number,
  includeSelf: boolean
): Promise<number> => {
  const h = await redis.hGetAll(K.scores(day));
  let total = includeSelf ? 0 : 1;
  let worse = 0;
  for (const [s, n] of Object.entries(h)) {
    total += Number(n);
    if (Number(s) > myScore) worse += Number(n);
  }
  return total ? Math.round((100 * worse) / total) : 0;
};

type StoredPlay = { s: number; w: number; b: number[] };
const isStoredPlay = (v: unknown): v is StoredPlay =>
  isObj(v) &&
  typeof v.s === 'number' &&
  typeof v.w === 'number' &&
  Array.isArray(v.b);

export const getStoredPlay = async (
  day: number,
  userId: string
): Promise<StoredPlay | null> =>
  parseJson(await redis.hGet(K.plays(day), userId), isStoredPlay);

export const guidedToday = async (
  day: number,
  userId: string
): Promise<number> => Number((await redis.zScore(K.credit(day), userId)) ?? 0);

export const buildResult = async (
  day: number,
  puzzle: Puzzle,
  shots: Shot[],
  buoys: number[],
  ranked: boolean,
  userId: string | undefined
): Promise<Result> => {
  const wrong = countWrong(puzzle.rocks, buoys);
  const s = scoreHalf(shots, wrong);
  const beamsHalf = scoreHalf(shots, 0);
  const [beat, heat, guided] = await Promise.all([
    beatPct(day, s, ranked),
    getBuoyHeat(day),
    userId ? guidedToday(day, userId) : Promise.resolve(0),
  ]);
  if (!ranked)
    for (const b of buoys) heat[String(b)] = (heat[String(b)] ?? 0) + 1;
  return {
    ranked,
    scoreHalf: s,
    wrong,
    stars: starsFor(wrong, beamsHalf, puzzle.par),
    rocks: puzzle.rocks,
    buoys,
    shots,
    beatPct: beat,
    buoyHeat: heat,
    guidedToday: guided,
    notes: analyzeShots(buildSpace(puzzle.k), shots),
    expertLine: puzzle.line ?? solve(buildSpace(puzzle.k), puzzle.rocks).fired,
  };
};

/** Records a ranked result. Returns false if the keeper already finished today. */
export const recordPlay = async (
  day: number,
  userId: string,
  puzzle: Puzzle,
  shots: Shot[],
  buoys: number[]
): Promise<boolean> => {
  const wrong = countWrong(puzzle.rocks, buoys);
  const s = scoreHalf(shots, wrong);
  const stored: StoredPlay = { s, w: wrong, b: buoys };
  const fresh = await redis.hSetNX(
    K.plays(day),
    userId,
    JSON.stringify(stored)
  );
  if (!fresh) return false;
  const stars = starsFor(wrong, scoreHalf(shots, 0), puzzle.par);
  await Promise.all([
    redis.hSet(K.run(day, userId), { done: '1' }),
    ...buoys.map((b) => redis.hIncrBy(K.buoys(day), String(b), 1)),
    redis.hIncrBy(K.scores(day), String(s), 1),
    redis.hIncrBy(K.stats(day), 'players', 1),
    wrong === 0
      ? redis.hIncrBy(K.stats(day), 'perfect', 1)
      : Promise.resolve(0),
    stars === 3 ? redis.hIncrBy(K.stats(day), 'par', 1) : Promise.resolve(0),
  ]);
  await Promise.all(
    [K.plays(day), K.buoys(day), K.scores(day), K.stats(day)].map((k) =>
      expireDayKey(k, day)
    )
  );
  return true;
};

/* ---------------- profile & streaks ---------------- */

export const getProfile = async (userId: string): Promise<MyProfile> => {
  const h = await redis.hGetAll(K.user(userId));
  return {
    streak: Number(h.cur ?? 0),
    best: Number(h.best ?? 0),
    plays: Number(h.plays ?? 0),
    guided: Number(h.guided ?? 0),
  };
};

export const liveStreak = async (
  userId: string,
  today: number
): Promise<MyProfile> => {
  const [p, lastRaw] = await Promise.all([
    getProfile(userId),
    redis.hGet(K.user(userId), 'last'),
  ]);
  const last = Number(lastRaw ?? -10);
  return last >= today - 1 ? p : { ...p, streak: 0 };
};

export const bumpStreak = async (
  userId: string,
  username: string | undefined,
  day: number
): Promise<MyProfile> => {
  const key = K.user(userId);
  const h = await redis.hGetAll(key);
  const last = Number(h.last ?? -10);
  if (last === day) return getProfile(userId);
  const cur = last === day - 1 ? Number(h.cur ?? 0) + 1 : 1;
  const best = Math.max(cur, Number(h.best ?? 0));
  const plays = Number(h.plays ?? 0) + 1;
  await redis.hSet(key, {
    cur: String(cur),
    best: String(best),
    last: String(day),
    plays: String(plays),
    ...(username ? { name: username } : {}),
  });
  await redis.zAdd(K.streakBoard, { member: userId, score: cur });
  return { streak: cur, best, plays, guided: Number(h.guided ?? 0) };
};

/** Brightest keeper of a day, for recaps and the results comment. */
export const brightestKeeper = async (
  day: number
): Promise<{ name: string; guided: number } | null> => {
  const top = await redis.zRange(K.credit(day), 0, 0, {
    reverse: true,
    by: 'rank',
  });
  const first = top[0];
  if (!first || first.score <= 0) return null;
  const name = await redis.hGet(K.user(first.member), 'name');
  return name ? { name, guided: first.score } : null;
};
