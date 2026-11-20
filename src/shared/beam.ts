/**
 * Fogbound beam engine — pure, deterministic, shared by server, client and tests.
 *
 * The bay is an N×N grid of water cells; K rocks hide in the fog. Lamps sit on
 * every edge cell (4N "ports"). A beam enters the bay from its lamp and obeys
 * the classic Black Box optics:
 *   - rock directly ahead            → the beam is LOST (absorbed)
 *   - rocks on both forward diagonals → the beam turns back
 *   - one rock on a forward diagonal  → the beam bends 90° away from it
 *   - a rock diagonal to the lamp itself → the beam bounces straight back
 * A beam that leaves through its own lamp is RETURNED; otherwise it LANDS at
 * another lamp.
 *
 * Ports: 0..N-1 top (left→right), N..2N-1 right (top→bottom),
 *        2N..3N-1 bottom (left→right), 3N..4N-1 left (top→bottom).
 */

export const N = 8;
export const PORTS = 4 * N;
export const CELLS = N * N;

/** Outcome codes. Non-negative values are the exit port. */
export const LOST = -1;
export const RETURNED = -2;
export type Outcome = number;

type Vec = { r: number; c: number; dr: number; dc: number };

export const portEntry = (port: number, n = N): Vec => {
  const side = Math.floor(port / n);
  const k = port % n;
  switch (side) {
    case 0:
      return { r: -1, c: k, dr: 1, dc: 0 };
    case 1:
      return { r: k, c: n, dr: 0, dc: -1 };
    case 2:
      return { r: n, c: k, dr: -1, dc: 0 };
    default:
      return { r: k, c: -1, dr: 0, dc: 1 };
  }
};

/** Which port a beam leaves through, given the outside cell it reached. */
const portAt = (r: number, c: number, n: number): number => {
  if (r < 0) return c;
  if (c >= n) return n + r;
  if (r >= n) return 2 * n + c;
  return 3 * n + r;
};

export type Trace = { outcome: Outcome; path: [number, number][] };

/**
 * Trace one beam. `rock(r, c)` answers whether a rock sits at that cell.
 * Returns the outcome and the list of grid points the beam passed through
 * (outside lamp positions included) so the client can animate it.
 */
export const traceWith = (
  port: number,
  rock: (r: number, c: number) => boolean,
  n = N,
  wantPath = false
): Trace => {
  let { r, c, dr, dc } = portEntry(port, n);
  const inside = (y: number, x: number) => y >= 0 && y < n && x >= 0 && x < n;
  const isRock = (y: number, x: number) => inside(y, x) && rock(y, x);
  const path: [number, number][] = wantPath ? [[r, c]] : [];
  let outside = true;
  for (let guard = 0; guard < 8 * n * n; guard++) {
    const ar = r + dr;
    const ac = c + dc;
    if (isRock(ar, ac)) {
      if (wantPath) path.push([ar, ac]);
      return { outcome: LOST, path };
    }
    // perpendicular offsets
    const pr = dc;
    const pc = dr;
    const d1 = isRock(ar + pr, ac + pc);
    const d2 = isRock(ar - pr, ac - pc);
    if (d1 || d2) {
      if (outside) return { outcome: RETURNED, path };
      if (d1 && d2) {
        dr = -dr;
        dc = -dc;
      } else if (d1) {
        dr = -pr;
        dc = -pc;
      } else {
        dr = pr;
        dc = pc;
      }
      continue;
    }
    r = ar;
    c = ac;
    if (wantPath) path.push([r, c]);
    if (!inside(r, c)) {
      const exit = portAt(r, c, n);
      return { outcome: exit === port ? RETURNED : exit, path };
    }
    outside = false;
  }
  return { outcome: LOST, path };
};

export const rockSetFn = (rocks: readonly number[], n = N) => {
  const s = new Set(rocks);
  return (r: number, c: number) => s.has(r * n + c);
};

export const trace = (port: number, rocks: readonly number[], n = N): Outcome =>
  traceWith(port, rockSetFn(rocks, n), n).outcome;

export const tracePath = (
  port: number,
  rocks: readonly number[],
  n = N
): Trace => traceWith(port, rockSetFn(rocks, n), n, true);

