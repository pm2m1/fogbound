import { context, reddit, redis } from '@devvit/web/server';
import { isT3 } from '@devvit/web/shared';
import type { Recap } from '../../shared/api';
import { WEEKDAY_NAMES, shortDateLabel, weekdayOf } from '../../shared/day';
import {
  BORROW_CAP,
  FUEL,
  generatePuzzle,
  type Puzzle,
} from '../../shared/puzzle';
import { K } from './keys';
import {
  brightestKeeper,
  expireDayKey,
  getPuzzle,
  getRecap,
  getStats,
  puzzleNumber,
} from './store';

const randomSalt = (): string =>
  Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff).toString(36)
  ).join('');

/** Secret per-installation salt so tomorrow's rocks can't be computed from the source. */
export const getSalt = async (): Promise<string> => {
  const existing = await redis.get(K.salt);
  if (existing) return existing;
  await redis.set(K.salt, randomSalt(), { nx: true });
  return (await redis.get(K.salt)) ?? 'fogbound';
};

/** Idempotent: build (or return) the puzzle for `day`. Never posts. */
export const ensurePuzzle = async (day: number): Promise<Puzzle> => {
  const existing = await getPuzzle(day);
  if (existing) return existing;

  const got = await redis.set(K.lock(day), '1', {
    nx: true,
    expiration: new Date(Date.now() + 60_000),
  });
  if (!got) {
    for (let k = 0; k < 40; k++) {
      await new Promise((r) => setTimeout(r, 250));
      const p = await getPuzzle(day);
      if (p) return p;
    }
  }

  await redis.set(K.startDay, String(day), { nx: true });
  const puzzle = generatePuzzle(day, await getSalt());
  await redis.set(K.puzzle(day), JSON.stringify(puzzle));

  const [stats, brightest] = await Promise.all([
    getStats(day - 1),
    brightestKeeper(day - 1),
  ]);
  const recap: Recap = {
    fromDay: day - 1,
    players: stats.players,
    perfect: stats.perfect,
    brightest,
  };
  await redis.set(K.recap(day), JSON.stringify(recap));
  await expireDayKey(K.recap(day), day);
  return puzzle;
};

const howToPlay = (p: Puzzle): string =>
  [
    `**How to play — ${p.k} rocks are hidden in the fog. Find them using as few beams as you can.**`,
    '',
    '1. Tap a lamp on the shore, then **Fire**. A beam goes straight in.',
    '2. Read what the lamp shows:',
    '    - **✕** — the beam hit a rock. Usually the rock is on that straight line (unless the beam bent first).',
    '    - **Matching numbers** (1 and 1) — it went in at one and came out at the other. A rock just ahead and to one side turned it 90° away.',
    '    - **↺** — it came straight back (squeezed between two rocks, or a rock right next to the shore).',
    '3. The fog burns off every square your beams prove is empty. The rocks hide in the fog that is left.',
    `4. Tap the water to drop ${p.k} buoys where the rocks are, then **Chart the fog**.`,
    '',
    '**Easiest trick:** fire a top lamp and a side lamp. If both show ✕, check the square where the two lines cross.',
    '',
    `Each beam costs **1**; borrowing a lamp another player already lit costs **½** (up to ${BORROW_CAP} a day, each lamp lights ${FUEL} borrows) and they get the credit. Each wrong buoy costs **5**. Par is **${p.par}**.`,
    '',
    'New? Tap **?** in the game for the 1-minute lesson, or **Practice** for unlimited free fogs. Please no rock coordinates in comments.',
  ].join('\n');

/** Idempotent: today's post exists, is pinned, and yesterday's gets its results. */
export const ensureDailyPost = async (day: number): Promise<string> => {
  const puzzle = await ensurePuzzle(day);
  const existing = await redis.get(K.dayPost(day));
  if (existing) return existing;

  const n = await puzzleNumber(day);
  const title = `Fogbound #${n} · ${WEEKDAY_NAMES[weekdayOf(day)]}: ${puzzle.k} rocks in the fog`;
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title,
    postData: { day },
    textFallback: {
      text: `Fogbound #${n} (${shortDateLabel(day)}). Light lamps, read the beams, chart the hidden rocks. Open this post in the Reddit app or on new Reddit to play.`,
    },
  });
  const claimed = await redis.set(K.dayPost(day), post.id, { nx: true });
  if (!claimed) return (await redis.get(K.dayPost(day))) ?? post.id;
  await redis.set(K.postDay(post.id), String(day));

  try {
    const c = await reddit.submitComment({
      id: post.id,
      text: howToPlay(puzzle),
    });
    await c.distinguish(true);
  } catch (e) {
    console.error('pin comment failed', e);
  }

  try {
    const prevPost = await redis.get(K.dayPost(day - 1));
    if (isT3(prevPost)) {
      const prev = await reddit.getPostById(prevPost);
      await prev.unsticky();
      const recap = await getRecap(day);
      if (recap && recap.players > 0) {
        const pct = Math.round(
          (100 * recap.perfect) / Math.max(1, recap.players)
        );
        const bright = recap.brightest
          ? `Brightest lamp: **u/${recap.brightest.name}**, whose beams guided ${recap.brightest.guided} players.`
          : 'Nobody borrowed a beam yesterday — light one early today.';
        await reddit.submitComment({
          id: prevPost,
          text: `**The fog lifted.** ${recap.players} players · ${pct}% found every rock.\n\n${bright}\n\nTonight's fog is rolling in — new post is up.`,
        });
      }
    }
    await post.sticky(1);
  } catch (e) {
    console.error('sticky/results failed', e);
  }
  return post.id;
};
