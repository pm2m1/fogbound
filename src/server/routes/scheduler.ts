import { Hono } from 'hono';
import { todayIndex } from '../../shared/day';
import { ensureDailyPost, ensurePuzzle } from '../core/rollover';

export const scheduler = new Hono();

/** Runs at 00:00 and 00:10 UTC; the second run is a no-op unless the first failed. */
scheduler.post('/daily-rollover', async (c) => {
  const day = todayIndex();
  try {
    const postId = await ensureDailyPost(day);
    // pre-build tomorrow's town record is not possible (it depends on today's walkers),
    // but warming the puzzle cache for today keeps the first /init fast.
    await ensurePuzzle(day);
    console.log(`rollover ok day=${day} post=${postId}`);
  } catch (e) {
    console.error(`rollover failed day=${day}`, e);
  }
  return c.json({}, 200);
});
