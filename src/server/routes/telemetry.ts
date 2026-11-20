import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';

/**
 * Devvit Journeys, mounted at /api/telemetry to match the default client
 * (`@devvit/analytics/client/reddit`). Ported from the package's express router.
 */
export const telemetryRoutes = new Hono();

const unspecified = { status: 'JOURNEY_RECEIPT_UNSPECIFIED', message: '' };

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v : undefined;

const body = async (c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> => {
  const b: unknown = await c.req.json().catch(() => ({}));
  return typeof b === 'object' && b !== null
    ? Object.fromEntries(Object.entries(b))
    : {};
};

telemetryRoutes.post('/journey/start', async (c) => {
  try {
    return c.json(await telemetry.startJourney());
  } catch (e) {
    console.error('journey start', e);
    return c.json({ journeyId: '', receipt: unspecified });
  }
});

telemetryRoutes.post('/journey/progress', async (c) => {
  const b = await body(c);
  const journeyId = str(b.journeyId);
  const progress =
    typeof b.progress === 'number' ? Math.min(1, Math.max(0, b.progress)) : 0;
  if (!journeyId)
    return c.json({ error: 'journeyId required', receipt: unspecified }, 400);
  try {
    return c.json(
      await telemetry.journeyProgress({
        journeyId,
        progress,
        action: str(b.action) ?? '',
        actionDetails: str(b.actionDetails) ?? '',
      })
    );
  } catch (e) {
    console.error('journey progress', e);
    return c.json({ receipt: unspecified });
  }
});

telemetryRoutes.post('/journey/interaction', async (c) => {
  const b = await body(c);
  const action = str(b.action);
  if (!action)
    return c.json({ error: 'action required', receipt: unspecified }, 400);
  try {
    return c.json(
      await telemetry.journeyInteraction({
        journeyId: str(b.journeyId) ?? '',
        action,
        actionDetails: str(b.actionDetails) ?? '',
      })
    );
  } catch (e) {
    console.error('journey interaction', e);
    return c.json({ receipt: unspecified });
  }
});

telemetryRoutes.post('/journey/end', async (c) => {
  const b = await body(c);
  const journeyId = str(b.journeyId);
  if (!journeyId)
    return c.json({ error: 'journeyId required', receipt: unspecified }, 400);
  const g =
    typeof b.game === 'object' && b.game !== null
      ? Object.fromEntries(Object.entries(b.game))
      : null;
  try {
    return c.json(
      await telemetry.endJourney({
        journeyId,
        complete: b.complete === true,
        ...(g
          ? {
              game: {
                win: g.win === true,
                score: typeof g.score === 'number' ? g.score : 0,
              },
            }
          : {}),
      })
    );
  } catch (e) {
    console.error('journey end', e);
    return c.json({ receipt: unspecified });
  }
});

telemetryRoutes.post('/journey/app-ready', async (c) => {
  try {
    return c.json(await telemetry.appReady());
  } catch (e) {
    console.error('app ready', e);
    return c.json({ receipt: unspecified });
  }
});
