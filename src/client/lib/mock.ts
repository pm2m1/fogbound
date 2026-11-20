/**
 * LOCAL PREVIEW ONLY. Simulates the server plus a synthetic crowd so the UI can be
 * developed and screenshotted outside Reddit. api.ts imports this only when the
 * Devvit runtime is absent, so it never runs on Reddit.
 *
 * URL params: crowd=240  logged=0  state=fresh|mid|done  coach=1
 */
import type {
  FireResponse,
  InitResponse,
  Lamp,
  Result,
  ShareResponse,
  SubmitResponse,
} from '../../shared/api';
import {
  CELLS,
  PORTS,
  analyzeShots,
  buildSpace,
  solve,
  trace,
} from '../../shared/beam';
import { todayIndex } from '../../shared/day';
import {
  BORROW_CAP,
  FUEL,
  countWrong,
  generatePuzzle,
  publicPuzzle,
  scoreHalf,
  starsFor,
  type Shot,
} from '../../shared/puzzle';
import { makeRng } from '../../shared/rng';
import { buildShareText } from '../../shared/share';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const CROWD = Number(params.get('crowd') ?? 240);
const LOGGED = params.get('logged') !== '0';
const STATE = params.get('state') ?? 'fresh';
const NAMES = [
  'tidewatcher',
  'gull_whisperer',
  'harbor_nan',
  'saltyprof',
  'k_lighthouse',
  'brinebeard',
  'mistwalker',
  'oarsome_ola',
];

const day = todayIndex();
const puzzle = generatePuzzle(day, 'preview');
const rng = makeRng(`crowd:${day}`);

const lamps: Lamp[] = Array.from({ length: PORTS }, (_, p) => ({
  port: p,
  by: null,
  fuel: 0,
  fires: 0,
  borrows: 0,
}));
const buoyHeat: Record<string, number> = {};
const scores: number[] = [];
let perfect = 0;

// synthetic crowd: good keepers light the solver's lamps; sloppy ones wander
if (CROWD > 0) {
  const best = solve(buildSpace(puzzle.k), puzzle.rocks).fired;
  for (let i = 0; i < CROWD; i++) {
    const p = rng.chance(0.7) ? rng.pick(best) : rng.int(0, PORTS - 1);
    const l = lamps[p]!;
    l.fires++;
    l.by = rng.pick(NAMES);
    l.fuel = rng.int(0, FUEL);
    l.borrows += rng.int(0, 3);
    const wrong = rng.chance(0.62) ? 0 : rng.int(1, 2);
    if (wrong === 0) perfect++;
    const marks = [...puzzle.rocks];
    for (let w = 0; w < wrong; w++) {
      const near = puzzle.rocks[w]! + rng.pick([-9, -8, -7, -1, 1, 7, 8, 9]);
      marks[w] = near >= 0 && near < CELLS ? near : rng.int(0, CELLS - 1);
    }
    for (const m of marks) buoyHeat[String(m)] = (buoyHeat[String(m)] ?? 0) + 1;
    scores.push(
      rng.int(puzzle.par - 2, puzzle.par + 6) * 2 + rng.int(0, 1) + wrong * 10
    );
  }
  for (const l of lamps) if (l.fuel === 0) l.by = null;
}

const shots: (Shot & { from?: string })[] = [];
let borrowsLeft = LOGGED ? BORROW_CAP : 0;
let result: Result | null = null;

const buildResult = (buoys: number[]): Result => {
  const wrong = countWrong(puzzle.rocks, buoys);
  const s = scoreHalf(shots, wrong);
  const heat = { ...buoyHeat };
  for (const b of buoys) heat[String(b)] = (heat[String(b)] ?? 0) + 1;
  return {
    ranked: LOGGED,
    scoreHalf: s,
    wrong,
    stars: starsFor(wrong, scoreHalf(shots, 0), puzzle.par),
    rocks: puzzle.rocks,
    buoys,
    shots: [...shots],
    beatPct: scores.length
      ? Math.round(
          (100 * scores.filter((x) => x > s).length) / (scores.length + 1)
        )
      : 0,
    buoyHeat: heat,
    guidedToday: shots.filter((x) => !x.borrowed).length * 4,
    notes: analyzeShots(buildSpace(puzzle.k), shots),
    expertLine: puzzle.line ?? [],
  };
};

