import {
  navigateTo,
  requestExpandedMode,
  showLoginPrompt,
  showToast,
  context,
} from '@devvit/web/client';
import { telemetry } from '@devvit/analytics/client/reddit';

/** True when running inside Reddit (vs the local preview harness). */
export const onReddit = (): boolean =>
  typeof globalThis === 'object' && 'devvit' in globalThis && Boolean(context);

const safe = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    console.warn('platform call failed', e);
  }
};

export const toast = (text: string) =>
  safe(() => (onReddit() ? showToast(text) : console.info('[toast]', text)));

export const expand = (e: MouseEvent) =>
  safe(() => requestExpandedMode(e, 'game'));

export const goTo = (url: string) => safe(() => navigateTo(url));

export const askLogin = () => safe(() => showLoginPrompt());

export const subredditName = (): string | undefined => {
  try {
    return context?.subredditName;
  } catch {
    return undefined;
  }
};

/* ---------------- Devvit Journeys ----------------
 * Start = first committed step (never a view). Progress = errands reached.
 * End = submitted walk. All calls are fire-and-forget and never block play.
 */

let journeyId: string | null = null;

const fire = (p: () => Promise<unknown>) => {
  if (!onReddit()) return;
  p().catch(() => undefined);
};

export const journey = {
  ready: () => fire(() => telemetry.appReady()),
  start: () => {
    if (journeyId || !onReddit()) return;
    journeyId = 'pending';
    telemetry
      .startJourney()
      .then((r) => {
        journeyId = r.journeyId || null;
      })
      .catch(() => {
        journeyId = null;
      });
  },
  progress: (progress: number, action: string) =>
    fire(async () => {
      if (journeyId && journeyId !== 'pending')
        await telemetry.progress({ progress, action });
    }),
  interaction: (action: string, actionDetails?: string) =>
    fire(() =>
      telemetry.interaction(
        actionDetails ? { action, actionDetails } : { action }
      )
    ),
  end: (win: boolean, score: number) =>
    fire(async () => {
      if (journeyId && journeyId !== 'pending') {
        await telemetry.endJourney({ complete: true, game: { win, score } });
      }
      journeyId = null;
    }),
};
