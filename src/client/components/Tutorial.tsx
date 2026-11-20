import { useMemo, useRef, useState } from 'react';
import type { Lamp, Run } from '../../shared/api';
import { PORTS, explains, trace } from '../../shared/beam';
import { Bay, type Flash } from './Bay';
import { BoardFrame } from './BoardFrame';
import { journey } from '../lib/platform';

/** Practice fog: two rocks that demonstrate every rule in three beams. */
const ROCKS = [12, 14]; // row 2 col 5, row 2 col 7
const SCRIPT = [
  {
    port: 4,
    ask: 'Two rocks hide in this practice fog. Tap the glowing lamp to shine a beam in.',
    after:
      'Lost! It hit a rock head-on — so a rock sits somewhere on that line.',
  },
  {
    port: 3,
    ask: 'Now try the lamp next to it.',
    after:
      'It grazed a rock on the diagonal and bent away — light came out at the lamp marked 1.',
  },
  {
    port: 5,
    ask: 'One more — the glowing lamp.',
    after:
      'Squeezed between two rocks, it came straight back (↺). A rock right beside a lamp does that too.',
  },
] as const;

const DARK: Lamp[] = Array.from({ length: PORTS }, (_, p) => ({
  port: p,
  by: null,
  fuel: 0,
  fires: 0,
  borrows: 0,
}));

export const Tutorial = ({ onDone }: { onDone: () => void }) => {
  const [step, setStep] = useState(0);
  const [shots, setShots] = useState<Run['shots']>([]);
  const [buoys, setBuoys] = useState<number[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const key = useRef(0);

  const firing = step < SCRIPT.length;
  const solved =
    buoys.length === ROCKS.length && ROCKS.every((r) => buoys.includes(r));
  const checks = useMemo(
    () =>
      !firing && buoys.length === ROCKS.length
        ? new Map(shots.map((s) => [s.port, explains(buoys, s)] as const))
        : null,
    [firing, buoys, shots]
  );

  const onLamp = (p: number) => {
    if (!firing) return;
    const want = SCRIPT[step]!.port;
    if (p !== want) {
      setNote('Tap the glowing lamp.');
      return;
    }
    const outcome = trace(p, ROCKS);
    setShots((s) => [...s, { port: p, outcome, borrowed: false }]);
    key.current++;
    setFlash({ port: p, outcome, key: key.current });
    setNote(SCRIPT[step]!.after);
    setStep((s) => s + 1);
    if (step === 0) journey.interaction('tutorial-start');
  };

  const onCell = (c: number) => {
    if (firing || solved) return;
    setNote(null);
    setBuoys((b) =>
      b.includes(c)
        ? b.filter((x) => x !== c)
        : b.length < ROCKS.length
          ? [...b, c]
          : b
    );
  };

  const hint = (() => {
    if (solved)
      return 'Both rocks charted. Tonight’s fog hides 4 — and you won’t see the beams’ paths. Fewer beams, better score.';
    if (note && firing) return note;
    if (firing) return SCRIPT[step]!.ask;
    if (buoys.length < ROCKS.length)
      return `${note ? `${note} ` : ''}Now tap the water to drop 2 buoys where the rocks are.`;
    return 'Not quite — a ✗ means your buoys don’t explain that beam. Tap a buoy to lift it.';
  })();

  return (
    <main className="game tutorial">
      <header className="topbar">
        <div>
          <h1 className="wordmark small">Practice fog</h1>
          <div className="sub">
            {firing
              ? `Beam ${step + 1} of 3`
              : solved
                ? 'Done'
                : 'Drop 2 buoys'}
          </div>
        </div>
        <button
          className="btn btn-ghost small"
          onClick={() => (journey.interaction('tutorial-skip'), onDone())}
        >
          Skip
        </button>
      </header>

      <BoardFrame max={640} reserve={64}>
        {(size) => (
          <div className="stage" style={{ width: size }}>
            <div style={{ width: size, height: size }}>
              <Bay
                lamps={DARK}
                shots={shots}
                buoys={buoys}
                rocks={solved ? ROCKS : null}
                pathRocks={ROCKS}
                flash={flash}
                beckon={firing ? SCRIPT[step]!.port : null}
                interactive={!solved}
                onLamp={onLamp}
                onCell={onCell}
                checks={checks}
                label="Practice fog with two hidden rocks"
              />
            </div>
            <p className="hint" aria-live="polite">
              {hint}
            </p>
          </div>
        )}
      </BoardFrame>

      <div className="dock">
        <div className="actions">
          <button
            className="btn btn-lamp"
            disabled={!solved}
            onClick={() => (journey.interaction('tutorial-done'), onDone())}
          >
            {solved ? 'Enter tonight’s fog' : 'Chart the practice fog'}
          </button>
        </div>
      </div>
    </main>
  );
};