export const signature = (rocks: readonly number[], n = N): Outcome[] => {
  const f = rockSetFn(rocks, n);
  const out: Outcome[] = [];
  for (let p = 0; p < 4 * n; p++) out.push(traceWith(p, f, n).outcome);
  return out;
};

/* ------------------------------------------------------------------ */
/* Configuration space                                                 */
/* ------------------------------------------------------------------ */

export type Space = {
  n: number;
  k: number;
  count: number;
  /** k cell indices per config, flattened */
  cells: Uint8Array;
  /** outcome per (config, port), flattened; outcomes stored +2 so they fit Uint8 */
  sig: Uint8Array;
};

const combos = (total: number, k: number): number => {
  let x = 1;
  for (let i = 0; i < k; i++) x = (x * (total - i)) / (i + 1);
  return Math.round(x);
};

const spaceCache = new Map<string, Space>();

/**
 * Fast tracer over a padded grid (border of empty cells, no bounds checks).
 * Semantics identical to traceWith; verified by tests.
 */
export const makeFastTracer = (n = N) => {
  const W = n + 2;
  const inside = new Uint8Array(W * W);
  const portOf = new Int16Array(W * W).fill(-1);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) inside[(r + 1) * W + c + 1] = 1;
  const starts = new Int32Array(4 * n);
  const steps = new Int32Array(4 * n);
  for (let p = 0; p < 4 * n; p++) {
    const v = portEntry(p, n);
    const pos = (v.r + 1) * W + v.c + 1;
    starts[p] = pos;
    steps[p] = v.dr * W + v.dc;
    portOf[pos] = p;
  }
  const perp = (d: number) => (d === 1 || d === -1 ? W : 1);
  /** grid: padded occupancy (1 = rock), length W*W */
  const fire = (port: number, grid: Uint8Array): number => {
    let pos = starts[port]!;
    let d = steps[port]!;
    let outside = true;
    for (let guard = 0; guard < 512; guard++) {
      const a = pos + d;
      if (grid[a] === 1) return LOST;
      const q = perp(d);
      const d1 = grid[a + q] === 1;
      const d2 = grid[a - q] === 1;
      if (d1 || d2) {
        if (outside) return RETURNED;
        if (d1 && d2) d = -d;
        else d = d1 ? -q : q;
        continue;
      }
      pos = a;
      if (inside[pos] === 0) {
        const exit = portOf[pos]!;
        return exit === port ? RETURNED : exit;
      }
      outside = false;
    }
    return LOST;
  };
  const pad = (rocks: ArrayLike<number>): Uint8Array => {
    const g = new Uint8Array(W * W);
    for (let i = 0; i < rocks.length; i++) {
      const cell = rocks[i]!;
      g[(Math.floor(cell / n) + 1) * W + (cell % n) + 1] = 1;
    }
    return g;
  };
  return { W, fire, pad };
};

