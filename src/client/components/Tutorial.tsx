import { useRef, useState } from 'react';
import type { Lamp, Run } from '../../shared/api';
import { PORTS, trace } from '../../shared/beam';
import { Bay, type Flash } from './Bay';
import { BoardFrame } from './BoardFrame';
import { journey } from '../lib/platform';

/**
 * The lesson. Rocks are VISIBLE while each rule is taught (one rule per step, the
 * beam visibly travels), then a tiny test with one hidden rock teaches the most
 * useful trick: two ✕ lines cross on a rock.
 */
type Step = {
  title: string;
  rocks: number[];
  visible: boolean;
  lamps: number[];
  ask: string;
  after: string[];
};

const ROCK_A = 3 * 8 + 4; // row 4, col 5
const ROCK_B = 3 * 8 + 6; // row 4, col 7
const HIDDEN = 5 * 8 + 2; // row 6, col 3

const STEPS: Step[] = [
  {
    title: 'Rule 1 of 3',
    rocks: [ROCK_A],
    visible: true,
    lamps: [4],
    ask: 'This is a rock. In the real game it hides in fog. Tap the glowing lamp to shine at it.',
    after: [
      'The beam hit the rock and died — the lamp now shows ✕. Rule 1: ✕ means the beam hit a rock — usually one on that straight line.',
    ],
  },
  {
    title: 'Rule 2 of 3',
    rocks: [ROCK_A],
    visible: true,
    lamps: [3],
    ask: 'Now the lamp next to it. Watch the beam as it passes the rock.',
    after: [
      'It turned away from the rock and came out on the left. Rule 2: a rock diagonally ahead bends the beam 90° away. Matching numbers mark where it went in and out.',
    ],
  },
  {
    title: 'Rule 3 of 3',
    rocks: [ROCK_A, ROCK_B],
    visible: true,
    lamps: [5],
    ask: 'Two rocks now. Shine the glowing lamp between them.',
    after: [
      'Squeezed between two rocks, it bounced straight back. Rule 3: ↺ means it came back.',
    ],
  },
  {
    title: 'Test',
    rocks: [HIDDEN],
    visible: false,
    lamps: [2, 3 * 8 + 5],
    ask: 'Your turn. One rock is hidden in the fog. Fire the glowing lamp.',
    after: [
      '✕ — so the rock is somewhere in that column. Now fire the next glowing lamp.',
      '✕ again — so it’s somewhere in that row too.',
    ],
  },
];

const DARK: Lamp[] = Array.from({ length: PORTS }, (_, p) => ({
  port: p,
  by: null,
  fuel: 0,
  fires: 0,
  borrows: 0,
}));

export const Tutorial = ({
  onDone,
  onGuided,
}: {
  onDone: () => void;
  /** recommended next step: a practice fog whose first beams show their path */
  onGuided: () => void;
}) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [fired, setFired] = useState(0); // lamps fired within this step
  const [shots, setShots] = useState<Run['shots']>([]);
  const [buoys, setBuoys] = useState<number[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const key = useRef(0);

  const step = STEPS[stepIdx]!;
  const isTest = !step.visible;
  const stepDone = fired >= step.lamps.length;
  const placing = isTest && stepDone;
  const solved = placing && buoys.length === 1 && buoys[0] === HIDDEN;
  const beckon = stepDone ? null : step.lamps[fired]!;

  const onLamp = (p: number) => {
    if (stepDone) return;
    if (p !== beckon) {
      setNote('Tap the glowing lamp.');
      return;
    }
    const outcome = trace(p, step.rocks);
    setShots((s) => [...s, { port: p, outcome, borrowed: false }]);
    if (isTest) {
      key.current++;
      setFlash({ port: p, outcome, key: key.current });
    }
    setNote(step.after[fired] ?? null);
    setFired((f) => f + 1);
    if (stepIdx === 0) journey.interaction('tutorial-start');
  };

  const next = () => {
    const n = stepIdx + 1;
    const nextStep = STEPS[n]!;
    // keep earlier beams only while the rocks are the same (rule 1 -> rule 2)
    if (nextStep.rocks.join() !== step.rocks.join()) setShots([]);
    setStepIdx(n);
    setFired(0);
    setFlash(null);
    setNote(null);
  };

  const onCell = (c: number) => {
    if (!placing || solved) return;
    setBuoys([c]);
    setNote(
      c === HIDDEN
        ? null
        : 'Not there. Find the cell where the top ✕ column meets the left ✕ row.'
    );
  };

  const hint = (() => {
    if (solved)
      return 'Found it! In real games the fog also clears from squares your beams prove empty. Fewer beams = better score.';
    if (note) return note;
    if (placing) return 'Tap the water where the two ✕ lines cross.';
    return step.ask;
  })();

  const showRocks = step.visible ? step.rocks : solved ? [HIDDEN] : null;

  return (
    <main className="game tutorial">
      <header className="topbar">
        <div>
          <h1 className="wordmark small">Lesson</h1>
          <div className="sub">{solved ? 'Done' : step.title}</div>
        </div>
        <button
          className="btn btn-ghost small"
          onClick={() => (journey.interaction('tutorial-skip'), onDone())}
        >
          Skip
        </button>
      </header>

      <BoardFrame max={640} reserve={112}>
        {(size) => (
          <div className="stage" style={{ width: size }}>
            <div style={{ width: size, height: size }}>
              <Bay
                lamps={DARK}
                shots={shots}
                buoys={buoys}
                rocks={showRocks}
                showPaths={Boolean(showRocks)}
                flash={isTest && !solved ? flash : null}
                beckon={beckon}
                interactive={!solved}
                onLamp={onLamp}
                onCell={onCell}
                label={
                  step.visible
                    ? 'Lesson: the fog is lifted so you can see the rocks'
                    : 'Lesson test: one rock hidden'
                }
              />
            </div>
            <p className="hint lesson-hint" aria-live="polite">
              {hint}
            </p>
          </div>
        )}
      </BoardFrame>

      <div className="dock">
        <div className="actions">
          {solved ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => (journey.interaction('tutorial-done'), onDone())}
              >
                Tonight’s fog
              </button>
              <button
                className="btn btn-lamp"
                onClick={() => (
                  journey.interaction('tutorial-guided'),
                  onGuided()
                )}
              >
                Guided practice
              </button>
            </>
          ) : stepDone && !isTest ? (
            <button className="btn btn-lamp" onClick={next}>
              {stepIdx === STEPS.length - 2 ? 'Try it yourself' : 'Next rule'}
            </button>
          ) : (
            <button className="btn btn-lamp" disabled>
              {placing
                ? 'Tap the water to drop a buoy'
                : 'Tap the glowing lamp'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
};
