import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FogMeter,
  LOST,
  RETURNED,
  analyzeShots,
  buildSpace,
  configRocks,
  explains,
  filterRows,
  isUnique,
  makeFastTracer,
  solve,
  trace,
  tracePath,
} from './beam';
import {
  generatePuzzle,
  starsFor,
  scoreHalf,
  fmtHalf,
  validBuoys,
} from './puzzle';
import { makeRng } from './rng';

const rc = (r: number, c: number) => r * 8 + c;

describe('beam optics', () => {
  it('hits, bends and returns like Black Box', () => {
    const rock = [rc(3, 3)];
    assert.equal(trace(3, rock), LOST); // straight down column 3
    assert.equal(trace(2, rock), 3 * 8 + 2); // bends left, leaves left side at row 2
    assert.equal(trace(4, rock), 8 + 2); // bends right, leaves right side at row 2
    assert.equal(trace(2, [rc(0, 3)]), RETURNED); // rock diagonal to the lamp
    assert.equal(trace(3, [rc(3, 2), rc(3, 4)]), RETURNED); // squeezed between two
    assert.equal(trace(5, []), 2 * 8 + 5); // open water: straight across
  });

  it('is reversible and the fast tracer matches the reference', () => {
    const ft = makeFastTracer();
    const rng = makeRng(1);
    for (let t = 0; t < 3000; t++) {
      const rocks = rng.shuffle([...Array(64).keys()]).slice(0, rng.int(1, 6));
      const g = ft.pad(rocks);
      for (let p = 0; p < 32; p++) {
        const o = trace(p, rocks);
        assert.equal(ft.fire(p, g), o);
        if (o >= 0) assert.equal(trace(o, rocks), p);
      }
    }
  });

  it('records a drawable path that ends where the outcome says', () => {
    const t = tracePath(2, [rc(3, 3)]);
    assert.deepEqual(t.path.at(-1), [2, -1]);
  });
});

describe('daily puzzles', () => {
  it('are deterministic per salt, unique, and in the par band', () => {
    const a = generatePuzzle(20420, 'salt');
    const b = generatePuzzle(20420, 'salt');
    const c = generatePuzzle(20420, 'other');
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.rocks, c.rocks);
    assert.ok(isUnique(buildSpace(a.k), a.rocks));
    assert.equal(solve(buildSpace(a.k), a.rocks).fired.length, a.par);
  });

  it('scores in half points', () => {
    assert.equal(
      scoreHalf([{ borrowed: false }, { borrowed: true }], 1),
      2 + 1 + 10
    );
    assert.equal(fmtHalf(13), '6½');
    assert.equal(starsFor(0, 12, 6), 3);
    assert.equal(starsFor(0, 18, 6), 2);
    assert.equal(starsFor(0, 30, 6), 1);
    assert.equal(starsFor(1, 4, 6), 0);
    assert.ok(validBuoys([1, 2, 3, 4], 4));
    assert.ok(!validBuoys([1, 1, 3, 4], 4));
    assert.ok(!validBuoys([1, 2, 3, 64], 4));
  });
});

describe('fog meter, theory check, beam log', () => {
  it('meter matches the full signature matrix, incrementally and from scratch', async () => {
    const s = buildSpace(3);
    const rocks = configRocks(s, 4242);
    const meter = new FogMeter(3);
    const obs: { port: number; outcome: number }[] = [];
    let rows: Int32Array | null = null;
    for (const p of [2, 11, 19, 30, 6]) {
      const o = trace(p, rocks);
      obs.push({ port: p, outcome: o });
      rows = filterRows(s, rows, p, o);
      assert.equal(await meter.count(obs), rows.length);
    }
    assert.equal(await new FogMeter(3).count(obs), rows!.length);
    // a different history invalidates the cache
    assert.equal(
      await meter.count(obs.slice(0, 1)),
      filterRows(s, null, obs[0]!.port, obs[0]!.outcome).length
    );
  });

  it('theory check never needs the real rocks', () => {
    const rocks = [10, 27, 44];
    for (let p = 0; p < 32; p++) {
      const obs = { port: p, outcome: trace(p, rocks) };
      assert.ok(explains(rocks, obs));
    }
    assert.ok(
      !explains([0, 1, 2], { port: 3, outcome: trace(3, rocks) }) ||
        trace(3, [0, 1, 2]) === trace(3, rocks)
    );
  });

  it('beam log chains counts and rewards the expert lamp', () => {
    const s = buildSpace(3);
    const rocks = configRocks(s, 999);
    const line = solve(s, rocks).fired;
    const notes = analyzeShots(
      s,
      line.map((p) => ({ port: p, outcome: trace(p, rocks), borrowed: false }))
    );
    assert.equal(notes[0]!.before, s.count);
    for (let i = 1; i < notes.length; i++)
      assert.equal(notes[i]!.before, notes[i - 1]!.after);
    assert.equal(notes.at(-1)!.after, 1);
    assert.ok(notes.every((n) => n.skill === 100));
  });
});

describe('fog clearing', () => {
  it('burns off exactly the cells no surviving layout can hold', async () => {
    const meter = new FogMeter(1);
    assert.equal(meter.clearCells(), null);
    const rock = [42];
    const o1 = { port: 2, outcome: trace(2, rock) };
    assert.equal(await meter.count([o1]), 8); // anywhere down column 3
    const c1 = meter.clearCells()!;
    assert.equal(
      c1.reduce((a, b) => a + b, 0),
      56
    );
    assert.equal(c1[42], 0);
    const o2 = { port: 29, outcome: trace(29, rock) };
    assert.equal(await meter.count([o1, o2]), 1);
    const c2 = meter.clearCells()!;
    assert.equal(
      c2.reduce((a, b) => a + b, 0),
      63
    );
    assert.equal(c2[42], 0);
  });
});
