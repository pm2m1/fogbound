import { N, PORTS } from '../../shared/beam';

/** The board is a 10×10 grid of units: a ring of lamps around 8×8 water. */
export const UNITS = N + 2;

export const lampXY = (port: number): [number, number] => {
  const side = Math.floor(port / N);
  const k = port % N;
  if (side === 0) return [k + 1, 0];
  if (side === 1) return [N + 1, k + 1];
  if (side === 2) return [k + 1, N + 1];
  return [0, k + 1];
};

export const cellXY = (cell: number): [number, number] => [
  (cell % N) + 1,
  Math.floor(cell / N) + 1,
];

/** Beam path point (row, col; may be outside) → board units. */
export const pointXY = ([r, c]: [number, number]): [number, number] => [
  c + 1.5,
  r + 1.5,
];

const SIDES = ['north', 'east', 'south', 'west'] as const;
export const lampName = (port: number): string => {
  const side = SIDES[Math.floor(port / N)]!;
  return `${side} lamp ${(port % N) + 1}`;
};

export const ALL_PORTS = Array.from({ length: PORTS }, (_, p) => p);

/** Landed beams share a colour AND a number so pairs never rely on colour alone. */
export const PAIR_COLORS = [
  '#ffbf5e',
  '#6fd3ff',
  '#ff86b0',
  '#a6e36b',
  '#c9a2ff',
  '#ffe066',
  '#55e0c6',
  '#ff9f6b',
];

export const lampShort = (port: number): string =>
  `${'NESW'[Math.floor(port / N)]!}${(port % N) + 1}`;

export const fmtCount = (n: number): string =>
  n >= 100_000
    ? `${Math.round(n / 1000)}k`
    : n >= 10_000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toLocaleString('en-US');
