/**
 * Daily puzzle generation and scoring rules for Fogbound.
 * All costs are kept in HALF-points so nothing is ever a float.
 */
import {
  buildSpace,
  CELLS,
  configRocks,
  isUnique,
  PORTS,
  solve,
  trace,
  type Outcome,
} from './beam';
import { weekdayOf } from './day';
import { makeRng } from './rng';

/** Firing your own lamp. */
export const FIRE_HALF = 2;
/** Borrowing a beam another keeper lit. */
export const BORROW_HALF = 1;
/** Each buoy that marks open water instead of a rock. */
export const WRONG_HALF = 10;
/** Borrowed beams allowed per keeper per day. */
export const BORROW_CAP = 3;
/** Borrows a freshly lit lamp can serve before it burns out. */
export const FUEL = 3;

export type Puzzle = {
  day: number;
  /** rocks hidden today */
  k: number;
  /** SECRET — never sent to a client before they finish */
  rocks: number[];
  /** beams an expert keeper needs (greedy solver) */
  par: number;
  /** SECRET — the expert's lamps, revealed in the beam log */
  line?: number[];
};

export type PublicPuzzle = Omit<Puzzle, 'rocks'>;

export const publicPuzzle = (p: Puzzle): PublicPuzzle => ({
  day: p.day,
  k: p.k,
  par: p.par,
});

/** Monday is gentle (3 rocks); the rest of the week hides 4. */
export const rocksForDay = (day: number): number =>
  weekdayOf(day) === 0 ? 3 : 4;

const PAR_BAND: Record<number, [number, number]> = { 3: [4, 7], 4: [5, 9] };

/**
 * Deterministic for (salt, day). The salt lives in Redis so the open-source code
 * can't be used to precompute tomorrow's rocks.
 */
export const generatePuzzle = (day: number, salt: string): Puzzle => {
  const k = rocksForDay(day);
  const space = buildSpace(k);
  const rng = makeRng(`fogbound:${salt}:${day}`);
  const [lo, hi] = PAR_BAND[k] ?? [5, 9];
  let fallback: Puzzle | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const rocks = configRocks(space, rng.int(0, space.count - 1));
    if (!isUnique(space, rocks)) continue;
    const line = solve(space, rocks).fired;
    const par = line.length;
    const candidate = { day, k, rocks, par, line };
    if (par >= lo && par <= hi) return candidate;
    fallback ??= candidate;
  }
  if (fallback) return fallback;
  throw new Error(`no puzzle for day ${day}`);
};

export type Shot = {
  port: number;
  outcome: Outcome;
  /** true if borrowed from another keeper's lamp */
  borrowed: boolean;
};

export const shotCostHalf = (s: Pick<Shot, 'borrowed'>): number =>
  s.borrowed ? BORROW_HALF : FIRE_HALF;

export const scoreHalf = (
  shots: readonly Pick<Shot, 'borrowed'>[],
  wrong: number
): number =>
  shots.reduce((a, s) => a + shotCostHalf(s), 0) + WRONG_HALF * wrong;

export const countWrong = (
  rocks: readonly number[],
  buoys: readonly number[]
): number => buoys.filter((b) => !rocks.includes(b)).length;

/** 3 = charted every rock at or under par · 2 = within 3 of par · 1 = every rock · 0 = shipwreck */
export const starsFor = (
  wrong: number,
  beamsHalf: number,
  par: number
): 0 | 1 | 2 | 3 => {
  if (wrong > 0) return 0;
  if (beamsHalf <= par * 2) return 3;
  if (beamsHalf <= (par + 3) * 2) return 2;
  return 1;
};

/** "6", "6½" */
export const fmtHalf = (h: number): string => {
  const whole = Math.floor(h / 2);
  return h % 2 ? `${whole}½` : `${whole}`;
};

export const validBuoys = (buoys: unknown, k: number): buoys is number[] =>
  Array.isArray(buoys) &&
  buoys.length === k &&
  buoys.every((b) => Number.isInteger(b) && b >= 0 && b < CELLS) &&
  new Set(buoys).size === k;

export const validPort = (p: unknown): p is number =>
  Number.isInteger(p) && (p as number) >= 0 && (p as number) < PORTS;

export const resolveShot = (puzzle: Puzzle, port: number): Outcome =>
  trace(port, puzzle.rocks);