const take = (port: number, borrowed: boolean) => {
  const l = lamps[port]!;
  const shot = {
    port,
    outcome: trace(port, puzzle.rocks),
    borrowed,
    ...(borrowed ? { from: l.by ?? 'a keeper' } : {}),
  };
  shots.push(shot);
  if (borrowed) {
    l.fuel--;
    l.borrows++;
    if (l.fuel <= 0) l.by = null;
    borrowsLeft--;
  } else if (LOGGED) {
    l.by = 'you';
    l.fuel = FUEL;
    l.fires++;
  }
  return shot;
};

// pre-baked states for screenshots
if (STATE === 'mid' || STATE === 'done') {
  const plan = solve(buildSpace(puzzle.k), puzzle.rocks).fired;
  plan.slice(0, STATE === 'mid' ? 3 : plan.length).forEach((p, i) => {
    const borrowable =
      LOGGED &&
      lamps[p]!.by &&
      lamps[p]!.fuel > 0 &&
      borrowsLeft > 0 &&
      i % 2 === 1;
    take(p, Boolean(borrowable));
  });
  if (STATE === 'done') result = buildResult([...puzzle.rocks]);
}

const stats = () => ({
  players: CROWD + (result ? 1 : 0),
  perfect: perfect + (result?.wrong === 0 ? 1 : 0),
  parHits: Math.round(CROWD * 0.3),
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockCall = async <T>(path: string, body?: unknown): Promise<T> => {
  await wait(120);
  const b = (body ?? {}) as { port?: number; buoys?: number[] };
  if (path === '/api/init') {
    const r: InitResponse = {
      type: 'init',
      postId: 't3_preview',
      username: LOGGED ? 'you' : null,
      loggedIn: LOGGED,
      number: 12,
      isToday: true,
      todayPostId: 't3_preview',
      puzzle: publicPuzzle(puzzle),
      lamps: lamps.map((l) => ({ ...l })),
      run: { shots: [...shots], borrowsLeft },
      result,
      stats: stats(),
      me: LOGGED ? { streak: 6, best: 9, plays: 14, guided: 57 } : null,
      recap: CROWD
        ? {
            fromDay: day - 1,
            players: 1187,
            perfect: 702,
            brightest: { name: 'tidewatcher', guided: 41 },
          }
        : null,
      nextAt: (day + 1) * 86_400_000,
    };
    return r as T;
  }
  if (path === '/api/fire' || path === '/api/borrow') {
    const port = b.port ?? 0;
    const borrowed = path === '/api/borrow';
    if (shots.some((s) => s.port === port))
      throw new Error('You already used that lamp');
    if (borrowed && (!LOGGED || borrowsLeft <= 0 || !lamps[port]!.by))
      throw new Error('Can’t borrow that beam');
    const shot = take(port, borrowed);
    const r: FireResponse = {
      type: 'fire',
      shot,
      lamp: { ...lamps[port]! },
      borrowsLeft,
    };
    return r as T;
  }
  if (path === '/api/submit') {
    result = buildResult(b.buoys ?? []);
    const r: SubmitResponse = {
      type: 'submit',
      result,
      stats: stats(),
      me: LOGGED
        ? { streak: 7, best: 9, plays: 15, guided: 57 + result.guidedToday }
        : null,
    };
    return r as T;
  }
  if (path === '/api/share') {
    const r: ShareResponse = {
      type: 'share',
      posted: false,
      text: buildShareText({
        number: 12,
        scoreHalf: result?.scoreHalf ?? 0,
        par: puzzle.par,
        stars: result?.stars ?? 0,
        fired: shots.filter((s) => !s.borrowed).length,
        borrowed: shots.filter((s) => s.borrowed).length,
        wrong: result?.wrong ?? 0,
        guided: result?.guidedToday ?? 0,
        streak: 7,
      }),
    };
    return r as T;
  }
  if (path === '/api/subscribe') return { ok: true } as T;
  throw new Error(`mock: unknown ${path}`);
};
