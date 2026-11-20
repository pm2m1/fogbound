import { memo, useMemo, type KeyboardEvent } from 'react';
import { CELLS, LOST, N, RETURNED, tracePath } from '../../shared/beam';
import type { Lamp, Run } from '../../shared/api';
import {
  ALL_PORTS,
  PAIR_COLORS,
  UNITS,
  cellXY,
  lampName,
  lampXY,
  pointXY,
} from '../lib/geometry';

export type Flash = { port: number; outcome: number; key: number };

type Marker = {
  kind: 'lost' | 'returned' | 'pair';
  pair: number;
  partner?: number;
};

/** Number every landed beam; both ends share the number. */
export const markersFor = (shots: Run['shots']): Map<number, Marker> => {
  const m = new Map<number, Marker>();
  let pair = 0;
  for (const s of shots) {
    if (s.outcome === LOST) m.set(s.port, { kind: 'lost', pair: -1 });
    else if (s.outcome === RETURNED)
      m.set(s.port, { kind: 'returned', pair: -1 });
    else {
      pair++;
      m.set(s.port, { kind: 'pair', pair, partner: s.outcome });
      if (!m.has(s.outcome))
        m.set(s.outcome, { kind: 'pair', pair, partner: s.port });
    }
  }
  return m;
};

const pairColor = (pair: number) =>
  PAIR_COLORS[(pair - 1) % PAIR_COLORS.length]!;

const onKey = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

const Fog = memo(({ thin }: { thin: boolean }) => (
  <g className={`fog ${thin ? 'fog-thin' : ''}`} pointerEvents="none">
    <ellipse
      className="drift a"
      cx="3.2"
      cy="3.4"
      rx="3.6"
      ry="1.7"
      fill="url(#fogPuff)"
    />
    <ellipse
      className="drift b"
      cx="6.8"
      cy="6.2"
      rx="3.9"
      ry="1.9"
      fill="url(#fogPuff)"
    />
    <ellipse
      className="drift c"
      cx="4.6"
      cy="7.6"
      rx="3.2"
      ry="1.4"
      fill="url(#fogPuff)"
    />
    <ellipse
      className="drift d"
      cx="7.2"
      cy="2.6"
      rx="2.8"
      ry="1.3"
      fill="url(#fogPuff)"
    />
    <ellipse
      className="drift e"
      cx="5"
      cy="5"
      rx="4.2"
      ry="2.4"
      fill="url(#fogPuff)"
      opacity="0.6"
    />
  </g>
));
Fog.displayName = 'Fog';

const Rock = ({ cell }: { cell: number }) => {
  const [x, y] = cellXY(cell);
  return (
    <g transform={`translate(${x + 0.5} ${y + 0.5})`} className="rock">
      <path
        d="M-.36 .22 L-.3 -.12 L-.08 -.34 L.2 -.28 L.36 -.02 L.3 .26 L.02 .34 Z"
        fill="#3a4450"
      />
      <path d="M-.3 -.12 L-.08 -.34 L.2 -.28 L.06 -.1 Z" fill="#5d6b78" />
      <path
        d="M-.42 .3 Q0 .44 .42 .3"
        stroke="#bfe3f2"
        strokeWidth=".05"
        fill="none"
        opacity=".55"
      />
    </g>
  );
};

const RockRing = ({ cell }: { cell: number }) => {
  const [x, y] = cellXY(cell);
  return (
    <rect
      x={x + 0.03}
      y={y + 0.03}
      width=".94"
      height=".94"
      rx=".16"
      fill="none"
      stroke="#a6e36b"
      strokeWidth=".06"
      strokeDasharray=".12 .08"
      pointerEvents="none"
    />
  );
};

