/**
 * Economy simulation: do early and late keepers face a real trade-off?
 * Bots arrive in order through the day. Each bot fires lamps (cost 1) or borrows
 * beams other keepers already lit (cost BORROW, at most CAP), then marks rocks
 * once few enough placements remain. Borrowing a lamp credits whoever lit it first.
 *
 *   npx tsx scripts/sim.ts [borrowCost] [cap] [bots] [days]
 */
import {
  buildSpace,
  configRocks,
  expectedRemaining,
  filterRows,
  isUnique,
  makeFastTracer,
} from '../src/shared/beam';
import { makeRng } from '../src/shared/rng';

const BORROW = Number(process.argv[2] ?? 0.5);
const CAP = Number(process.argv[3] ?? 3);
const BOTS = Number(process.argv[4] ?? 60);
const DAYS = Number(process.argv[5] ?? 6);
const WRONG = 5;
const FUEL = Number(process.argv[6] ?? 0); // 0 = lamps never burn out

const s = buildSpace(4);
const ft = makeFastTracer();
const rng = makeRng(`sim-${BORROW}-${CAP}`);

type Bot = {
  cost: number;
  wrong: number;
  fired: number;
  borrowed: number;
  credit: number;
};

const runDay = (day: number): Bot[] => {
  let rocks: number[];
  do rocks = configRocks(s, rng.int(0, s.count - 1));
  while (!isUnique(s, rocks));
  const grid = ft.pad(rocks);
  const firstLit = new Map<number, number>(); // port -> keeper who lit it last
  const fuel = new Map<number, number>();
  const bots: Bot[] = [];
  for (let b = 0; b < BOTS; b++) {
    const skill = rng.next(); // 0 = sloppy, 1 = sharp
    const guessAt = 1 + Math.floor((1 - skill) * 6); // sloppy bots guess earlier
    const greed = rng.next(); // how keen to borrow
    let rows: Int32Array | null = null;
    const used = new Set<number>();
    const me: Bot = { cost: 0, wrong: 0, fired: 0, borrowed: 0, credit: 0 };
    let borrows = 0;
    while ((rows ? rows.length : s.count) > guessAt && used.size < 32) {
      const n = rows ? rows.length : s.count;
      // score every option by information per point spent, with skill noise
      let best = -1;
      let bestVal = -Infinity;
      let bestIsBorrow = false;
      for (let p = 0; p < 32; p++) {
        if (used.has(p)) continue;
        const info =
          Math.log2(n) - Math.log2(Math.max(1, expectedRemaining(s, rows, p)));
        const noise = (1 - skill) * rng.next() * 1.5;
        const canBorrow =
          borrows < CAP &&
          firstLit.has(p) &&
          firstLit.get(p) !== b &&
          (FUEL === 0 || (fuel.get(p) ?? 0) > 0);
        const own = info + noise;
        if (own > bestVal) {
          bestVal = own;
          best = p;
          bestIsBorrow = false;
        }
        if (canBorrow) {
          const v = ((info + noise) / BORROW) * (0.6 + 0.4 * greed);
          if (v > bestVal) {
            bestVal = v;
            best = p;
            bestIsBorrow = true;
          }
        }
      }
      if (best < 0) break;
      used.add(best);
      if (bestIsBorrow) {
        borrows++;
        me.borrowed++;
        me.cost += BORROW;
        const owner = firstLit.get(best)!;
        bots[owner]!.credit++;
        if (FUEL) fuel.set(best, (fuel.get(best) ?? 0) - 1);
      } else {
        me.fired++;
        me.cost += 1;
        if (FUEL) {
          firstLit.set(best, b);
          fuel.set(best, FUEL);
        } else if (!firstLit.has(best)) firstLit.set(best, b);
      }
      rows = filterRows(s, rows, best, ft.fire(best, grid));
    }
    // guess one consistent placement
    const pool = rows ?? Int32Array.from({ length: s.count }, (_, i) => i);
    const guess = configRocks(s, pool[rng.int(0, pool.length - 1)]!);
    me.wrong = guess.filter((c) => !rocks.includes(c)).length;
    bots.push(me);
  }
  void day;
  return bots;
};

const all: Bot[][] = [];
for (let d = 0; d < DAYS; d++) all.push(runDay(d));

const bands = 5;
console.log(
  `borrow=${BORROW} cap=${CAP} bots=${BOTS} days=${DAYS} fuel=${FUEL || 'inf'}`
);
console.log('arrival   score  beams  borrowed  wrong  credit');
for (let k = 0; k < bands; k++) {
  const lo = Math.floor((k * BOTS) / bands);
  const hi = Math.floor(((k + 1) * BOTS) / bands);
  const rows = all.flatMap((day) => day.slice(lo, hi));
  const avg = (f: (b: Bot) => number) =>
    (rows.reduce((a, b) => a + f(b), 0) / rows.length).toFixed(2);
  console.log(
    `${String(k * 20).padStart(3)}-${String((k + 1) * 20).padEnd(3)}%  ${avg((b) => b.cost + WRONG * b.wrong).padStart(5)}  ${avg((b) => b.fired).padStart(5)}  ${avg((b) => b.borrowed).padStart(8)}  ${avg((b) => b.wrong).padStart(5)}  ${avg((b) => b.credit).padStart(6)}`
  );
}
const credits = all
  .flat()
  .map((b) => b.credit)
  .sort((a, b) => b - a);
console.log(
  'top credit holders:',
  credits.slice(0, 8).join(' '),
  '| share with >0 credit:',
  (credits.filter((c) => c > 0).length / credits.length).toFixed(2)
);
