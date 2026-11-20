import { Hono, type Context } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
import type {
  ErrorResponse,
  FireResponse,
  InitResponse,
  Result,
  ShareResponse,
  SubmitResponse,
} from '../../shared/api';
import { analyzeShots, buildSpace } from '../../shared/beam';
import { todayIndex } from '../../shared/day';
import {
  countWrong,
  publicPuzzle,
  resolveShot,
  scoreHalf,
  starsFor,
  validBuoys,
  validPort,
  type Shot,
} from '../../shared/puzzle';
import { buildShareText } from '../../shared/share';
import { K } from '../core/keys';
import { ensurePuzzle } from '../core/rollover';
import {
  GameError,
  borrowLamp,
  bumpStreak,
  buildResult,
  fireLamp,
  getLamps,
  getRecap,
  getRun,
  getStats,
  getStoredPlay,
  liveStreak,
  nextRolloverAt,
  puzzleNumber,
  recordPlay,
  runView,
} from '../core/store';

export const api = new Hono();

const fail = (message: string): ErrorResponse => ({ status: 'error', message });

const dayForPost = async (
  postId: string | undefined,
  today: number
): Promise<number> => {
  const fromData = context.postData?.day;
  if (typeof fromData === 'number') return fromData;
  if (postId) {
    const raw = await redis.get(K.postDay(postId));
    if (raw) return Number(raw);
  }
  return today;
};

const setFlair = async (
  username: string,
  streak: number,
  guided: number
): Promise<void> => {
  try {
    const parts = [`🏮 ${streak}-day streak`];
    if (guided > 0) parts.push(`guided ${guided}`);
    await reddit.setUserFlair({
      subredditName: context.subredditName,
      username,
      text: parts.join(' · '),
      backgroundColor: '#1d2b3a',
      textColor: 'light',
    });
  } catch (e) {
    console.error('flair failed', e);
  }
};

const handle = async <T>(c: Context, fn: () => Promise<T>) => {
  try {
    return c.json(await fn());
  } catch (e) {
    if (e instanceof GameError) return c.json(fail(e.message), 409);
    console.error('api error', e);
    return c.json(fail('The fog is too thick right now — try again'), 500);
  }
};

api.get('/init', (c) =>
  handle(c, async (): Promise<InitResponse> => {
    const { postId, userId } = context;
    if (!postId) throw new GameError('postId missing');
    const today = todayIndex();
    const day = await dayForPost(postId, today);
    const [puzzle, todayPostId, username] = await Promise.all([
      ensurePuzzle(day),
      redis.get(K.dayPost(today)),
      reddit.getCurrentUsername(),
    ]);
    const ranked = Boolean(userId) && day === today;
    const [stats, recap, number, lamps, me, run, stored] = await Promise.all([
      getStats(day),
      getRecap(day),
      puzzleNumber(day),
      getLamps(day),
      userId ? liveStreak(userId, today) : Promise.resolve(null),
      ranked && userId
        ? getRun(day, userId)
        : Promise.resolve({ shots: [], done: false, borrows: 0 }),
      userId ? getStoredPlay(day, userId) : Promise.resolve(null),
    ]);
    let result: Result | null = null;
    if (stored && userId) {
      const shots = (await getRun(day, userId)).shots;
      result = await buildResult(day, puzzle, shots, stored.b, true, userId);
    }
    return {
      type: 'init',
      postId,
      username: username ?? null,
      loggedIn: Boolean(userId),
      number,
      isToday: day === today,
      todayPostId: todayPostId ?? null,
      puzzle: publicPuzzle(puzzle),
      lamps,
      run: runView(run),
      result,
      stats,
      me,
      recap,
      nextAt: nextRolloverAt(today),
    };
  })
);

const readPort = async (c: Context): Promise<number> => {
  const body: unknown = await c.req.json().catch(() => null);
  const port =
    typeof body === 'object' && body !== null && 'port' in body
      ? body.port
      : undefined;
  if (!validPort(port)) throw new GameError('bad lamp');
  return port;
};

/** Fire a lamp. Ranked keepers pay full price and their oil lights the lamp for others. */
api.post('/fire', (c) =>
  handle(c, async (): Promise<FireResponse> => {
    const { postId, userId } = context;
    const port = await readPort(c);
    const today = todayIndex();
    const day = await dayForPost(postId, today);
    const puzzle = await ensurePuzzle(day);
    const outcome = resolveShot(puzzle, port);
    if (!userId || day !== today) {
      // practice: stateless, nobody's lamps change
      return {
        type: 'fire',
        shot: { port, outcome, borrowed: false },
        lamp: { port, by: null, fuel: 0, fires: 0, borrows: 0 },
        borrowsLeft: 0,
      };
    }
    const username = await reddit.getCurrentUsername();
    const r = await fireLamp(day, userId, username, port, outcome);
    return { type: 'fire', ...r };
  })
);

