import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { todayIndex } from '../../shared/day';
import { ensureDailyPost } from '../core/rollover';

export const menu = new Hono();

/** Mod fallback if the scheduler ever misses: idempotent. */
menu.post('/post-today', async (c) => {
  try {
    const postId = await ensureDailyPost(todayIndex());
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${postId.replace('t3_', '')}`,
      },
      200
    );
  } catch (error) {
    console.error('post-today failed', error);
    return c.json<UiResponse>(
      { showToast: 'Could not create today’s fog' },
      400
    );
  }
});
