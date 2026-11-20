import type { ReactNode } from 'react';

/** First-run rules card: three tiny diagrams, no wall of text. */
const Mini = ({
  children,
  caption,
}: {
  children: ReactNode;
  caption: string;
}) => (
  <figure className="mini">
    <svg viewBox="0 0 5 3.4" aria-hidden="true">
      <rect x="0" y="0" width="5" height="3.4" rx=".3" fill="#132b3d" />
      {children}
    </svg>
    <figcaption>{caption}</figcaption>
  </figure>
);

const rock = (x: number, y: number) => (
  <path
    transform={`translate(${x} ${y})`}
    d="M-.3 .18 L-.25 -.1 L-.06 -.28 L.17 -.23 L.3 -.02 L.25 .22 L.02 .28 Z"
    fill="#5d6b78"
  />
);

export const Coach = ({ onClose }: { onClose: () => void }) => (
  <div
    className="coach"
    role="dialog"
    aria-modal="true"
    aria-labelledby="coach-title"
  >
    <div className="coach-card">
      <h2 id="coach-title">Rocks hide in the fog</h2>
      <p className="coach-lede">
        Shine lamps from the shore. Watch where the light comes out.
      </p>
      <div className="minis">
        <Mini caption="Head-on: lost">
          <line
            x1=".4"
            y1="1.7"
            x2="2.9"
            y2="1.7"
            stroke="#ffd27a"
            strokeWidth=".12"
            strokeLinecap="round"
          />
          {rock(3.4, 1.7)}
          <path
            d="M2.75 1.45 L3.05 1.95 M3.05 1.45 L2.75 1.95"
            stroke="#ff8a7a"
            strokeWidth=".1"
          />
        </Mini>
        <Mini caption="Passing one: bends away">
          <polyline
            points=".4,2.2 2.5,2.2 2.5,.3"
            fill="none"
            stroke="#ffd27a"
            strokeWidth=".12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {rock(3.5, 2.95)}
        </Mini>
        <Mini caption="Between two: comes back">
          <polyline
            points=".4,1.6 2.4,1.6"
            fill="none"
            stroke="#ffd27a"
            strokeWidth=".12"
            strokeLinecap="round"
          />
          <path d="M1.6 1.85 L1.1 1.85" stroke="#ffd27a" strokeWidth=".1" />
          <path
            d="M1.1 1.85 L1.35 1.65 M1.1 1.85 L1.35 2.05"
            stroke="#ffd27a"
            strokeWidth=".1"
            strokeLinecap="round"
          />
          {rock(3.2, 0.6)}
          {rock(3.2, 2.6)}
        </Mini>
      </div>
      <p className="coach-econ">
        Your lamp costs <b>1</b>. Lamps other keepers lit glow amber — borrow
        their beam for <b>½</b> and they earn the credit.
      </p>
      <button className="btn btn-lamp" onClick={onClose} autoFocus>
        Light the first lamp
      </button>
    </div>
  </div>
);
