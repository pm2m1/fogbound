/** Every Redis key in one place. Per-day keys expire after RETAIN_DAYS. */
export const RETAIN_DAYS = 45;

export const K = {
  salt: 'meta:salt',
  startDay: 'meta:startDay',
  puzzle: (day: number) => `puzzle:${day}`,
  recap: (day: number) => `recap:${day}`,
  dayPost: (day: number) => `post:${day}`,
  postDay: (postId: string) => `postday:${postId}`,
  /** per keeper per day: field = port -> "outcome|borrowed|from"; plus nb (borrows) and done */
  run: (day: number, userId: string) => `run:${day}:${userId}`,
  /** lamp board: h{p} holder id, n{p} holder name, f{p} fuel, c{p} fires, b{p} borrows */
  lamps: (day: number) => `lamps:${day}`,
  /** who guided the most keepers today */
  credit: (day: number) => `credit:${day}`,
  plays: (day: number) => `play:${day}`,
  buoys: (day: number) => `buoys:${day}`,
  scores: (day: number) => `scores:${day}`,
  stats: (day: number) => `stats:${day}`,
  shared: (day: number) => `shared:${day}`,
  user: (userId: string) => `user:${userId}`,
  streakBoard: 'lb:streak',
  guidedBoard: 'lb:guided',
  lock: (day: number) => `lock:rollover:${day}`,
} as const;