/** Every placement of k rocks with its full 4n-port signature. ~0.5–1.5 s for 8×8×4. */
export const buildSpace = (k: number, n = N): Space => {
  const key = `${n}:${k}`;
  const hit = spaceCache.get(key);
  if (hit) return hit;
  const total = n * n;
  const ports = 4 * n;
  const count = combos(total, k);
  const cells = new Uint8Array(count * k);
  const sig = new Uint8Array(count * ports);
  const ft = makeFastTracer(n);
  const grid = new Uint8Array(ft.W * ft.W);
  const padIdx = (cell: number) =>
    (Math.floor(cell / n) + 1) * ft.W + (cell % n) + 1;
  const idx = Array.from({ length: k }, (_, i) => i);
  let row = 0;
  for (;;) {
    for (let i = 0; i < k; i++) {
      cells[row * k + i] = idx[i]!;
      grid[padIdx(idx[i]!)] = 1;
    }
    for (let p = 0; p < ports; p++) sig[row * ports + p] = ft.fire(p, grid) + 2;
    for (let i = 0; i < k; i++) grid[padIdx(idx[i]!)] = 0;
    row++;
    // next combination
    let i = k - 1;
    while (i >= 0 && idx[i] === total - k + i) i--;
    if (i < 0) break;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
  const space = { n, k, count, cells, sig };
  spaceCache.set(key, space);
  return space;
};

export const configRocks = (s: Space, row: number): number[] =>
  Array.from(s.cells.subarray(row * s.k, row * s.k + s.k));

export const findRow = (s: Space, rocks: readonly number[]): number => {
  const want = [...rocks].sort((a, b) => a - b);
  for (let row = 0; row < s.count; row++) {
    let ok = true;
    for (let i = 0; i < s.k; i++) {
      if (s.cells[row * s.k + i] !== want[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return row;
  }
  return -1;
};

/** Rows consistent with every observation so far. */
export const filterRows = (
  s: Space,
  rows: Int32Array | null,
  port: number,
  outcome: Outcome
): Int32Array => {
  const P = 4 * s.n;
  const want = outcome + 2;
  const src = rows ?? null;
  const n = src ? src.length : s.count;
  const out = new Int32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const row = src ? src[i]! : i;
    if (s.sig[row * P + port] === want) out[m++] = row;
  }
  return out.slice(0, m);
};

/** Expected remaining candidates after firing `port` (lower is more informative). */
export const expectedRemaining = (
  s: Space,
  rows: Int32Array | null,
  port: number
): number => {
  const P = 4 * s.n;
  const buckets = new Float64Array(P + 2);
  const n = rows ? rows.length : s.count;
  for (let i = 0; i < n; i++) {
    const row = rows ? rows[i]! : i;
    buckets[s.sig[row * P + port]!]!++;
  }
  let sq = 0;
  for (const b of buckets) sq += b * b;
  return n ? sq / n : 0;
};

export const isUnique = (s: Space, rocks: readonly number[]): boolean => {
  const target = signature(rocks, s.n).map((o) => o + 2);
  const P = 4 * s.n;
  let matches = 0;
  for (let row = 0; row < s.count; row++) {
    let same = true;
    for (let p = 0; p < P; p++) {
      if (s.sig[row * P + p] !== target[p]) {
        same = false;
        break;
      }
    }
    if (same && ++matches > 1) return false;
  }
  return matches === 1;
};

export type Obs = { port: number; outcome: Outcome };

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Fog meter: how many k-rock charts are still consistent with the beams seen so far.
 * Works without the 20 MB signature matrix (client-safe): it enumerates placements,
 * tracing only the observed lamps with early exit, and yields to the UI every chunk.
 * Successive calls that only add beams filter the cached survivors instead.
 */
export class FogMeter {
  private readonly ft;
  private cacheObs: Obs[] = [];
  private cache: Uint8Array | null = null; // flattened k-cells of surviving charts
  constructor(
    readonly k: number,
    readonly n = N
  ) {
    this.ft = makeFastTracer(n);
  }

  private consistent(
    grid: Uint8Array,
    obs: readonly Obs[],
    from: number
  ): boolean {
    for (let i = from; i < obs.length; i++)
      if (this.ft.fire(obs[i]!.port, grid) !== obs[i]!.outcome) return false;
    return true;
  }

  async count(obs: readonly Obs[], chunk = 60_000): Promise<number> {
    const { k, n } = this;
    if (obs.length === 0) return combos(n * n, k);
    const extends_ =
      this.cache !== null &&
      this.cacheObs.length <= obs.length &&
      this.cacheObs.every(
        (o, i) => obs[i]!.port === o.port && obs[i]!.outcome === o.outcome
      );
    const W = this.ft.W;
    const grid = new Uint8Array(W * W);
    const padIdx = (cell: number) =>
      (Math.floor(cell / n) + 1) * W + (cell % n) + 1;
    const out: number[] = [];
    let seen = 0;
    const visit = async (cells: ArrayLike<number>, from: number) => {
      for (let i = 0; i < k; i++) grid[padIdx(cells[i]!)] = 1;
      if (this.consistent(grid, obs, from))
        for (let i = 0; i < k; i++) out.push(cells[i]!);
      for (let i = 0; i < k; i++) grid[padIdx(cells[i]!)] = 0;
      if (++seen % chunk === 0) await tick();
    };
    if (extends_ && this.cache) {
      const from = this.cacheObs.length;
      const c = this.cache;
      for (let row = 0; row < c.length / k; row++)
        await visit(c.subarray(row * k, row * k + k), from);
    } else {
      const total = n * n;
      const idx = Array.from({ length: k }, (_, i) => i);
      for (;;) {
        await visit(idx, 0);
        let i = k - 1;
        while (i >= 0 && idx[i] === total - k + i) i--;
        if (i < 0) break;
        idx[i]!++;
        for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
      }
    }
    this.cache = Uint8Array.from(out);
    this.cacheObs = obs.map((o) => ({ ...o }));
    return out.length / k;
  }

  /**
   * Cells proven rock-free: no layout that still fits the beams puts a rock there.
   * Call after count(); null before the first beam.
   */
  clearCells(): Uint8Array | null {
    if (!this.cache || this.cacheObs.length === 0) return null;
    const any = new Uint8Array(this.n * this.n);
    for (const c of this.cache) any[c] = 1;
    return any.map((v) => (v ? 0 : 1));
  }
}

export const totalCharts = (k: number, n = N): number => combos(n * n, k);

export type BeamNote = {
  port: number;
  outcome: Outcome;
  borrowed: boolean;
  /** charts consistent before / after this beam */
  before: number;
  after: number;
  /** the expert's lamp at this moment, and expected charts left after it */
  bestPort: number;
  bestExpected: number;
  myExpected: number;
  /** 0..100 — how close this lamp came to the expert's information */
  skill: number;
};

/** WordleBot for the fog: grade every beam against the most informative lamp available. */
export const analyzeShots = (
  s: Space,
  shots: readonly { port: number; outcome: Outcome; borrowed: boolean }[]
): BeamNote[] => {
  let rows: Int32Array | null = null;
  const used = new Set<number>();
  const notes: BeamNote[] = [];
  for (const shot of shots) {
    const before = rows ? rows.length : s.count;
    let bestPort = shot.port;
    let bestExpected = Infinity;
    for (let p = 0; p < 4 * s.n; p++) {
      if (used.has(p)) continue;
      const e = expectedRemaining(s, rows, p);
      if (e < bestExpected - 1e-9) {
        bestExpected = e;
        bestPort = p;
      }
    }
    const myExpected = expectedRemaining(s, rows, shot.port);
    let skill = 0;
    if (before > 1) {
      const gainBest = Math.log2(before) - Math.log2(Math.max(1, bestExpected));
      const gainMine = Math.log2(before) - Math.log2(Math.max(1, myExpected));
      skill =
        gainBest <= 0
          ? 0
          : Math.round(Math.max(0, Math.min(100, (100 * gainMine) / gainBest)));
    }
    rows = filterRows(s, rows, shot.port, shot.outcome);
    used.add(shot.port);
    notes.push({
      port: shot.port,
      outcome: shot.outcome,
      borrowed: shot.borrowed,
      before,
      after: rows.length,
      bestPort,
      bestExpected: Math.round(bestExpected * 10) / 10,
      myExpected: Math.round(myExpected * 10) / 10,
      skill,
    });
  }
  return notes;
};

/** Does a hypothesised chart explain a beam? (theory check — never uses the real rocks) */
export const explains = (buoys: readonly number[], obs: Obs, n = N): boolean =>
  trace(obs.port, buoys, n) === obs.outcome;

/**
 * Par: beams an expert keeper needs. A greedy solver fires the most informative
 * lamp each turn until only one placement fits the evidence.
 */
export const solve = (
  s: Space,
  rocks: readonly number[],
  known: readonly { port: number; outcome: Outcome }[] = []
): { fired: number[]; remaining: number } => {
  let rows: Int32Array | null = null;
  const used = new Set<number>();
  for (const k of known) {
    rows = filterRows(s, rows, k.port, k.outcome);
    used.add(k.port);
  }
  const f = rockSetFn(rocks, s.n);
  const fired: number[] = [];
  while ((rows ? rows.length : s.count) > 1 && used.size < 4 * s.n) {
    let best = -1;
    let bestScore = Infinity;
    for (let p = 0; p < 4 * s.n; p++) {
      if (used.has(p)) continue;
      const e = expectedRemaining(s, rows, p);
      if (e < bestScore - 1e-9) {
        bestScore = e;
        best = p;
      }
    }
    if (best < 0) break;
    used.add(best);
    fired.push(best);
    rows = filterRows(s, rows, best, traceWith(best, f, s.n).outcome);
  }
  return { fired, remaining: rows ? rows.length : s.count };
};
