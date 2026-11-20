import type { BeamNote } from './beam';
import type { PublicPuzzle, Shot } from './puzzle';

/** What everyone can see about a lamp today. Outcomes are never public. */
export type Lamp = {
  port: number;
  /** username of the keeper whose oil is in it right now (null = dark) */
  by: string | null;
  /** borrows left before it burns out */
  fuel: number;
  /** total times keepers fired it today */
  fires: number;
  /** total times it was borrowed today */
  borrows: number;
};

export type DayStats = {
  players: number;
  /** keepers who charted every rock */
  perfect: number;
  /** charted every rock at or under par */
  parHits: number;
};

export type MyProfile = {
  streak: number;
  best: number;
  plays: number;
  /** keepers your lamps have guided, all time */
  guided: number;
};

export type Recap = {
  fromDay: number;
  players: number;
  perfect: number;
  /** the keeper whose lamps were borrowed most */
  brightest: { name: string; guided: number } | null;
};

export type Result = {
  ranked: boolean;
  scoreHalf: number;
  wrong: number;
  stars: 0 | 1 | 2 | 3;
  rocks: number[];
  buoys: number[];
  shots: Shot[];
  /** share of keepers you beat (score), 0..100 */
  beatPct: number;
  /** how many keepers put a buoy on each cell */
  buoyHeat: Record<string, number>;
  /** keepers your lamps guided today */
  guidedToday: number;
  /** beam log: how much fog each of your beams cleared vs the expert */
  notes: BeamNote[];
  /** the expert keeper's lamps for this night */
  expertLine: number[];
};

export type Run = {
  shots: (Shot & { from?: string | undefined })[];
  borrowsLeft: number;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string | null;
  loggedIn: boolean;
  number: number;
  isToday: boolean;
  todayPostId: string | null;
  puzzle: PublicPuzzle;
  lamps: Lamp[];
  run: Run;
  result: Result | null;
  stats: DayStats;
  me: MyProfile | null;
  recap: Recap | null;
  nextAt: number;
};

export type FireRequest = { port: number };
export type FireResponse = {
  type: 'fire';
  shot: Shot & { from?: string | undefined };
  lamp: Lamp;
  borrowsLeft: number;
};

export type SubmitRequest = {
  buoys: number[];
  /** unranked play only (logged out / archive): the client's own shots */
  shots?: Shot[];
};
export type SubmitResponse = {
  type: 'submit';
  result: Result;
  stats: DayStats;
  me: MyProfile | null;
};

export type ShareResponse = { type: 'share'; posted: boolean; text: string };

/** Unranked practice fog: rocks are sent up front because nothing is at stake. */
export type PracticeResponse = {
  type: 'practice';
  k: number;
  par: number;
  rocks: number[];
  line: number[];
};

/** Beam log for a finished practice fog. */
export type PracticeLogRequest = { rocks: number[]; ports: number[] };
export type PracticeLogResponse = { type: 'practice-log'; notes: BeamNote[] };

export type ErrorResponse = { status: 'error'; message: string };
