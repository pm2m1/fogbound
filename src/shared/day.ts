/**
 * Time model. A "day" is a UTC calendar day index (days since 1970-01-01).
 * A "week" (one town) starts on Monday UTC.
 * Day 0 (1970-01-01) was a Thursday.
 */

export const MS_PER_DAY = 86_400_000;

export const dayIndexOf = (ms: number): number => Math.floor(ms / MS_PER_DAY);

export const todayIndex = (): number => dayIndexOf(Date.now());

/** 0 = Monday ... 6 = Sunday */
export const weekdayOf = (day: number): number => (((day + 3) % 7) + 7) % 7;

export const weekOf = (day: number): number => Math.floor((day - 4) / 7);

export const firstDayOfWeek = (week: number): number => week * 7 + 4;

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const shortDateLabel = (day: number): string => {
  const d = new Date(day * MS_PER_DAY);
  const wd = WEEKDAY_NAMES[weekdayOf(day)]!.slice(0, 3);
  return `${wd} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!}`;
};

export const msUntilNextDay = (nowMs: number): number =>
  (dayIndexOf(nowMs) + 1) * MS_PER_DAY - nowMs;

export const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};
