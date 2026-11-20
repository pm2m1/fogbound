/** Deterministic, seedable RNG so server, client and tests all agree. */

export const hashString = (s: string): number => {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export type Rng = {
  next: () => number;
  int: (minInclusive: number, maxInclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (p: number) => boolean;
  shuffle: <T>(items: readonly T[]) => T[];
};

export const makeRng = (seed: number | string): Rng => {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = (): number => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number): number =>
    lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error('pick from empty list');
    return item;
  };
  const chance = (p: number): boolean => next() < p;
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp;
    }
    return out;
  };
  return { next, int, pick, chance, shuffle };
};
