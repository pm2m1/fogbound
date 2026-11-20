import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { todayIndex } from '../../shared/day';
import { ensureDailyPost } from '../core/rollover';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const postId = await ensureDailyPost(todayIndex());
    return c.json<TriggerResponse>(
      { status: 'success', message: `daily post ${postId}` },
      200
    );
  } catch (error) {
    console.error('install post failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create post' },
      400
    );
  }
});
