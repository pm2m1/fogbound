import { fmtHalf } from './puzzle';

/** Spoiler-free result comment. Never contains rock positions or lamp outcomes. */
export const buildShareText = (o: {
  number: number;
  scoreHalf: number;
  par: number;
  stars: 0 | 1 | 2 | 3;
  fired: number;
  borrowed: number;
  wrong: number;
  guided: number;
  streak: number;
  /** charts left after the last beam, if known */
  chartsLeft?: number;
}): string => {
  const head =
    o.stars === 0
      ? '🌊 shipwrecked'
      : '★'.repeat(o.stars) + '☆'.repeat(3 - o.stars);
  const beams = '🔦'.repeat(o.fired) + '🪔'.repeat(o.borrowed);
  const lines = [
    `**Fogbound #${o.number}** ${head}`,
    '',
    `${beams}  ${fmtHalf(o.scoreHalf)} (par ${o.par})${o.wrong ? ` · ${o.wrong} buoy${o.wrong > 1 ? 's' : ''} on open water` : ''}`,
  ];
  const tail: string[] = [];
  if (o.chartsLeft !== undefined)
    tail.push(
      o.chartsLeft === 1
        ? '🌫 fog fully read'
        : `🌫 charted with ${o.chartsLeft} layouts still possible`
    );
  if (o.guided > 0)
    tail.push(`my lamps guided ${o.guided} player${o.guided > 1 ? 's' : ''}`);
  if (o.streak > 1) tail.push(`🔥 ${o.streak}-day streak`);
  if (tail.length) lines.push('', tail.join(' · '));
  return lines.join('\n');
};