const Buoy = ({
  cell,
  state,
}: {
  cell: number;
  state: 'plain' | 'right' | 'wrong';
}) => {
  const [x, y] = cellXY(cell);
  return (
    <g
      transform={`translate(${x + 0.5} ${y + 0.52})`}
      className={`buoy ${state}`}
      pointerEvents="none"
    >
      <ellipse cx="0" cy=".2" rx=".26" ry=".07" fill="#0a1520" opacity=".5" />
      <path d="M-.17 .16 L-.12 -.2 L.12 -.2 L.17 .16 Z" fill="#e8513d" />
      <rect x="-.15" y="-.05" width=".3" height=".09" fill="#f6efe6" />
      <rect x="-.025" y="-.36" width=".05" height=".17" fill="#f6efe6" />
      <circle cx="0" cy="-.38" r=".06" fill="#ffd27a" className="buoy-light" />
      {state !== 'plain' && (
        <g transform="translate(.24 -.26)">
          <circle r=".15" fill={state === 'right' ? '#a6e36b' : '#ff6b5e'} />
          <text
            y=".055"
            textAnchor="middle"
            fontSize=".2"
            fontWeight="700"
            fill="#0f1a24"
          >
            {state === 'right' ? '✓' : '✗'}
          </text>
        </g>
      )}
    </g>
  );
};

type Props = {
  lamps: Lamp[];
  shots: Run['shots'];
  buoys: number[];
  selected?: number | null;
  rocks?: number[] | null;
  heat?: Record<string, number> | null;
  heatTotal?: number;
  showPaths?: boolean;
  flash?: Flash | null;
  interactive?: boolean;
  onLamp?: (port: number) => void;
  onCell?: (cell: number) => void;
  /** theory check: does the player's chart explain each beam they used? */
  checks?: Map<number, boolean> | null;
  /** show where the player's chart would send this lamp's beam */
  ghost?: number | null;
  label: string;
};

