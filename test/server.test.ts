import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { comments, context, fakePosts, flairs, resetFake } from './fakeDevvit';
import { api } from '../src/server/routes/api';
import { scheduler } from '../src/server/routes/scheduler';
import type {
  FireResponse,
  InitResponse,
  SubmitResponse,
} from '../src/shared/api';
import { MS_PER_DAY } from '../src/shared/day';
import { buildSpace, isUnique, trace } from '../src/shared/beam';
import { getPuzzle } from '../src/server/core/store';
import { BORROW_CAP, FUEL } from '../src/shared/puzzle';

const app = new Hono();
app.route('/api', api);
app.route('/internal/scheduler', scheduler);

// 2026-11-23 is a Monday (3 rocks); Tuesday has 4
const MONDAY = Math.floor(Date.UTC(2026, 10, 23) / MS_PER_DAY);

const setDay = (day: number) =>
  vi.setSystemTime(new Date(day * MS_PER_DAY + 3_600_000));
const as = (n: number | null) => {
  context.userId = n === null ? undefined : `t2_u${n}`;
  context.username = n === null ? undefined : `keeper${n}`;
};
const rollover = async () => {
  const r = await app.request('/internal/scheduler/daily-rollover', {
    method: 'POST',
    body: '{}',
  });
  expect(r.status).toBe(200);
};
const todaysPost = () => [...fakePosts.values()].at(-1)!;
const usePost = (p = todaysPost()) => {
  context.postId = p.id;
  context.postData = p.postData as Record<string, unknown>;
};
const init = async (): Promise<InitResponse> => {
  usePost();
  const r = await app.request('/api/init');
  expect(r.status).toBe(200);
  return (await r.json()) as InitResponse;
};
const post = async <T>(path: string, body: unknown) => {
  const r = await app.request(`/api/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    body: (await r.json()) as T & { message?: string },
  };
};
const fire = (port: number) => post<FireResponse>('fire', { port });
const borrow = (port: number) => post<FireResponse>('borrow', { port });
const submit = (buoys: number[], shots?: unknown) =>
  post<SubmitResponse>('submit', { buoys, ...(shots ? { shots } : {}) });

describe('Fogbound server', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    resetFake();
  });
  afterEach(() => vi.useRealTimers());

  it('posts a fair daily fog and never leaks the rocks', async () => {
    setDay(MONDAY);
    await rollover();
    await rollover(); // idempotent
    expect(fakePosts.size).toBe(1);
    expect(todaysPost().stickied).toBe(true);
    expect(todaysPost().title).toMatch(/^Fogbound #1 · Monday: 3 rocks/);
    expect(
      comments.some((c) => c.distinguished && c.body.includes('3 rocks hide'))
    ).toBe(true);

    const puzzle = (await getPuzzle(MONDAY))!;
    expect(puzzle.rocks).toHaveLength(3);
    expect(isUnique(buildSpace(3), puzzle.rocks)).toBe(true);
    expect(puzzle.par).toBeGreaterThanOrEqual(4);

    as(1);
    const d = await init();
    expect(d.puzzle.k).toBe(3);
    expect(JSON.stringify(d)).not.toContain('rocks');
    expect(d.lamps).toHaveLength(32);
    expect(d.lamps.every((l) => l.by === null)).toBe(true);
    expect(d.result).toBeNull();
  }, 30_000);

  it('runs the lamp economy: fire, borrow, credit, burn out, caps', async () => {
    setDay(MONDAY + 1);
    await rollover();
    const puzzle = (await getPuzzle(MONDAY + 1))!;
    expect(puzzle.k).toBe(4);
    usePost();

    // keeper1 fires lamp 5 — outcome is server truth
    as(1);
    const f = await fire(5);
    expect(f.status).toBe(200);
    expect(f.body.shot.outcome).toBe(trace(5, puzzle.rocks));
    expect(f.body.lamp).toMatchObject({ by: 'keeper1', fuel: FUEL, fires: 1 });
    expect((await fire(5)).status).toBe(409); // same lamp twice
    expect((await borrow(5)).status).toBe(409); // own lamp

    // dark lamp can't be borrowed
    as(2);
    expect((await borrow(6)).status).toBe(409);

    // three keepers borrow lamp 5 and burn its oil
    for (const u of [2, 3, 4]) {
      as(u);
      const b = await borrow(5);
      expect(b.status).toBe(200);
      expect(b.body.shot).toMatchObject({
        borrowed: true,
        from: 'keeper1',
        outcome: trace(5, puzzle.rocks),
      });
    }
    as(5);
    const burnt = await borrow(5);
    expect(burnt.status).toBe(409);
    expect(burnt.body.message).toMatch(/burned out|dark/);

    // keeper5 relights it and takes over the credit
    const relit = await fire(5);
    expect(relit.body.lamp).toMatchObject({
      by: 'keeper5',
      fuel: FUEL,
      fires: 2,
      borrows: 3,
    });
    as(6);
    expect((await borrow(5)).body.shot.from).toBe('keeper5');

    // borrow cap
    as(1);
    for (const p of [10, 11, 12, 13]) await fire(p);
    as(7);
    for (let i = 0; i < BORROW_CAP; i++)
      expect((await borrow(10 + i)).status).toBe(200);
    const capped = await borrow(13);
    expect(capped.status).toBe(409);
    expect(capped.body.message).toMatch(/only borrow/);

    // keeper1 finishes perfectly: 5 fires = 5 points; credit counted
    as(1);
    const r = await submit(puzzle.rocks);
    expect(r.status).toBe(200);
    expect(r.body.result.wrong).toBe(0);
    expect(r.body.result.scoreHalf).toBe(10);
    expect(r.body.result.guidedToday).toBe(3 + BORROW_CAP); // 3 on lamp 5 + keeper7's three
    expect(r.body.me?.streak).toBe(1);
    expect(flairs.get('keeper1')).toMatch(/1-day streak · guided 6/);
    expect((await fire(20)).status).toBe(409); // done for the day

    // resubmitting can't overwrite
    const again = await submit([0, 1, 2, 3]);
    expect(again.body.result.wrong).toBe(0);
    expect(again.body.stats.players).toBe(1);

    // keeper7: 3 borrows = 1.5, one wrong buoy = +5
    as(7);
    const wrong = [
      ...puzzle.rocks.slice(0, 3),
      [...Array(64).keys()].find((c) => !puzzle.rocks.includes(c))!,
    ];
    const r7 = await submit(wrong);
    expect(r7.body.result.scoreHalf).toBe(3 + 10);
    expect(r7.body.result.stars).toBe(0);
    expect(r7.body.result.beatPct).toBe(0);
    expect(r7.body.result.buoyHeat[String(puzzle.rocks[0])]).toBe(2);

    // init after playing restores the result and the run
    as(1);
    const back = await init();
    expect(back.result?.rocks).toEqual(puzzle.rocks);
    expect(back.run.shots.map((s) => s.port)).toEqual([5, 10, 11, 12, 13]);

    // next day: results comment credits the brightest keeper
    const prevPost = todaysPost();
    setDay(MONDAY + 2);
    await rollover();
    expect(prevPost.stickied).toBe(false);
    const res = comments.find(
      (c) => c.postId === prevPost.id && c.body.includes('fog lifted')
    );
    expect(res?.body).toContain('u/keeper1');
    as(1);
    const d3 = await init();
    expect(d3.number).toBe(2);
    expect(d3.recap).toMatchObject({
      players: 2,
      perfect: 1,
      brightest: { name: 'keeper1', guided: 6 },
    });
    expect(d3.me?.guided).toBe(6);
  }, 60_000);

  it('logged-out and archive play is practice: stateless and unranked', async () => {
    setDay(MONDAY + 1);
    await rollover();
    const puzzle = (await getPuzzle(MONDAY + 1))!;
    usePost();
    as(null);
    const f = await fire(3);
    expect(f.status).toBe(200);
    expect(f.body.shot.outcome).toBe(trace(3, puzzle.rocks));
    expect((await borrow(3)).status).toBe(409);
    const r = await submit(puzzle.rocks, [{ port: 3, borrowed: false }]);
    expect(r.body.result.ranked).toBe(false);
    expect(r.body.result.scoreHalf).toBe(2);
    expect(r.body.stats.players).toBe(0);

    const old = todaysPost();
    setDay(MONDAY + 2);
    await rollover();
    usePost(old);
    as(9);
    const a = await app.request('/api/init');
    const ab = (await a.json()) as InitResponse;
    expect(ab.isToday).toBe(false);
    const af = await fire(7);
    expect(af.body.lamp.by).toBeNull();
    expect(
      (await submit(puzzle.rocks, [{ port: 7, borrowed: false }])).body.result
        .ranked
    ).toBe(false);
  }, 60_000);

  it('rejects malformed requests', async () => {
    setDay(MONDAY + 1);
    await rollover();
    usePost();
    as(1);
    expect((await fire(99)).status).toBe(409);
    expect((await post('fire', { port: 'x' })).status).toBe(409);
    expect((await submit([1, 1, 2, 3])).status).toBe(409);
    expect((await submit([1, 2, 3])).status).toBe(409);
    expect((await submit([1, 2, 3, 4])).status).toBe(409); // no lamps lit yet
  }, 30_000);
});

describe('beam log', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    resetFake();
  });
  afterEach(() => vi.useRealTimers());

  it('grades every beam and reveals the expert line only after charting', async () => {
    setDay(MONDAY + 1);
    await rollover();
    const puzzle = (await getPuzzle(MONDAY + 1))!;
    usePost();
    as(1);
    const before = await init();
    expect(JSON.stringify(before)).not.toContain('line');
    for (const p of [0, 9, 17]) await fire(p);
    const r = await submit(puzzle.rocks);
    const notes = r.body.result.notes;
    expect(notes).toHaveLength(3);
    expect(notes[0]!.before).toBe(635376);
    expect(notes[1]!.before).toBe(notes[0]!.after);
    expect(notes.every((n) => n.skill >= 0 && n.skill <= 100)).toBe(true);
    expect(r.body.result.expertLine.length).toBe(puzzle.par);
  }, 30_000);
});