/** Borrow a lit beam for half price. Credits the keeper whose oil is in the lamp. */
api.post('/borrow', (c) =>
  handle(c, async (): Promise<FireResponse> => {
    const { postId, userId } = context;
    const port = await readPort(c);
    const today = todayIndex();
    const day = await dayForPost(postId, today);
    if (!userId) throw new GameError('Log in to borrow other keepers’ beams');
    if (day !== today) throw new GameError('Lamps only burn on today’s fog');
    const puzzle = await ensurePuzzle(day);
    const r = await borrowLamp(day, userId, port, resolveShot(puzzle, port));
    return {
      type: 'fire',
      shot: r.shot,
      lamp: r.lamp,
      borrowsLeft: r.borrowsLeft,
    };
  })
);

const isShotList = (v: unknown): v is Shot[] =>
  Array.isArray(v) &&
  v.length <= 32 &&
  v.every(
    (s: unknown) =>
      typeof s === 'object' &&
      s !== null &&
      'port' in s &&
      validPort(s.port) &&
      'borrowed' in s &&
      typeof s.borrowed === 'boolean'
  );

api.post('/submit', (c) =>
  handle(c, async (): Promise<SubmitResponse> => {
    const { postId, userId } = context;
    const body: unknown = await c.req.json().catch(() => null);
    const today = todayIndex();
    const day = await dayForPost(postId, today);
    const puzzle = await ensurePuzzle(day);
    const buoys =
      typeof body === 'object' && body !== null && 'buoys' in body
        ? body.buoys
        : null;
    if (!validBuoys(buoys, puzzle.k))
      throw new GameError(`Place exactly ${puzzle.k} buoys`);

    const ranked = Boolean(userId) && day === today;
    if (!ranked || !userId) {
      const claimed =
        typeof body === 'object' && body !== null && 'shots' in body
          ? body.shots
          : [];
      const shots: Shot[] = (isShotList(claimed) ? claimed : []).map((s) => ({
        port: s.port,
        outcome: resolveShot(puzzle, s.port),
        borrowed: false,
      }));
      const result = await buildResult(
        day,
        puzzle,
        shots,
        buoys,
        false,
        undefined
      );
      return { type: 'submit', result, stats: await getStats(day), me: null };
    }

    const run = await getRun(day, userId);
    if (run.shots.length === 0)
      throw new GameError('Light at least one lamp before charting');
    const stored = await getStoredPlay(day, userId);
    let me;
    if (stored) {
      me = await liveStreak(userId, today);
      const result = await buildResult(
        day,
        puzzle,
        run.shots,
        stored.b,
        true,
        userId
      );
      return { type: 'submit', result, stats: await getStats(day), me };
    }
    const fresh = await recordPlay(day, userId, puzzle, run.shots, buoys);
    const username = await reddit.getCurrentUsername();
    me = fresh
      ? await bumpStreak(userId, username, day)
      : await liveStreak(userId, today);
    if (fresh && username) await setFlair(username, me.streak, me.guided);
    const finalBuoys = fresh
      ? buoys
      : ((await getStoredPlay(day, userId))?.b ?? buoys);
    const result = await buildResult(
      day,
      puzzle,
      run.shots,
      finalBuoys,
      true,
      userId
    );
    return { type: 'submit', result, stats: await getStats(day), me };
  })
);

api.post('/share', async (c) => {
  const { postId, userId } = context;
  if (!postId || !userId) return c.json(fail('Log in to share'), 401);
  const today = todayIndex();
  const day = await dayForPost(postId, today);
  const [puzzle, stored, number, me, run] = await Promise.all([
    ensurePuzzle(day),
    getStoredPlay(day, userId),
    puzzleNumber(day),
    liveStreak(userId, today),
    getRun(day, userId),
  ]);
  if (!stored) return c.json(fail('Chart the fog first'), 400);
  const wrong = countWrong(puzzle.rocks, stored.b);
  const text = buildShareText({
    number,
    scoreHalf: stored.s,
    par: puzzle.par,
    stars: starsFor(wrong, scoreHalf(run.shots, 0), puzzle.par),
    fired: run.shots.filter((s) => !s.borrowed).length,
    borrowed: run.shots.filter((s) => s.borrowed).length,
    wrong,
    guided: Number((await redis.zScore(K.credit(day), userId)) ?? 0),
    streak: me.streak,
    chartsLeft: analyzeShots(buildSpace(puzzle.k), run.shots).at(-1)?.after,
  });
  if (await redis.hGet(K.shared(day), userId))
    return c.json<ShareResponse>({ type: 'share', posted: false, text });
  try {
    await reddit.submitComment({ id: postId, text, runAs: 'USER' });
    await redis.hSet(K.shared(day), { [userId]: '1' });
    return c.json<ShareResponse>({ type: 'share', posted: true, text });
  } catch (e) {
    console.error('share as user failed', e);
    return c.json<ShareResponse>({ type: 'share', posted: false, text });
  }
});

api.post('/subscribe', async (c) => {
  try {
    await reddit.subscribeToCurrentSubreddit();
    return c.json({ ok: true });
  } catch (e) {
    console.error('subscribe failed', e);
    return c.json({ ok: false }, 500);
  }
});