export const Bay = ({
  lamps,
  shots,
  buoys,
  selected = null,
  rocks = null,
  heat = null,
  heatTotal = 0,
  showPaths = false,
  flash = null,
  interactive = false,
  onLamp,
  onCell,
  checks = null,
  ghost = null,
  label,
}: Props) => {
  const markers = useMemo(() => markersFor(shots), [shots]);
  const revealed = Boolean(rocks);
  const buoySet = useMemo(() => new Set(buoys), [buoys]);
  const rockSet = useMemo(() => new Set(rocks ?? []), [rocks]);
  const paths = useMemo(
    () =>
      showPaths && rocks
        ? shots.map((s) => ({
            s,
            pts: tracePath(s.port, rocks).path.map(pointXY),
          }))
        : [],
    [showPaths, rocks, shots]
  );
  const ghostPts = useMemo(
    () =>
      ghost !== null && !rocks
        ? tracePath(ghost, buoys).path.map(pointXY)
        : null,
    [ghost, buoys, rocks]
  );
  const heatMax = useMemo(
    () => Math.max(1, ...Object.values(heat ?? {})),
    [heat]
  );

  return (
    <svg
      className="bay"
      viewBox={`0 0 ${UNITS} ${UNITS}`}
      role="group"
      aria-label={label}
    >
      <defs>
        <radialGradient id="fogPuff">
          <stop offset="0" stopColor="#c9d8e2" stopOpacity=".55" />
          <stop offset=".6" stopColor="#b8cad6" stopOpacity=".25" />
          <stop offset="1" stopColor="#b8cad6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lampGlow">
          <stop offset="0" stopColor="#ffd27a" stopOpacity=".9" />
          <stop offset=".45" stopColor="#ffb547" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173246" />
          <stop offset="1" stopColor="#10273a" />
        </linearGradient>
      </defs>

      {/* water */}
      <rect x="1" y="1" width={N} height={N} rx=".25" fill="url(#sea)" />
      <g stroke="#2a4c63" strokeWidth=".02" opacity=".9" pointerEvents="none">
        {Array.from({ length: N - 1 }, (_, i) => (
          <g key={i}>
            <line x1={i + 2} y1="1" x2={i + 2} y2={N + 1} />
            <line x1="1" y1={i + 2} x2={N + 1} y2={i + 2} />
          </g>
        ))}
      </g>

      {/* crowd buoys heat (after charting): only cells that drew real attention */}
      {heat &&
        Array.from({ length: CELLS }, (_, c) => {
          const v = heat[String(c)] ?? 0;
          const pct = heatTotal ? Math.round((100 * v) / heatTotal) : 0;
          if (pct < 2) return null;
          const [x, y] = cellXY(c);
          return (
            <g key={c} pointerEvents="none">
              <rect
                x={x + 0.05}
                y={y + 0.05}
                width=".9"
                height=".9"
                rx=".14"
                fill="#ffb547"
                opacity={0.18 + 0.62 * Math.sqrt(v / heatMax)}
              />
              <text
                x={x + 0.5}
                y={y + 0.62}
                textAnchor="middle"
                fontSize=".27"
                fill="#1a1205"
                className="heat-num"
              >
                {pct}%
              </text>
            </g>
          );
        })}

      {revealed && !heat && [...rockSet].map((c) => <Rock key={c} cell={c} />)}
      {revealed &&
        heat &&
        [...rockSet].map((c) => <RockRing key={c} cell={c} />)}

      {/* true beam paths, drawn once the fog lifts */}
      {paths.map(({ s, pts }, i) => {
        const mk = markers.get(s.port);
        const color =
          mk?.kind === 'pair'
            ? pairColor(mk.pair)
            : s.outcome === LOST
              ? '#ff8a7a'
              : '#ffd27a';
        return (
          <polyline
            key={s.port}
            className="truepath"
            style={{ animationDelay: `${300 + i * 260}ms` }}
            points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth=".09"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
          />
        );
      })}

      {!heat &&
        buoys.map((c) => (
          <Buoy
            key={c}
            cell={c}
            state={revealed ? (rockSet.has(c) ? 'right' : 'wrong') : 'plain'}
          />
        ))}

      <Fog thin={revealed} />

      {/* water tap targets */}
      {interactive &&
        Array.from({ length: CELLS }, (_, c) => {
          const [x, y] = cellXY(c);
          const r = Math.floor(c / N) + 1;
          const col = (c % N) + 1;
          return (
            <rect
              key={c}
              x={x}
              y={y}
              width="1"
              height="1"
              className="cell-hit"
              role="button"
              tabIndex={0}
              aria-pressed={buoySet.has(c)}
              aria-label={`Water row ${r} column ${col}${buoySet.has(c) ? ', buoy placed' : ''}`}
              onClick={() => onCell?.(c)}
              onKeyDown={onKey(() => onCell?.(c))}
            />
          );
        })}

      {ghostPts && (
        <polyline
          className="ghostpath"
          points={ghostPts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke="#e9f3ff"
          strokeWidth=".07"
          strokeDasharray=".18 .12"
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {/* the latest beam leaving its lamp */}
      {flash && <FlashBeam key={flash.key} flash={flash} />}

      {/* lamps on the shore */}
      {ALL_PORTS.map((p) => {
        const [x, y] = lampXY(p);
        const lamp = lamps[p];
        const mk = markers.get(p);
        const litByOthers = !mk && lamp && lamp.by !== null && lamp.fuel > 0;
        const isSel = selected === p;
        const state = mk ? mk.kind : litByOthers ? 'lit' : 'dark';
        const chk = checks?.get(p);
        const desc0 =
          mk?.kind === 'lost'
            ? 'beam lost'
            : mk?.kind === 'returned'
              ? 'beam came back'
              : mk?.kind === 'pair'
                ? `beam ${mk.pair}, pairs with ${lampName(mk.partner!)}`
                : litByOthers
                  ? `lit by ${lamp.by}, ${lamp.fuel} oil left`
                  : 'dark';
        const desc =
          chk === undefined
            ? desc0
            : `${desc0}, ${chk ? 'your chart explains it' : 'your chart does not explain it'}`;
        return (
          <g
            key={p}
            className={`lamp ${state} ${isSel ? 'selected' : ''}`}
            transform={`translate(${x + 0.5} ${y + 0.5})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${lampName(p)}, ${desc}` : undefined}
            onClick={interactive ? () => onLamp?.(p) : undefined}
            onKeyDown={interactive ? onKey(() => onLamp?.(p)) : undefined}
          >
            <rect x="-.5" y="-.5" width="1" height="1" fill="transparent" />
            {(litByOthers || isSel) && (
              <circle r=".62" fill="url(#lampGlow)" className="glow" />
            )}
            {isSel && (
              <circle
                r=".42"
                fill="none"
                stroke="#ffe3a8"
                strokeWidth=".05"
                className="sel-ring"
              />
            )}
            <circle
              r=".29"
              fill={
                state === 'dark'
                  ? '#1b2d3c'
                  : state === 'lit'
                    ? '#ffcf73'
                    : '#22384b'
              }
              stroke={
                state === 'dark'
                  ? '#4b6b82'
                  : state === 'lit'
                    ? '#fff0c9'
                    : mk?.kind === 'pair'
                      ? pairColor(mk.pair)
                      : '#7f9db2'
              }
              strokeWidth=".05"
            />
            {mk?.kind === 'pair' && (
              <text
                y=".11"
                textAnchor="middle"
                fontSize=".32"
                fontWeight="700"
                fill={pairColor(mk.pair)}
              >
                {mk.pair}
              </text>
            )}
            {mk?.kind === 'lost' && (
              <path
                d="M-.12 -.12 L.12 .12 M.12 -.12 L-.12 .12"
                stroke="#ff8a7a"
                strokeWidth=".07"
                strokeLinecap="round"
              />
            )}
            {mk?.kind === 'returned' && (
              <g
                fill="none"
                stroke="#ffd27a"
                strokeWidth=".06"
                strokeLinecap="round"
              >
                <path d="M.13 .02 A.13 .13 0 1 1 .03 -.13" />
                <path d="M.03 -.13 L.1 -.2 M.03 -.13 L.11 -.07" />
              </g>
            )}
            {checks?.has(p) && (
              <g transform="translate(.25 -.25)" className="check">
                <circle
                  r=".15"
                  fill={checks.get(p) ? '#a6e36b' : '#ff6b5e'}
                  stroke="#0d1822"
                  strokeWidth=".03"
                />
                <text
                  y=".055"
                  textAnchor="middle"
                  fontSize=".19"
                  fontWeight="800"
                  fill="#0d1822"
                >
                  {checks.get(p) ? '✓' : '✗'}
                </text>
              </g>
            )}
            {litByOthers && (
              <g className="fuel">
                {Array.from({ length: lamp.fuel }, (_, i) => (
                  <circle
                    key={i}
                    cx={-0.14 + i * 0.14}
                    cy=".42"
                    r=".045"
                    fill="#ffd27a"
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/** A short burst of light into the fog — the true path stays secret until the fog lifts. */
const FlashBeam = ({ flash }: { flash: Flash }) => {
  const [x, y] = lampXY(flash.port);
  const side = Math.floor(flash.port / N);
  const [dx, dy] =
    side === 0 ? [0, 1] : side === 1 ? [-1, 0] : side === 2 ? [0, -1] : [1, 0];
  const len = flash.outcome === RETURNED ? 1.2 : 2.6;
  const x0 = x + 0.5;
  const y0 = y + 0.5;
  const exit = flash.outcome >= 0 ? lampXY(flash.outcome) : null;
  return (
    <g pointerEvents="none">
      <line
        className={`flash ${flash.outcome === RETURNED ? 'back' : ''}`}
        x1={x0}
        y1={y0}
        x2={x0 + dx * len}
        y2={y0 + dy * len}
        stroke="#ffe3a8"
        strokeWidth=".16"
        strokeLinecap="round"
        pathLength={1}
      />
      {exit && (
        <circle
          className="arrive"
          cx={exit[0] + 0.5}
          cy={exit[1] + 0.5}
          r=".5"
          fill="url(#lampGlow)"
        />
      )}
      {flash.outcome === LOST && (
        <circle
          className="swallow"
          cx={x0 + dx * len}
          cy={y0 + dy * len}
          r=".35"
          fill="#ff8a7a"
        />
      )}
    </g>
  );
};
